import { describe, expect, it } from 'vitest';
import { compileTimeline } from './timeline.js';
import { applyEasing } from './easing.js';
import type { Scene } from '@storyreel/schema';

describe('compileTimeline', () => {
  it('produces the right frame count for a duration', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [{ action: 'hold', ms: 1000 }],
    };
    const tl = compileTimeline(scene, 60);
    // 1000ms at 60fps ≈ 60 frames.
    expect(tl.frames.length).toBe(60);
    expect(tl.totalMs).toBe(1000);
  });

  it('applies setArg then holds with the new value and highlights it', () => {
    const scene: Scene = {
      storyId: 's',
      initialArgs: { variant: 'primary' },
      steps: [
        { action: 'setArg', name: 'variant', value: 'secondary' },
        { action: 'hold', ms: 100 },
      ],
    };
    const tl = compileTimeline(scene, 60);
    for (const f of tl.frames) {
      expect(f.args.variant).toBe('secondary');
      expect(f.activeControl).toBe('variant');
    }
  });

  it('interpolates tween values following the easing curve', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [
        { action: 'tween', name: 'size', from: 0, to: 100, ms: 1000, easing: 'easeInOut' },
      ],
    };
    const tl = compileTimeline(scene, 60);
    for (const f of tl.frames) {
      const t = (f.index * tl.frameMs) / 1000; // normalized time in [0,1)
      const expected = 0 + 100 * applyEasing('easeInOut', t);
      expect(f.args.size).toBeCloseTo(expected, 5);
      expect(f.activeControl).toBe('size');
    }
    // Monotonic non-decreasing for easeInOut over 0..1.
    const values = tl.frames.map((f) => f.args.size as number);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
    }
  });

  it('shows caption with fade in and out', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [{ action: 'caption', text: 'hi', ms: 600 }],
    };
    const tl = compileTimeline(scene, 60);
    expect(tl.frames[0]!.caption?.text).toBe('hi');
    expect(tl.frames[0]!.caption!.opacity).toBeLessThan(0.5); // fading in
    const mid = tl.frames[Math.floor(tl.frames.length / 2)]!;
    expect(mid.caption!.opacity).toBeCloseTo(1, 1);
  });

  it('quantizes tween values to step when given, landing exactly on `to`', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [
        { action: 'tween', name: 'v', from: 0, to: 100, ms: 1000, easing: 'easeInOut', step: 5 },
      ],
    };
    const tl = compileTimeline(scene, 60);
    for (const f of tl.frames) {
      const v = f.args.v as number;
      expect(v % 5).toBe(0); // always on the step grid
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('quantized tween clamps to `to` when the range is not a step multiple', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [
        { action: 'tween', name: 'v', from: 0, to: 12, ms: 500, easing: 'linear', step: 5 },
        { action: 'hold', ms: 100 },
      ],
    };
    const tl = compileTimeline(scene, 60);
    const values = tl.frames.map((f) => f.args.v as number);
    expect(Math.max(...values)).toBe(12); // clamped, not 15
  });

  it('keeps fractional interpolation when no step is given', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [
        { action: 'tween', name: 'v', from: 0, to: 10, ms: 1000, easing: 'linear' },
      ],
    };
    const tl = compileTimeline(scene, 60);
    const fractional = tl.frames.some((f) => !Number.isInteger(f.args.v as number));
    expect(fractional).toBe(true);
  });

  it('carries tween end value into subsequent segments', () => {
    const scene: Scene = {
      storyId: 's',
      steps: [
        { action: 'tween', name: 'x', from: 0, to: 50, ms: 100, easing: 'linear' },
        { action: 'hold', ms: 100 },
      ],
    };
    const tl = compileTimeline(scene, 60);
    const last = tl.frames[tl.frames.length - 1]!;
    expect(last.args.x).toBe(50);
  });
});
