import { describe, expect, it } from 'vitest';
import { autoStoryboard } from './storyboard.js';
import { mapArgTypesToControls } from './versions.js';
import type { ControlMeta } from '@storyreel/schema';

describe('autoStoryboard', () => {
  it('cycles enum options and orders enum before boolean', () => {
    const controls: ControlMeta[] = [
      { name: 'disabled', type: 'boolean' },
      { name: 'variant', type: 'enum', options: ['primary', 'secondary'] },
    ];
    const scene = autoStoryboard('button--primary', 'Primary', controls);
    const setArgs = scene.steps.filter((s) => s.action === 'setArg');
    // variant options come first (enum before boolean).
    expect((setArgs[0] as { name: string }).name).toBe('variant');
    // 2 enum options + 2 boolean states = 4 setArgs.
    expect(setArgs.length).toBe(4);
  });

  it('tweens numbers from min to max', () => {
    const controls: ControlMeta[] = [
      { name: 'radius', type: 'number', min: 0, max: 24 },
    ];
    const scene = autoStoryboard('card--basic', 'Basic', controls);
    const tween = scene.steps.find((s) => s.action === 'tween');
    expect(tween).toMatchObject({ from: 0, to: 24, easing: 'easeInOut' });
  });

  it('caps at 4 controls', () => {
    const controls: ControlMeta[] = Array.from({ length: 8 }, (_, i) => ({
      name: `c${i}`,
      type: 'boolean' as const,
    }));
    const scene = autoStoryboard('x--y', 'Y', controls);
    const captions = scene.steps.filter((s) => s.action === 'caption');
    expect(captions.length).toBe(4);
  });

  it('falls back to a hold when nothing is animatable', () => {
    const scene = autoStoryboard('x--y', 'Y', []);
    expect(scene.steps).toEqual([{ action: 'hold', ms: 1500 }]);
  });

  it('drops plumbing props by name regardless of type', () => {
    const controls: ControlMeta[] = [
      { name: 'children', type: 'text' },
      { name: 'className', type: 'text' },
      { name: 'onClick', type: 'boolean' },
      { name: 'aria-label', type: 'text' },
      { name: 'variant', type: 'enum', options: ['primary', 'secondary'] },
    ];
    const scene = autoStoryboard('button--primary', 'Primary', controls);
    const setArgs = scene.steps.filter((s) => s.action === 'setArg');
    expect(setArgs.every((s) => (s as { name: string }).name === 'variant')).toBe(true);
  });

  it('does not false-positive on props merely starting with "on"', () => {
    const controls: ControlMeta[] = [{ name: 'online', type: 'boolean' }];
    const scene = autoStoryboard('status--default', 'Default', controls);
    const setArgs = scene.steps.filter((s) => s.action === 'setArg');
    expect(setArgs.length).toBeGreaterThan(0);
  });

  it('skips free-form text unless the name is allowlisted', () => {
    const controls: ControlMeta[] = [
      { name: 'description', type: 'text' },
      { name: 'label', type: 'text' },
    ];
    const scene = autoStoryboard('card--basic', 'Basic', controls);
    const setArgs = scene.steps.filter((s) => s.action === 'setArg');
    expect(setArgs.every((s) => (s as { name: string }).name === 'label')).toBe(true);
    expect(setArgs.length).toBe(2);
  });

  it('skips a color control with no discrete presets', () => {
    const controls: ControlMeta[] = [{ name: 'bg', type: 'color' }];
    const scene = autoStoryboard('card--basic', 'Basic', controls);
    expect(scene.steps.some((s) => s.action === 'setArg')).toBe(false);
  });

  it('prioritizes known enum names over unlisted ones', () => {
    const controls: ControlMeta[] = [
      { name: 'weirdProp', type: 'enum', options: ['a', 'b'] },
      { name: 'variant', type: 'enum', options: ['x', 'y'] },
    ];
    const scene = autoStoryboard('widget--default', 'Default', controls);
    const setArgs = scene.steps.filter((s) => s.action === 'setArg');
    expect((setArgs[0] as { name: string }).name).toBe('variant');
  });

  it('truncates enums with more than 4 options and captions the rest', () => {
    const controls: ControlMeta[] = [
      { name: 'variant', type: 'enum', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    ];
    const scene = autoStoryboard('widget--default', 'Default', controls);
    const setArgs = scene.steps.filter((s) => s.action === 'setArg');
    expect(setArgs.length).toBe(4);
    const captions = scene.steps.filter((s) => s.action === 'caption');
    expect(captions.some((c) => (c as { text: string }).text === 'and 3 more')).toBe(true);
  });

  it('keeps the storyboard under maxDuration by shrinking then dropping controls', () => {
    const controls: ControlMeta[] = Array.from({ length: 4 }, (_, i) => ({
      name: `variant${i}`,
      type: 'enum' as const,
      options: ['a', 'b', 'c', 'd'],
    }));
    const scene = autoStoryboard('widget--default', 'Default', controls, {
      maxDuration: 2000,
    });
    const totalMs = scene.steps.reduce((sum, s) => {
      if (s.action === 'hold' || s.action === 'caption' || s.action === 'tween') {
        return sum + s.ms;
      }
      return sum;
    }, 0);
    expect(totalMs).toBeLessThanOrEqual(2000);
  });

  it('accepts a custom timings object', () => {
    const controls: ControlMeta[] = [{ name: 'disabled', type: 'boolean' }];
    const scene = autoStoryboard('x--y', 'Y', controls, {
      timings: { holdBoolean: 100 },
    });
    const holds = scene.steps.filter((s) => s.action === 'hold') as { ms: number }[];
    expect(holds.some((h) => h.ms === 100)).toBe(true);
  });
});

describe('autoStoryboard selection directive', () => {
  const controls: ControlMeta[] = [
    { name: 'variant', type: 'enum', options: ['primary', 'secondary'] },
    { name: 'size', type: 'enum', options: ['sm', 'md', 'lg'] },
    { name: 'disabled', type: 'boolean' },
    { name: 'fullWidth', type: 'boolean' },
  ];

  it('include is an ordered whitelist that disables the heuristic', () => {
    const scene = autoStoryboard('button--primary', 'Primary', controls, {
      selection: { include: ['disabled', 'variant'] },
    });
    const captions = scene.steps
      .filter((s) => s.action === 'caption')
      .map((s) => (s as { text: string }).text);
    // Exactly the two named controls, in the order given (no enum-before-boolean reorder).
    expect(captions).toEqual(['disabled', 'variant']);
  });

  it('include shows a control the heuristic would normally skip', () => {
    const withText: ControlMeta[] = [...controls, { name: 'children', type: 'text' }];
    const scene = autoStoryboard('button--primary', 'Primary', withText, {
      selection: { include: ['children'] },
    });
    // `children` is denylisted in auto mode, but include forces it in via values? No —
    // here it has no values, so it appears as a (text) control the user explicitly asked for.
    const captions = scene.steps
      .filter((s) => s.action === 'caption')
      .map((s) => (s as { text: string }).text);
    expect(captions).toEqual(['children']);
  });

  it('exclude bans a control from the auto pick', () => {
    const scene = autoStoryboard('button--primary', 'Primary', controls, {
      selection: { exclude: ['fullWidth', 'disabled'] },
    });
    const setArgNames = new Set(
      scene.steps.filter((s) => s.action === 'setArg').map((s) => (s as { name: string }).name),
    );
    expect(setArgNames.has('fullWidth')).toBe(false);
    expect(setArgNames.has('disabled')).toBe(false);
    expect(setArgNames.has('variant')).toBe(true);
  });

  it('values overrides the cycled values for a named control', () => {
    const scene = autoStoryboard('button--primary', 'Primary', controls, {
      selection: { include: ['variant'], values: { variant: ['danger', 'ghost'] } },
    });
    const setArgs = scene.steps
      .filter((s) => s.action === 'setArg')
      .map((s) => (s as { value: unknown }).value);
    expect(setArgs).toEqual(['danger', 'ghost']);
  });

  it('values on a synthetic (unresolved) name still animates via include', () => {
    const scene = autoStoryboard('button--primary', 'Primary', controls, {
      selection: { include: ['label'], values: { label: ['Buy', 'Add to cart'] } },
    });
    const setArgs = scene.steps.filter((s) => s.action === 'setArg') as {
      name: string;
      value: unknown;
    }[];
    expect(setArgs).toEqual([
      { action: 'setArg', name: 'label', value: 'Buy' },
      { action: 'setArg', name: 'label', value: 'Add to cart' },
    ]);
  });

  it('values pulls in an otherwise-skipped control in auto mode', () => {
    const withText: ControlMeta[] = [
      { name: 'variant', type: 'enum', options: ['primary', 'secondary'] },
      { name: 'description', type: 'text' }, // not allowlisted → normally skipped
    ];
    const scene = autoStoryboard('button--primary', 'Primary', withText, {
      selection: { values: { description: ['short', 'a much longer description'] } },
    });
    const names = new Set(
      scene.steps.filter((s) => s.action === 'setArg').map((s) => (s as { name: string }).name),
    );
    expect(names.has('description')).toBe(true);
  });
});

describe('mapArgTypesToControls', () => {
  it('maps select/boolean/number/color and skips actions', () => {
    const argTypes = {
      variant: { control: { type: 'select' }, options: ['a', 'b'] },
      disabled: { control: 'boolean' },
      radius: { control: { type: 'range', min: 0, max: 20, step: 2 } },
      bg: { control: { type: 'color' } },
      onClick: { action: 'clicked' },
      hidden: { control: false },
    };
    const controls = mapArgTypesToControls(argTypes);
    const byName = Object.fromEntries(controls.map((c) => [c.name, c]));
    expect(byName.variant).toMatchObject({ type: 'enum', options: ['a', 'b'] });
    expect(byName.disabled!.type).toBe('boolean');
    expect(byName.radius).toMatchObject({ type: 'number', min: 0, max: 20, step: 2 });
    expect(byName.bg!.type).toBe('color');
    expect(byName.onClick).toBeUndefined();
    expect(byName.hidden).toBeUndefined();
  });
});
