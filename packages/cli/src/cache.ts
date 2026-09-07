import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ReelConfig } from '@storyreel/schema';

const isHttp = (s: string) => /^https?:\/\//i.test(s);

/**
 * Fingerprint a local static Storybook build by walking every file's
 * (relative path, size, mtime) — cheap (no content reads) and reliable in
 * practice, since `storybook build` content-hashes changed asset chunk names.
 * For an http(s) dev server there's no reliable staleness signal — the
 * component could have changed with no way to detect it — so this returns
 * null and the caller falls back to config-only cache keys for that case.
 */
async function sourceFingerprint(storybook: string): Promise<string | null> {
  if (isHttp(storybook)) return null;

  const entries: string[] = [];
  async function walk(dir: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else {
        const st = await stat(full);
        entries.push(`${relative(storybook, full)}:${st.size}:${st.mtimeMs}`);
      }
    }
  }

  await walk(storybook);
  if (entries.length === 0) return null;
  entries.sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

/**
 * Cache key for a fully-resolved render: everything that determines the
 * output's pixels (scenes, theme, size, fps, format, watermark, loop, poster)
 * plus a best-effort fingerprint of the component source. Compute this on the
 * *effective* config (after draft/loop policy), not the raw input —
 * a --draft render and a full-res render must never collide.
 */
export async function computeCacheKey(config: ReelConfig): Promise<string> {
  const src = await sourceFingerprint(config.storybook);
  const payload = {
    src,
    scenes: config.scenes,
    theme: config.theme,
    size: config.size,
    fps: config.fps,
    format: config.output.format,
    showArgsPanel: config.showArgsPanel,
    watermark: config.watermark,
    loop: config.loop,
    poster: config.poster,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function sidecarPath(outputPath: string): string {
  return `${outputPath}.reelhash`;
}

export async function readCachedHash(outputPath: string): Promise<string | null> {
  try {
    return (await readFile(sidecarPath(outputPath), 'utf8')).trim();
  } catch {
    return null;
  }
}

export async function writeCacheHash(outputPath: string, hash: string): Promise<void> {
  await writeFile(sidecarPath(outputPath), hash, 'utf8');
}

/** Find the poster saved alongside an output, whichever extension it used (png, or jpg in draft). */
export function findExistingPoster(outputPath: string): string | undefined {
  for (const ext of ['png', 'jpg']) {
    const candidate = outputPath.replace(/\.[^.]+$/, `.poster.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function outputExists(outputPath: string): boolean {
  return existsSync(outputPath);
}
