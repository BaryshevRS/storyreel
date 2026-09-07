import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseReelConfig, type ReelConfig } from '@storyreel/schema';
import { computeCacheKey } from './cache.js';

function baseConfig(storybook: string, overrides: Partial<ReelConfig> = {}): ReelConfig {
  return parseReelConfig({
    storybook,
    fps: 30,
    size: [640, 360],
    output: { format: 'mp4', path: 'out.mp4' },
    scenes: [{ storyId: 'example-button--primary', steps: [{ action: 'hold', ms: 500 }] }],
    ...overrides,
  });
}

describe('computeCacheKey (http storybook — config-only)', () => {
  const storybook = 'http://localhost:6006';

  it('is deterministic for an identical config', async () => {
    const a = await computeCacheKey(baseConfig(storybook));
    const b = await computeCacheKey(baseConfig(storybook));
    expect(a).toBe(b);
  });

  it('changes when the scene steps change', async () => {
    const a = await computeCacheKey(baseConfig(storybook));
    const b = await computeCacheKey(
      baseConfig(storybook, {
        scenes: [{ storyId: 'example-button--primary', steps: [{ action: 'hold', ms: 999 }] }],
      }),
    );
    expect(a).not.toBe(b);
  });

  it('changes when fps or size changes', async () => {
    const a = await computeCacheKey(baseConfig(storybook));
    const b = await computeCacheKey(baseConfig(storybook, { fps: 60 }));
    const c = await computeCacheKey(baseConfig(storybook, { size: [1280, 720] }));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes when loop or poster changes', async () => {
    const a = await computeCacheKey(baseConfig(storybook));
    const b = await computeCacheKey(baseConfig(storybook, { loop: 'pingpong' }));
    const c = await computeCacheKey(baseConfig(storybook, { poster: false }));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('computeCacheKey (local static build — source fingerprint)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'storyreel-cache-src-'));
    writeFileSync(join(dir, 'iframe.html'), '<html></html>');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('changes when a source file is touched (mtime moves)', async () => {
    const before = await computeCacheKey(baseConfig(dir));
    // Move mtime forward — this is exactly what a rebuilt asset looks like.
    const future = new Date(Date.now() + 60_000);
    utimesSync(join(dir, 'iframe.html'), future, future);
    const after = await computeCacheKey(baseConfig(dir));
    expect(after).not.toBe(before);
  });

  it('changes when a file is added', async () => {
    const before = await computeCacheKey(baseConfig(dir));
    writeFileSync(join(dir, 'chunk.js'), '// noop');
    const after = await computeCacheKey(baseConfig(dir));
    expect(after).not.toBe(before);
  });

  it('is stable across repeated calls with no changes', async () => {
    const a = await computeCacheKey(baseConfig(dir));
    const b = await computeCacheKey(baseConfig(dir));
    expect(a).toBe(b);
  });
});
