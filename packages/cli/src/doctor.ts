import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { ffmpegPath } from '@storyreel/engine';
import { harnessUrl } from '@storyreel/harness';
import {
  resolveStorybook,
  fetchIndex,
  listStories,
  autoStoryboard,
  StorybookSceneSource,
} from '@storyreel/adapter-storybook';

const MAX_PROBE_STORIES = 30;

/**
 * Environment check: does storyreel have what it needs (ffmpeg, Chrome, a
 * reachable Storybook), and which stories will produce a good auto-storyboard.
 * Most support tickets for tools like this are "can't find my Storybook" —
 * this catches that before the user has to file one.
 */
export async function runDoctor(storybook: string): Promise<boolean> {
  let ok = true;
  console.log('storyreel doctor');
  console.log('');

  try {
    const bin = ffmpegPath();
    console.log(`✓ ffmpeg found: ${bin}`);
  } catch (err) {
    ok = false;
    console.log(`✗ ffmpeg not found: ${(err as Error).message}`);
  }

  try {
    const exe = chromium.executablePath();
    if (exe && existsSync(exe)) {
      console.log(`✓ Chrome found: ${exe}`);
    } else {
      ok = false;
      console.log(`✗ Chrome not found at "${exe}". Run "npx playwright install chromium".`);
    }
  } catch (err) {
    ok = false;
    console.log(`✗ Chrome check failed: ${(err as Error).message}`);
  }

  console.log('');

  let resolved;
  try {
    resolved = await resolveStorybook(storybook);
  } catch (err) {
    console.log(`✗ Storybook not found at "${storybook}": ${(err as Error).message}`);
    return false;
  }

  try {
    let stories;
    try {
      const index = await fetchIndex(resolved.baseUrl);
      stories = listStories(index);
    } catch (err) {
      console.log(`✗ Could not read Storybook index at ${resolved.baseUrl}: ${(err as Error).message}`);
      return false;
    }
    console.log(`✓ Storybook found at ${resolved.baseUrl} (${stories.length} stories)`);
    console.log('');

    if (stories.length === 0) return ok;

    const sample = stories.slice(0, MAX_PROBE_STORIES);
    const suffix = stories.length > sample.length ? ` (first ${sample.length})` : '';
    console.log(`Auto-storyboard readiness${suffix}:`);

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
      const source = new StorybookSceneSource(resolved.baseUrl);

      for (const story of sample) {
        try {
          await source.mount(page, { storyId: story.id, steps: [] });
          const controls = await source.getControlsMeta({ storyId: story.id, steps: [] });
          const scene = autoStoryboard(story.id, story.name, controls);
          console.log(`  ${describeReadiness(story.id, scene)}`);
        } catch (err) {
          console.log(`  ${story.id}: ✗ ${(err as Error).message}`);
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await resolved.dispose();
  }

  console.log('');
  console.log(ok ? '✓ environment looks good.' : '✗ issues found above — fix them before rendering.');
  return ok;
}

function describeReadiness(
  storyId: string,
  scene: { steps: { action: string; ms?: number; name?: string }[] },
): string {
  const animatedNames = new Set(
    scene.steps
      .filter((s) => s.action === 'setArg' || s.action === 'tween')
      .map((s) => s.name!),
  );
  if (animatedNames.size === 0) {
    return `${storyId}: static (no animatable controls)`;
  }
  const durationMs = scene.steps.reduce((sum, s) => {
    if (s.action === 'hold' || s.action === 'caption' || s.action === 'tween') {
      return sum + (s.ms ?? 0);
    }
    return sum;
  }, 0);
  return `${storyId}: ${animatedNames.size} controls, ~${(durationMs / 1000).toFixed(1)}s`;
}
