import type { ControlMeta, ControlType } from '@storyreel/schema';

/*
 * Browser-context functions. These are serialized and executed inside the story
 * iframe via Playwright's frame.evaluate, so they must be fully self-contained
 * (no references to module scope). Storybook API differences between v7/v8/v9
 * are handled here with feature-detection rather than version parsing.
 */

/**
 * Installed via addInitScript BEFORE Storybook boots, so we hook the addons
 * channel the instant it exists and never miss the storyPrepared event (which
 * carries argTypes). Polls until the channel appears, then subscribes once.
 */
export function browserInitHook(): void {
  const w = window as unknown as Record<string, unknown>;
  function tryHook(): boolean {
    const c = w['__STORYBOOK_ADDONS_CHANNEL__'] as
      | { on?: (ev: string, cb: (p: unknown) => void) => void }
      | undefined;
    if (c && typeof c.on === 'function' && !w['__STORYREEL_HOOKED__']) {
      w['__STORYREEL_HOOKED__'] = true;
      c.on('storyPrepared', (p: unknown) => {
        w['__STORYREEL_CTX__'] = p;
      });
      c.on('storyRendered', () => {
        w['__STORYREEL_RENDERED__'] = true;
      });
      c.on('storyErrored', (p: unknown) => {
        w['__STORYREEL_ERROR__'] = p;
      });
      return true;
    }
    return false;
  }
  if (!tryHook()) {
    const iv = setInterval(() => {
      if (tryHook()) clearInterval(iv);
    }, 5);
  }
}

/** Resolve once the story has rendered (relies on browserInitHook's listeners). */
export function browserInstallAndWait(storyId: string): Promise<boolean> {
  const w = window as unknown as Record<string, unknown>;
  function getRoot(): Element | null {
    return document.querySelector('#storybook-root, #root');
  }
  function rendered(): boolean {
    const r = getRoot();
    return !!r && r.childElementCount > 0;
  }

  return new Promise<boolean>((resolve, reject) => {
    const check = () => {
      if (w['__STORYREEL_ERROR__']) {
        reject(new Error('Storybook reported storyErrored for ' + storyId));
        return;
      }
      if (w['__STORYREEL_RENDERED__'] || rendered()) resolve(true);
      else setTimeout(check, 40);
    };
    check();
  });
}

/** Extract raw argTypes + current args for the story. Returns null if unavailable. */
export function browserGetStoryContext(storyId: string): {
  argTypes: Record<string, unknown>;
  args: Record<string, unknown>;
} | null {
  const w = window as unknown as Record<string, unknown>;
  const ctx = w['__STORYREEL_CTX__'] as
    | { argTypes?: Record<string, unknown>; args?: Record<string, unknown>; initialArgs?: Record<string, unknown> }
    | undefined;
  if (ctx && ctx.argTypes) {
    return { argTypes: ctx.argTypes, args: ctx.args ?? ctx.initialArgs ?? {} };
  }

  const preview = w['__STORYBOOK_PREVIEW__'] as { storyStore?: unknown } | undefined;
  const store = preview?.storyStore as
    | { fromId?: (id: string) => { argTypes?: Record<string, unknown>; args?: Record<string, unknown>; initialArgs?: Record<string, unknown> } | undefined }
    | undefined;
  if (store && typeof store.fromId === 'function') {
    try {
      const s = store.fromId(storyId);
      if (s && s.argTypes) {
        return { argTypes: s.argTypes, args: s.args ?? s.initialArgs ?? {} };
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Emit updateStoryArgs through the Storybook addons channel. Takes a single
 * object arg so it can be passed straight to Playwright's frame.evaluate
 * (which serializes the whole function and forwards exactly one argument).
 */
export function browserEmitUpdateArgs(arg: {
  storyId: string;
  updatedArgs: Record<string, unknown>;
}): void {
  const w = window as unknown as Record<string, unknown>;
  const channel = w['__STORYBOOK_ADDONS_CHANNEL__'] as
    | { emit?: (ev: string, payload: unknown) => void }
    | undefined;
  if (!channel || typeof channel.emit !== 'function') {
    throw new Error('Storybook addons channel not found in story iframe');
  }
  channel.emit('updateStoryArgs', { storyId: arg.storyId, updatedArgs: arg.updatedArgs });
}

/* -------------------------------------------------------------------------- */
/* Node-side mapping: argTypes -> ControlMeta                                  */
/* -------------------------------------------------------------------------- */

interface RawArgType {
  name?: string;
  control?: boolean | string | { type?: string; min?: number; max?: number; step?: number; options?: unknown[] };
  options?: unknown[];
  type?: unknown;
  action?: unknown;
  table?: { disable?: boolean };
}

function controlType(raw: RawArgType): string | null {
  const c = raw.control;
  if (c === false) return null;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object') return c.type ?? null;
  return null;
}

function mapType(sbType: string, hasOptions: boolean): ControlType | null {
  switch (sbType) {
    case 'select':
    case 'radio':
    case 'inline-radio':
    case 'multi-select':
    case 'check':
    case 'inline-check':
      return 'enum';
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'range':
      return 'number';
    case 'color':
      return 'color';
    case 'text':
      return 'text';
    default:
      return hasOptions ? 'enum' : null;
  }
}

/** Map Storybook argTypes into the harness-panel ControlMeta list. */
export function mapArgTypesToControls(
  argTypes: Record<string, unknown>,
): ControlMeta[] {
  const out: ControlMeta[] = [];
  for (const [name, rawUnknown] of Object.entries(argTypes)) {
    const raw = rawUnknown as RawArgType;
    if (!raw || typeof raw !== 'object') continue;
    if (raw.action !== undefined) continue; // action arg, not a control
    if (raw.table?.disable) continue;

    const sbType = controlType(raw);
    if (sbType === null) continue;

    const options =
      raw.options ??
      (typeof raw.control === 'object' && raw.control ? raw.control.options : undefined);
    const mapped = mapType(sbType, Array.isArray(options) && options.length > 0);
    if (!mapped) continue;

    const meta: ControlMeta = { name, type: mapped };
    if (mapped === 'enum' && Array.isArray(options)) meta.options = options;
    if (mapped === 'number' && typeof raw.control === 'object' && raw.control) {
      if (typeof raw.control.min === 'number') meta.min = raw.control.min;
      if (typeof raw.control.max === 'number') meta.max = raw.control.max;
      if (typeof raw.control.step === 'number') meta.step = raw.control.step;
    }
    out.push(meta);
  }
  return out;
}
