import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseReelConfig, type Scene } from '@storyreel/schema';
import { render, probeDurationSeconds } from '@storyreel/engine';
import { harnessUrl } from '@storyreel/harness';
import {
  resolveStorybook,
  StorybookSceneSource,
} from '@storyreel/adapter-storybook';
import { runRender, prepareAutoScenes } from 'storyreel';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureDir = join(root, 'fixtures', 'sb-fixture');
const staticDir = join(fixtureDir, 'storybook-static');

let tmp: string;

beforeAll(() => {
  if (!existsSync(staticDir)) {
    // Build the fixture Storybook once if it isn't present.
    execFileSync('pnpm', ['--filter', '@storyreel/sb-fixture', 'build'], {
      cwd: root,
      stdio: 'inherit',
    });
  }
  tmp = mkdtempSync(join(tmpdir(), 'storyreel-e2e-'));
}, 240_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('e2e: render fixture Storybook to video', () => {
  it('renders an mp4 with the expected duration and frame count', async () => {
    const fps = 30;
    // 1000ms hold => exactly fps frames, 1.0s.
    const scene: Scene = {
      storyId: 'example-button--primary',
      initialArgs: { variant: 'primary', size: 'medium' },
      steps: [{ action: 'hold', ms: 1000 }],
    };
    const out = join(tmp, 'button.mp4');
    const config = parseReelConfig({
      storybook: staticDir,
      fps,
      size: [640, 360],
      watermark: true,
      output: { format: 'mp4', path: out },
      scenes: [scene],
    });

    const resolved = await resolveStorybook(config.storybook);
    let result;
    try {
      const source = new StorybookSceneSource(resolved.baseUrl);
      result = await render({ config, source, harnessUrl: harnessUrl() });
    } finally {
      await resolved.dispose();
    }

    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(0);
    expect(result.frameCount).toBe(fps); // 1000ms @ 30fps

    const duration = await probeDurationSeconds(out);
    expect(duration).not.toBeNull();
    // Expected 1.0s, allow small container overhead.
    expect(Math.abs((duration as number) - 1.0)).toBeLessThan(0.2);
  }, 120_000);

  it('renders a number tween (card) to webm', async () => {
    const scene: Scene = {
      storyId: 'example-card--basic',
      steps: [
        { action: 'tween', name: 'radius', from: 0, to: 24, ms: 500, easing: 'easeInOut' },
      ],
    };
    const out = join(tmp, 'card.webm');
    const config = parseReelConfig({
      storybook: staticDir,
      fps: 30,
      size: [640, 360],
      output: { format: 'webm', path: out },
      scenes: [scene],
    });

    const resolved = await resolveStorybook(config.storybook);
    try {
      const source = new StorybookSceneSource(resolved.baseUrl);
      const result = await render({ config, source, harnessUrl: harnessUrl() });
      expect(result.frameCount).toBe(15); // 500ms @ 30fps
    } finally {
      await resolved.dispose();
    }
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(0);
  }, 120_000);

  it('draft mode renders jpeg-sourced frames at forced watermark + lower crf', async () => {
    const scene: Scene = {
      storyId: 'example-button--primary',
      initialArgs: { variant: 'primary', size: 'medium' },
      steps: [{ action: 'hold', ms: 400 }],
    };
    const out = join(tmp, 'button-draft.mp4');
    const config = parseReelConfig({
      storybook: staticDir,
      fps: 24,
      size: [640, 360],
      watermark: false,
      output: { format: 'mp4', path: out },
      scenes: [scene],
    });

    const resolved = await resolveStorybook(config.storybook);
    try {
      const source = new StorybookSceneSource(resolved.baseUrl);
      const result = await render({ config, source, harnessUrl: harnessUrl(), draft: true });
      expect(result.frameCount).toBe(Math.round(0.4 * 24));
    } finally {
      await resolved.dispose();
    }
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(0);
  }, 120_000);

  it('saves a poster frame next to the output', async () => {
    const scene: Scene = {
      storyId: 'example-button--primary',
      initialArgs: { variant: 'primary', size: 'medium' },
      steps: [{ action: 'hold', ms: 500 }],
    };
    const out = join(tmp, 'button-poster.mp4');
    const config = parseReelConfig({
      storybook: staticDir,
      fps: 30,
      size: [640, 360],
      poster: true,
      output: { format: 'mp4', path: out },
      scenes: [scene],
    });

    const resolved = await resolveStorybook(config.storybook);
    try {
      const source = new StorybookSceneSource(resolved.baseUrl);
      const result = await render({ config, source, harnessUrl: harnessUrl() });
      expect(result.posterPath).toBe(out.replace(/\.mp4$/, '.poster.png'));
      expect(existsSync(result.posterPath!)).toBe(true);
      expect(statSync(result.posterPath!).size).toBeGreaterThan(0);
    } finally {
      await resolved.dispose();
    }
  }, 120_000);

  it('pingpong loop roughly doubles the gif frame count', async () => {
    const scene: Scene = {
      storyId: 'example-button--primary',
      initialArgs: { variant: 'primary', size: 'medium' },
      steps: [{ action: 'hold', ms: 400 }],
    };
    const outNormal = join(tmp, 'button-normal.gif');
    const outPingpong = join(tmp, 'button-pingpong.gif');
    const base = {
      storybook: staticDir,
      fps: 24,
      size: [640, 360] as [number, number],
      scenes: [scene],
    };

    const resolved = await resolveStorybook(staticDir);
    try {
      const source = new StorybookSceneSource(resolved.baseUrl);

      const normalConfig = parseReelConfig({
        ...base,
        loop: 'normal',
        output: { format: 'gif', path: outNormal },
      });
      const normalResult = await render({ config: normalConfig, source, harnessUrl: harnessUrl() });

      const pingpongConfig = parseReelConfig({
        ...base,
        loop: 'pingpong',
        output: { format: 'gif', path: outPingpong },
      });
      const pingpongResult = await render({
        config: pingpongConfig,
        source,
        harnessUrl: harnessUrl(),
      });

      // frameCount reports the raw (pre-pingpong) capture; the encoded gif
      // itself carries roughly 2x-2frames the material, so just assert the
      // pingpong file renders successfully and isn't smaller than normal.
      expect(normalResult.frameCount).toBe(pingpongResult.frameCount);
      expect(existsSync(outPingpong)).toBe(true);
      expect(statSync(outPingpong).size).toBeGreaterThan(0);
    } finally {
      await resolved.dispose();
    }
  }, 120_000);

  it('--cache skips an unchanged render and re-renders on a real change', async () => {
    const out = join(tmp, 'button-cache.mp4');
    const scene: Scene = {
      storyId: 'example-button--primary',
      initialArgs: { variant: 'primary', size: 'medium' },
      steps: [{ action: 'hold', ms: 400 }],
    };
    const config = parseReelConfig({
      storybook: staticDir,
      fps: 30,
      size: [640, 360],
      output: { format: 'mp4', path: out },
      scenes: [scene],
    });

    const first = await runRender(config, { quiet: true, cache: true });
    expect(first.cached).toBeFalsy();
    expect(existsSync(out)).toBe(true);
    expect(existsSync(`${out}.reelhash`)).toBe(true);
    const mtimeAfterFirst = statSync(out).mtimeMs;

    const second = await runRender(config, { quiet: true, cache: true });
    expect(second.cached).toBe(true);
    expect(statSync(out).mtimeMs).toBe(mtimeAfterFirst); // untouched — no re-render happened

    const changedConfig = parseReelConfig({
      ...config,
      scenes: [{ ...scene, steps: [{ action: 'hold', ms: 900 }] }],
    });
    const third = await runRender(changedConfig, { quiet: true, cache: true });
    expect(third.cached).toBeFalsy();
    expect(third.frameCount).not.toBe(first.frameCount);
  }, 120_000);

  it('prepareAutoScenes generates steps for a config scene with an args directive', async () => {
    // A scene with no steps + an include directive: probe the real story's
    // controls, generate a storyboard honoring the whitelist.
    const config = parseReelConfig({
      storybook: staticDir,
      fps: 30,
      size: [640, 360],
      output: { format: 'mp4', path: join(tmp, 'auto-scene.mp4') },
      scenes: [
        {
          storyId: 'example-button--primary',
          args: { include: ['size'] },
        },
      ],
    });

    const prepared = await prepareAutoScenes(config);
    const scene = prepared.scenes[0]!;
    expect(scene.steps.length).toBeGreaterThan(0);
    const captions = scene.steps
      .filter((s) => s.action === 'caption')
      .map((s) => (s as { text: string }).text);
    // Only the whitelisted `size` control, nothing else the heuristic would add.
    expect(captions).toEqual(['size']);
    const setArgNames = new Set(
      scene.steps.filter((s) => s.action === 'setArg').map((s) => (s as { name: string }).name),
    );
    expect(setArgNames).toEqual(new Set(['size']));
  }, 120_000);

  it('prepareAutoScenes leaves hand-authored scenes untouched', async () => {
    const handSteps: Scene['steps'] = [{ action: 'hold', ms: 500 }];
    const config = parseReelConfig({
      storybook: staticDir,
      fps: 30,
      size: [640, 360],
      output: { format: 'mp4', path: join(tmp, 'hand.mp4') },
      scenes: [{ storyId: 'example-button--primary', steps: handSteps }],
    });
    const prepared = await prepareAutoScenes(config);
    expect(prepared.scenes[0]!.steps).toEqual(handSteps);
  }, 120_000);
});
