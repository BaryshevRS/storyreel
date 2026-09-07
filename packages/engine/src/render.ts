import { mkdtemp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type CDPSession, type Page } from 'playwright';
import type { ControlMeta, InitMessage, Scene } from '@storyreel/schema';
import { compileTimeline, type Frame } from './timeline.js';
import { encodeFrames, probeDurationSeconds } from './ffmpeg.js';
import type { RenderOptions, RenderResult } from './types.js';

const MOUNT_TIMEOUT_MS = 10_000;
const DRAFT_JPEG_QUALITY = 80;
/** Draft mp4/webm crf, looser than the default (see ffmpeg.ts DEFAULT_CRF) for a 4-6x faster encode. */
const DRAFT_CRF: Record<'mp4' | 'webm', number> = { mp4: 28, webm: 36 };

/**
 * Render every scene in the config into a single concatenated frame sequence,
 * then encode to the requested format. For the MVP a config drives one output
 * file; multiple scenes are rendered back-to-back into that file.
 */
export async function render(opts: RenderOptions): Promise<RenderResult> {
  const { config, source, harnessUrl } = opts;
  const [width, height] = config.size;
  const frameExt = opts.draft ? 'jpg' : 'png';

  const tmpRoot = await mkdtemp(join(tmpdir(), 'storyreel-'));
  const framesDir = join(tmpRoot, 'frames');
  await mkdir(framesDir, { recursive: true });

  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    args: ['--headless=new', '--force-color-profile=srgb', '--hide-scrollbars'],
  });

  let frameIndex = 0;
  const totalFrames = config.scenes
    .map((s) => compileTimeline(s, config.fps).frames.length)
    .reduce((a, b) => a + b, 0);
  const startedAt = Date.now();

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (let sceneIndex = 0; sceneIndex < config.scenes.length; sceneIndex++) {
      const scene = config.scenes[sceneIndex]!;
      frameIndex = await renderScene({
        page,
        scene,
        sceneIndex,
        opts,
        harnessUrl,
        framesDir,
        frameExt,
        width,
        height,
        source,
        frameIndex,
        totalFrames,
        startedAt,
      });
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const rawFrameCount = frameIndex;
  let posterPath: string | undefined;
  if (config.poster) {
    posterPath = await savePoster(config, framesDir, frameExt, rawFrameCount);
  }

  if (config.loop === 'pingpong' && config.output.format !== 'mp4') {
    frameIndex = await duplicateReversed(framesDir, frameIndex, frameExt);
  }

  // Encode.
  const framePattern = join(framesDir, `frame-%06d.${frameExt}`);
  const format = config.output.format;
  const crf =
    opts.draft && (format === 'mp4' || format === 'webm') ? DRAFT_CRF[format] : undefined;
  await encodeFrames({
    framePattern,
    fps: config.fps,
    format,
    outPath: config.output.path,
    crf,
  });

  const durationSeconds =
    (await probeDurationSeconds(config.output.path)) ?? rawFrameCount / config.fps;

  if (!opts.keepFrames) {
    await rm(tmpRoot, { recursive: true, force: true });
  }

  return {
    outputPath: config.output.path,
    frameCount: rawFrameCount,
    durationSeconds,
    posterPath,
  };
}

function frameFileName(index: number, ext: string): string {
  return `frame-${String(index).padStart(6, '0')}.${ext}`;
}

/**
 * Pick one representative frame and copy it next to the output as
 * `<output>.poster.<ext>`. Default: 40% into the render (an in-motion but not
 * jarring moment); `poster: { at: ms }` picks an explicit time instead.
 */
async function savePoster(
  config: RenderOptions['config'],
  framesDir: string,
  frameExt: string,
  frameCount: number,
): Promise<string | undefined> {
  if (frameCount === 0) return undefined;
  const lastIndex = frameCount - 1;
  const atMs =
    typeof config.poster === 'object' ? config.poster.at : 0.4 * (lastIndex / config.fps) * 1000;
  const index = Math.max(0, Math.min(lastIndex, Math.round((atMs / 1000) * config.fps)));

  const posterPath = config.output.path.replace(/\.[^.]+$/, `.poster.${frameExt}`);
  await copyFile(join(framesDir, frameFileName(index, frameExt)), posterPath);
  return posterPath;
}

/**
 * Append the frame sequence reversed (excluding both endpoints, so the loop
 * doesn't stutter on a doubled frame) for a seamless boomerang gif/webm.
 */
async function duplicateReversed(
  framesDir: string,
  frameCount: number,
  frameExt: string,
): Promise<number> {
  let next = frameCount;
  for (let i = frameCount - 2; i > 0; i--) {
    await copyFile(
      join(framesDir, frameFileName(i, frameExt)),
      join(framesDir, frameFileName(next, frameExt)),
    );
    next++;
  }
  return next;
}

/** Max controls the harness panel can show without clipping. */
const PANEL_MAX_CONTROLS = 8;

/**
 * Choose which controls to show in the panel. Real libraries expose a dozen+
 * argTypes; showing them all clips the panel. Prefer the controls the scene
 * actually animates (steps + initialArgs), fall back to the full list, cap at
 * PANEL_MAX_CONTROLS.
 */
function pickPanelControls(controls: ControlMeta[], scene: Scene): ControlMeta[] {
  const used = new Set<string>(Object.keys(scene.initialArgs ?? {}));
  for (const step of scene.steps) {
    if (step.action === 'setArg' || step.action === 'tween') used.add(step.name);
  }
  const animated = controls.filter((c) => used.has(c.name));
  const base = animated.length > 0 ? animated : controls;
  return base.slice(0, PANEL_MAX_CONTROLS);
}

interface RenderSceneCtx {
  page: Page;
  scene: Scene;
  sceneIndex: number;
  opts: RenderOptions;
  harnessUrl: string;
  framesDir: string;
  frameExt: string;
  width: number;
  height: number;
  source: RenderOptions['source'];
  frameIndex: number;
  totalFrames: number;
  startedAt: number;
}

async function renderScene(ctx: RenderSceneCtx): Promise<number> {
  const {
    page,
    scene,
    sceneIndex,
    opts,
    harnessUrl,
    framesDir,
    frameExt,
    width,
    height,
    source,
    totalFrames,
    startedAt,
  } = ctx;
  const { config } = opts;
  let frameIndex = ctx.frameIndex;

  const timeline = compileTimeline(scene, config.fps);

  // Fresh harness load per scene (avoids cross-scene state bleed).
  await page.goto(harnessUrl, { waitUntil: 'load' });

  // Mount the story into the harness iframe (adapter-specific). Must happen
  // before reading controls — the adapter extracts argTypes from the live frame.
  await withTimeout(
    source.mount(page, scene),
    MOUNT_TIMEOUT_MS,
    `Story "${scene.storyId}" did not render within ${MOUNT_TIMEOUT_MS}ms`,
  );

  const controls = pickPanelControls(await source.getControlsMeta(scene), scene);
  const initialValues = source.getInitialValues
    ? await source.getInitialValues(scene)
    : {};
  const initMsg: InitMessage = {
    type: 'init',
    theme: config.theme,
    controls,
    showArgsPanel: config.showArgsPanel,
    watermark: config.watermark,
    size: config.size,
    values: { ...initialValues, ...(scene.initialArgs ?? {}) },
  };
  await page.evaluate((msg) => {
    // @ts-expect-error injected global
    window.__STORYREEL__.init(msg);
  }, initMsg);

  // Wait for fonts before freezing time (else first frames use fallback fonts).
  await page.evaluate(() => (document as Document).fonts.ready);

  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

  let virtualElapsed = 0;
  try {
    for (const frame of timeline.frames) {
      await applyFrame(page, source, frame);
      await advanceVirtualTime(client, timeline.frameMs);
      virtualElapsed += timeline.frameMs;
      // Pin internal CSS animations to the scene clock so a re-render from an
      // arg change can't restart them mid-frame.
      if (source.syncAnimations) await source.syncAnimations(page, virtualElapsed);
      await captureFrame(client, framesDir, frameIndex, width, height, frameExt);

      frameIndex++;
      if (opts.onProgress) {
        const elapsed = Date.now() - startedAt;
        const per = frameIndex > 0 ? elapsed / frameIndex : 0;
        opts.onProgress({
          sceneIndex,
          sceneCount: config.scenes.length,
          storyId: scene.storyId,
          frame: frameIndex,
          totalFrames,
          etaMs: Math.max(0, per * (totalFrames - frameIndex)),
        });
      }
    }
  } finally {
    await client.detach().catch(() => {});
  }

  return frameIndex;
}

async function applyFrame(
  page: Page,
  source: RenderOptions['source'],
  frame: Frame,
): Promise<void> {
  // Order matters: state first, then time advance, then screenshot.
  await source.applyState(page, frame.args);
  await page.evaluate((f) => {
    // @ts-expect-error injected global
    window.__STORYREEL__.update({
      activeControl: f.activeControl,
      values: f.args,
      caption: f.caption,
    });
  }, frame);
}

function advanceVirtualTime(client: CDPSession, budgetMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onExpired = () => {
      client.off('Emulation.virtualTimeBudgetExpired', onExpired);
      resolve();
    };
    client.on('Emulation.virtualTimeBudgetExpired', onExpired);
    client
      .send('Emulation.setVirtualTimePolicy', {
        policy: 'advance',
        budget: budgetMs,
      })
      .catch((err) => {
        client.off('Emulation.virtualTimeBudgetExpired', onExpired);
        reject(err);
      });
  });
}

async function captureFrame(
  client: CDPSession,
  framesDir: string,
  index: number,
  width: number,
  height: number,
  frameExt: string,
): Promise<void> {
  const isJpeg = frameExt === 'jpg';
  const { data } = await client.send('Page.captureScreenshot', {
    format: isJpeg ? 'jpeg' : 'png',
    ...(isJpeg ? { quality: DRAFT_JPEG_QUALITY } : {}),
    clip: { x: 0, y: 0, width, height, scale: 1 },
    captureBeyondViewport: false,
  });
  await writeFile(join(framesDir, frameFileName(index, frameExt)), Buffer.from(data, 'base64'));
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
