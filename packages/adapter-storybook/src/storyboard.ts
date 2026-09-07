import { timingsSchema, type ArgSelection, type ControlMeta, type ControlType, type Scene, type Step, type Timings } from '@storyreel/schema';

export type StoryboardTimings = Timings;
export const DEFAULT_TIMINGS: StoryboardTimings = timingsSchema.parse({});

export interface StoryboardOptions {
  timings?: Partial<StoryboardTimings>;
  maxControls?: number;
  maxDuration?: number;
  /** Per-scene selection directive: include/exclude control names, override cycled values. */
  selection?: ArgSelection;
}

const DEFAULT_MAX_CONTROLS = 4;
const DEFAULT_MAX_DURATION_MS = 15_000;
const MIN_HOLD_MS = 150;
const ENUM_OPTION_CAP = 4;

/** Never auto-select these regardless of control type — layout/plumbing props, not visual state. */
const NAME_DENYLIST = new Set([
  'children',
  'classname',
  'style',
  'as',
  'ref',
  'key',
  'id',
  'testid',
]);
const ARIA_PREFIX = 'aria-';
/** Matches event-handler naming (onClick, onChange…) without false-positiving on props like "online" or "once". */
const ON_HANDLER_RE = /^on[A-Z]/;

/** Text controls are noisy by default (arbitrary strings break layout); only these names get a scripted short/long pair. */
const TEXT_ALLOWLIST = new Set(['label', 'title', 'placeholder', 'text']);
const TEXT_VALUES: [string, string] = ['Label', 'A label so long it has to wrap or truncate'];

/** Enum names that are the most visually dramatic — always shown first when present. */
const PRIORITY_ENUM_NAMES = ['variant', 'size', 'color', 'type', 'appearance', 'severity'];
/** Booleans that read as "closing" states — pushed to the end of the picked set. */
const CLOSING_BOOLEAN_NAMES = ['loading', 'disabled', 'checked'];

const TYPE_ORDER: Record<string, number> = { enum: 0, number: 1, boolean: 2 };

function isDenylisted(name: string): boolean {
  const lc = name.toLowerCase();
  if (NAME_DENYLIST.has(lc)) return true;
  if (lc.startsWith(ARIA_PREFIX)) return true;
  return ON_HANDLER_RE.test(name);
}

function isUsable(c: ControlMeta): boolean {
  if (isDenylisted(c.name)) return false;
  switch (c.type) {
    case 'enum':
      return Array.isArray(c.options) && c.options.length > 1;
    case 'number':
      return typeof c.min === 'number' && typeof c.max === 'number';
    case 'boolean':
      return true;
    case 'color':
      // A color control without discrete options is a free-form picker — no
      // predictable presets to cycle through, so it's dropped (single-color
      // stories have nothing to demonstrate anyway).
      return Array.isArray(c.options) && c.options.length > 1;
    case 'text':
      return TEXT_ALLOWLIST.has(c.name.toLowerCase());
    default:
      return false;
  }
}

function priorityRank(c: ControlMeta): number {
  if (c.type !== 'enum') return PRIORITY_ENUM_NAMES.length;
  const idx = PRIORITY_ENUM_NAMES.indexOf(c.name.toLowerCase());
  return idx === -1 ? PRIORITY_ENUM_NAMES.length : idx;
}

function optionCount(c: ControlMeta): number {
  return c.type === 'enum' || c.type === 'color' ? (c.options?.length ?? 2) : 2;
}

function isClosingBoolean(c: ControlMeta): boolean {
  return c.type === 'boolean' && CLOSING_BOOLEAN_NAMES.includes(c.name.toLowerCase());
}

/**
 * Generate a storyboard scene automatically from a story's controls. Selection
 * follows a fixed policy: skip plumbing/action props, skip free-form text
 * unless it's a known label-ish name, cap at maxControls, order for visual
 * impact (priority enums → other enums → numbers → booleans, closing booleans
 * last), and keep the whole scene under maxDuration.
 *
 * A `selection` directive overrides this: `include` is an ordered whitelist
 * that disables the heuristic entirely; `exclude` bans names from the auto
 * pick; `values` supplies explicit values to cycle for a named control.
 */
export function autoStoryboard(
  storyId: string,
  storyName: string,
  controls: ControlMeta[],
  opts: StoryboardOptions = {},
): Scene {
  const timings: StoryboardTimings = { ...DEFAULT_TIMINGS, ...opts.timings };
  const maxControls = opts.maxControls ?? DEFAULT_MAX_CONTROLS;
  const maxDuration = opts.maxDuration ?? DEFAULT_MAX_DURATION_MS;
  const selection = opts.selection ?? {};
  const values = selection.values ?? {};
  const hasValues = (name: string) => Object.prototype.hasOwnProperty.call(values, name);

  const chosen = selection.include && selection.include.length > 0
    ? pickIncluded(selection.include, controls, hasValues)
    : pickAuto(controls, storyName, selection.exclude, hasValues, maxControls);

  const steps: Step[] = [];
  if (chosen.length > 0) {
    steps.push({ action: 'hold', ms: timings.intro });
  }

  for (const c of chosen) {
    steps.push({ action: 'caption', text: c.name, ms: timings.captionGap });
    if (hasValues(c.name)) {
      appendValueCycle(steps, c.name, values[c.name]!, timings);
    } else {
      appendControlSteps(steps, c, timings);
    }
  }

  if (steps.length === 0) {
    // Nothing animatable — just hold the default render briefly.
    steps.push({ action: 'hold', ms: 1500 });
    return { storyId, steps };
  }

  steps.push({ action: 'hold', ms: timings.outro });

  return { storyId, steps: fitToMaxDuration(steps, maxDuration) };
}

/**
 * Explicit whitelist: the heuristic (denylist, text-allowlist, priority order)
 * is off — the user named exactly what they want, in the order they want. A
 * name resolves to its live ControlMeta; a name with only a `values` override
 * (and no matching control) still animates as a value-cycle.
 */
function pickIncluded(
  include: string[],
  controls: ControlMeta[],
  hasValues: (name: string) => boolean,
): ControlMeta[] {
  const out: ControlMeta[] = [];
  for (const name of include) {
    const meta = controls.find((c) => c.name === name);
    if (meta) out.push(meta);
    else if (hasValues(name)) out.push({ name, type: 'text' }); // synthetic; driven by values
  }
  return out;
}

/** Heuristic selection: usable controls (plus any with explicit values), minus excludes, ordered and capped. */
function pickAuto(
  controls: ControlMeta[],
  storyName: string,
  exclude: string[] | undefined,
  hasValues: (name: string) => boolean,
  maxControls: number,
): ControlMeta[] {
  const nameLc = storyName.toLowerCase();
  const excluded = new Set(exclude ?? []);
  const usable = controls.filter(
    (c) => !excluded.has(c.name) && (isUsable(c) || hasValues(c.name)),
  );
  const mentioned = (c: ControlMeta) => nameLc.includes(c.name.toLowerCase());

  // Selection order: named-in-title first (existing scenes already lean on this
  // signal), then priority enum names, then type, then fewer options first.
  const prioritized = [...usable].sort((a, b) => {
    const nameDiff = Number(mentioned(b)) - Number(mentioned(a));
    if (nameDiff !== 0) return nameDiff;
    const prioDiff = priorityRank(a) - priorityRank(b);
    if (prioDiff !== 0) return prioDiff;
    const typeDiff = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    if (typeDiff !== 0) return typeDiff;
    return optionCount(a) - optionCount(b);
  });

  return prioritized.slice(0, maxControls).sort((a, b) => {
    const typeDiff = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    if (typeDiff !== 0) return typeDiff;
    if (a.type === 'boolean' && b.type === 'boolean') {
      return Number(isClosingBoolean(a)) - Number(isClosingBoolean(b));
    }
    return 0;
  });
}

/** Cycle through an explicit value list (setArg + hold each) — used for `values` overrides. */
function appendValueCycle(
  steps: Step[],
  name: string,
  vals: unknown[],
  timings: StoryboardTimings,
): void {
  for (const value of vals) {
    steps.push({ action: 'setArg', name, value });
    steps.push({ action: 'hold', ms: timings.holdEnum });
  }
}

function appendControlSteps(
  steps: Step[],
  c: ControlMeta,
  timings: StoryboardTimings,
): void {
  if (c.type === 'enum' || c.type === 'color') {
    const options = c.options ?? [];
    const shown = options.slice(0, ENUM_OPTION_CAP);
    for (const opt of shown) {
      steps.push({ action: 'setArg', name: c.name, value: opt });
      steps.push({ action: 'hold', ms: timings.holdEnum });
    }
    if (options.length > ENUM_OPTION_CAP) {
      steps.push({
        action: 'caption',
        text: `and ${options.length - ENUM_OPTION_CAP} more`,
        ms: timings.captionGap,
      });
    }
  } else if (c.type === 'boolean') {
    steps.push({ action: 'setArg', name: c.name, value: false });
    steps.push({ action: 'hold', ms: timings.holdBoolean });
    steps.push({ action: 'setArg', name: c.name, value: true });
    steps.push({ action: 'hold', ms: timings.holdBoolean });
  } else if (c.type === 'number') {
    steps.push({
      action: 'tween',
      name: c.name,
      from: c.min!,
      to: c.max!,
      ms: timings.tween,
      easing: 'easeInOut',
      // Carry the argTypes step through so integer-only props never receive
      // fractional values (and stepped sliders move like a real drag).
      ...(c.step ? { step: c.step } : {}),
    });
    steps.push({ action: 'hold', ms: MIN_HOLD_MS * 2 });
  } else if (c.type === 'text') {
    for (const value of TEXT_VALUES) {
      steps.push({ action: 'setArg', name: c.name, value });
      steps.push({ action: 'hold', ms: timings.holdEnum });
    }
  }
}

function stepDurationMs(step: Step): number {
  return step.action === 'hold' || step.action === 'caption' || step.action === 'tween'
    ? step.ms
    : 0;
}

function totalDurationMs(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + stepDurationMs(s), 0);
}

/**
 * Keep the storyboard under maxDuration: first shrink every timed step
 * proportionally (never below MIN_HOLD_MS), then if it's still too long, drop
 * whole trailing controls (their caption+steps run) until it fits.
 */
function fitToMaxDuration(steps: Step[], maxDuration: number): Step[] {
  const total = totalDurationMs(steps);
  if (total <= maxDuration) return steps;

  const scale = Math.max(0, maxDuration / total);
  let scaled = steps.map((s) => {
    if (s.action === 'hold' || s.action === 'caption' || s.action === 'tween') {
      const ms = Math.max(MIN_HOLD_MS, Math.round(s.ms * scale));
      return { ...s, ms };
    }
    return s;
  });

  if (totalDurationMs(scaled) <= maxDuration) return scaled;

  // Scaling alone can't fit (too many controls hit the MIN_HOLD_MS floor) —
  // drop trailing controls. A control's run starts at its caption step.
  while (totalDurationMs(scaled) > maxDuration) {
    const lastCaptionIdx = findLastIndex(scaled, (s) => s.action === 'caption');
    if (lastCaptionIdx <= 0) break; // keep at least the first control + outro
    const outro = scaled[scaled.length - 1]!;
    scaled = [...scaled.slice(0, lastCaptionIdx), outro];
  }

  return scaled;
}

function findLastIndex<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i;
  }
  return -1;
}

export type { ControlType };
