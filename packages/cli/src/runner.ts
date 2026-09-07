import { chromium } from 'playwright';
import { parseReelConfig, type ControlMeta, type ReelConfig, type Scene, type Size } from '@storyreel/schema';
import {
  render,
  compileTimeline,
  probeDurationSeconds,
  type RenderProgress,
  type RenderResult,
} from '@storyreel/engine';
import { harnessUrl } from '@storyreel/harness';
import {
  resolveStorybook,
  fetchIndex,
  findStory,
  autoStoryboard,
  StorybookSceneSource,
} from '@storyreel/adapter-storybook';
import { renderProgressLine } from './progress.js';
import { computeCacheKey, readCachedHash, writeCacheHash, findExistingPoster, outputExists } from './cache.js';

const DRAFT_MAX_HEIGHT = 720;
const DRAFT_FPS = 24;

/** 720p/24fps/forced-watermark preview: draft always trades fidelity for a 4-6x faster render. */
function applyDraftOverrides(config: ReelConfig): ReelConfig {
  const [w, h] = config.size;
  let size: Size = config.size;
  if (h > DRAFT_MAX_HEIGHT) {
    const scaledW = Math.round((w * DRAFT_MAX_HEIGHT) / h);
    size = [scaledW % 2 === 0 ? scaledW : scaledW + 1, DRAFT_MAX_HEIGHT];
  }
  return parseReelConfig({ ...config, size, fps: DRAFT_FPS, watermark: true });
}

/** Boomerang only reorders frames — meaningless for mp4, which has no seamless-loop concept. */
function applyLoopPolicy(config: ReelConfig): { config: ReelConfig; note?: string } {
  if (config.loop === 'pingpong' && config.output.format === 'mp4') {
    return {
      config: { ...config, loop: 'normal' },
      note: '--loop pingpong ignored for mp4 (only gif/webm loop)',
    };
  }
  return { config };
}

export interface RunRenderResult extends RenderResult {
  /** The config actually rendered with, after draft/loop policy — use this (not the
   * input config) for anything reported back to the user, e.g. the embed snippet's fps/size. */
  effectiveConfig: ReelConfig;
  /** True when --cache found a matching, still-fresh output and skipped rendering. */
  cached?: boolean;
}

/** Full render pipeline for a validated config. */
export async function runRender(
  config: ReelConfig,
  opts: { quiet?: boolean; draft?: boolean; cache?: boolean } = {},
): Promise<RunRenderResult> {
  const draftConfig = opts.draft ? applyDraftOverrides(config) : config;
  const { config: effective, note: loopNote } = applyLoopPolicy(draftConfig);
  if (loopNote && !opts.quiet) console.error(`ℹ ${loopNote}`);

  const cacheKey = opts.cache ? await computeCacheKey(effective) : null;
  if (cacheKey && outputExists(effective.output.path)) {
    const cached = await readCachedHash(effective.output.path);
    if (cached === cacheKey) {
      if (!opts.quiet) console.error(`ℹ cache hit: ${effective.output.path} unchanged, skipping render`);
      const frameCount = effective.scenes
        .map((s) => compileTimeline(s, effective.fps).frames.length)
        .reduce((a, b) => a + b, 0);
      const durationSeconds =
        (await probeDurationSeconds(effective.output.path)) ?? frameCount / effective.fps;
      return {
        outputPath: effective.output.path,
        frameCount,
        durationSeconds,
        posterPath: findExistingPoster(effective.output.path),
        effectiveConfig: effective,
        cached: true,
      };
    }
  }

  const resolved = await resolveStorybook(effective.storybook);
  try {
    // Validate story ids up front for readable errors.
    const index = await fetchIndex(resolved.baseUrl);
    for (const scene of effective.scenes) {
      if (!findStory(index, scene.storyId)) {
        throw new Error(
          `Story "${scene.storyId}" not found in Storybook index. ` +
            `Run "storyreel list" to see available stories.`,
        );
      }
    }

    const source = new StorybookSceneSource(resolved.baseUrl);
    const result = await render({
      config: effective,
      source,
      harnessUrl: harnessUrl(),
      onProgress: opts.quiet ? undefined : printProgress,
      draft: opts.draft,
    });
    if (!opts.quiet) process.stderr.write('\n');
    if (cacheKey) await writeCacheHash(effective.output.path, cacheKey);
    return { ...result, effectiveConfig: effective };
  } finally {
    await resolved.dispose();
  }
}

let lastProgressLen = 0;
function printProgress(p: RenderProgress): void {
  const line = renderProgressLine(p);
  const pad = line.length < lastProgressLen ? ' '.repeat(lastProgressLen - line.length) : '';
  process.stderr.write(`\r${line}${pad}`);
  lastProgressLen = line.length;
}

/**
 * Resolve any auto-storyboard scenes (those with no explicit `steps`) by
 * probing each story's controls and generating steps with the config's
 * timings/maxControls/maxDuration and the scene's own `args` directive. Scenes
 * that already carry hand-authored steps are passed through untouched. Probing
 * reuses one browser across all auto-scenes.
 */
export async function prepareAutoScenes(config: ReelConfig): Promise<ReelConfig> {
  const autoScenes = config.scenes.filter((s) => s.steps.length === 0);
  if (autoScenes.length === 0) return config;

  const resolved = await resolveStorybook(config.storybook);
  const browser = await chromium.launch({ headless: true });
  try {
    const index = await fetchIndex(resolved.baseUrl);
    const page = await browser.newPage();
    await page.goto(harnessUrl(), { waitUntil: 'load' });
    await page.evaluate(() => {
      // @ts-expect-error injected global
      window.__STORYREEL__.init({
        theme: 'gradient-dusk',
        controls: [],
        showArgsPanel: false,
        watermark: false,
        size: [1280, 720],
      });
    });
    const source = new StorybookSceneSource(resolved.baseUrl);

    const scenes: Scene[] = [];
    for (const scene of config.scenes) {
      if (scene.steps.length > 0) {
        scenes.push(scene);
        continue;
      }
      const entry = findStory(index, scene.storyId);
      if (!entry) {
        throw new Error(
          `Story "${scene.storyId}" not found in Storybook index. ` +
            `Run "storyreel list" to see available stories.`,
        );
      }
      await source.mount(page, { storyId: entry.id, steps: [] });
      const controls = await source.getControlsMeta({ storyId: entry.id, steps: [] });
      const generated = autoStoryboard(entry.id, entry.name, controls, {
        timings: config.timings,
        maxControls: config.maxControls,
        maxDuration: config.maxDuration,
        selection: scene.args,
      });
      scenes.push({ ...scene, storyId: entry.id, steps: generated.steps });
    }
    return { ...config, scenes };
  } finally {
    await browser.close();
    await resolved.dispose();
  }
}

/**
 * Launch a browser, mount a story, and read its control metadata (used by the
 * `record` command to auto-generate a storyboard).
 */
export async function probeControls(
  baseUrl: string,
  storyId: string,
): Promise<{ controls: ControlMeta[] }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(harnessUrl(), { waitUntil: 'load' });
    await page.evaluate(() => {
      // @ts-expect-error injected global
      window.__STORYREEL__.init({
        theme: 'gradient-dusk',
        controls: [],
        showArgsPanel: false,
        watermark: false,
        size: [1280, 720],
      });
    });
    const source = new StorybookSceneSource(baseUrl);
    const scene: Scene = { storyId, steps: [] };
    await source.mount(page, scene);
    const controls = await source.getControlsMeta(scene);
    return { controls };
  } finally {
    await browser.close();
  }
}

export { resolveStorybook, fetchIndex, findStory };
