import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { OutputFormat } from '@storyreel/schema';

const require = createRequire(import.meta.url);

/** Resolve the bundled ffmpeg binary path from ffmpeg-static. */
export function ffmpegPath(): string {
  // ffmpeg-static's default export is the path string.
  const p = require('ffmpeg-static') as string | null;
  if (!p) {
    throw new Error(
      'ffmpeg-static did not resolve a binary for this platform. ' +
        'Ensure @storyreel/engine dependencies are installed.',
    );
  }
  return p;
}

export interface EncodeOptions {
  framePattern: string; // e.g. /tmp/xxx/frame-%06d.png
  fps: number;
  format: OutputFormat;
  outPath: string;
  /** Override the mp4/webm quality factor (lower = better). Used by --draft for faster encodes. */
  crf?: number;
}

/** GIF is capped at 24fps regardless of the requested fps (see PLAN). */
export const GIF_MAX_FPS = 24;

const DEFAULT_CRF: Record<'mp4' | 'webm', number> = { mp4: 18, webm: 30 };

function buildArgs(opts: EncodeOptions): string[][] {
  const { framePattern, fps, format, outPath } = opts;
  const input = ['-framerate', String(fps), '-i', framePattern];

  switch (format) {
    case 'mp4':
      return [
        [
          '-y',
          ...input,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          String(opts.crf ?? DEFAULT_CRF.mp4),
          '-movflags',
          '+faststart',
          outPath,
        ],
      ];
    case 'webm':
      return [
        [
          '-y',
          ...input,
          '-c:v',
          'libvpx-vp9',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          String(opts.crf ?? DEFAULT_CRF.webm),
          '-b:v',
          '0',
          outPath,
        ],
      ];
    case 'gif': {
      const gifFps = Math.min(fps, GIF_MAX_FPS);
      // Two-pass: palettegen then paletteuse for high-quality gifs.
      const filter = `fps=${gifFps},scale=iw:ih:flags=lanczos`;
      return [
        [
          '-y',
          '-framerate',
          String(fps),
          '-i',
          framePattern,
          '-vf',
          `${filter},palettegen=stats_mode=diff`,
          `${outPath}.palette.png`,
        ],
        [
          '-y',
          '-framerate',
          String(fps),
          '-i',
          framePattern,
          '-i',
          `${outPath}.palette.png`,
          '-lavfi',
          `${filter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
          outPath,
        ],
      ];
    }
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg exited with code ${code}.\nCommand: ffmpeg ${args.join(' ')}\n${stderr.trim()}`,
          ),
        );
    });
  });
}

/** Encode a directory of numbered PNG frames into the requested video format. */
export async function encodeFrames(opts: EncodeOptions): Promise<void> {
  const bin = ffmpegPath();
  const passes = buildArgs(opts);
  for (const args of passes) {
    await runFfmpeg(bin, args);
  }
  if (opts.format === 'gif') {
    // Best-effort cleanup of the intermediate palette.
    const { rm } = await import('node:fs/promises');
    await rm(`${opts.outPath}.palette.png`, { force: true });
  }
}

/** Probe a produced video's duration in seconds using ffmpeg (stderr parse). */
export async function probeDurationSeconds(path: string): Promise<number | null> {
  const bin = ffmpegPath();
  return new Promise((resolve) => {
    const child = spawn(bin, ['-i', path], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      const h = Number(m[1]);
      const min = Number(m[2]);
      const s = Number(m[3]);
      resolve(h * 3600 + min * 60 + s);
    });
  });
}
