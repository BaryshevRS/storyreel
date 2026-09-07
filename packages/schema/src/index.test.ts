import { describe, expect, it } from 'vitest';
import { parseReelConfig, sizeSchema, stepSchema } from './index.js';

describe('reelConfig', () => {
  it('applies defaults', () => {
    const cfg = parseReelConfig({
      storybook: 'http://localhost:6006',
      output: { format: 'mp4', path: 'out.mp4' },
      scenes: [{ storyId: 'components-button--primary', steps: [] }],
    });
    expect(cfg.fps).toBe(30);
    expect(cfg.size).toEqual([1920, 1080]);
    expect(cfg.theme).toBe('gradient-dusk');
    expect(cfg.showArgsPanel).toBe(true);
    expect(cfg.maxControls).toBe(4);
    expect(cfg.maxDuration).toBe(15_000);
    expect(cfg.poster).toBe(true);
    expect(cfg.loop).toBe('normal');
  });

  it('rejects odd size', () => {
    expect(() => sizeSchema.parse([1921, 1080])).toThrow(/even/);
  });

  it('requires at least one scene', () => {
    expect(() =>
      parseReelConfig({
        storybook: 'x',
        output: { format: 'mp4', path: 'o.mp4' },
        scenes: [],
      }),
    ).toThrow();
  });
});

describe('step', () => {
  it('parses a tween step', () => {
    const s = stepSchema.parse({
      action: 'tween',
      name: 'size',
      from: 0,
      to: 100,
      ms: 1000,
      easing: 'easeInOut',
    });
    expect(s.action).toBe('tween');
  });

  it('rejects unknown action', () => {
    expect(() => stepSchema.parse({ action: 'nope' })).toThrow();
  });
});
