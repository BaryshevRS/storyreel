import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

export const holdStep = z.object({
  action: z.literal('hold'),
  ms: z.number().positive(),
});

export const setArgStep = z.object({
  action: z.literal('setArg'),
  name: z.string().min(1),
  value: z.unknown(),
  transition: z.literal('instant').optional(),
});

export const easingSchema = z.enum(['linear', 'easeInOut', 'easeOut']);
export type Easing = z.infer<typeof easingSchema>;

export const tweenStep = z.object({
  action: z.literal('tween'),
  name: z.string().min(1),
  from: z.number(),
  to: z.number(),
  ms: z.number().positive(),
  easing: easingSchema,
  /**
   * Quantize interpolated values to this step (relative to `from`). Use for
   * props where fractions are meaningless (counts, stepped sliders). Omit for
   * continuous props (px radii, opacity) to keep interpolation smooth.
   */
  step: z.number().positive().optional(),
});

export const captionStep = z.object({
  action: z.literal('caption'),
  text: z.string(),
  ms: z.number().positive(),
  position: z.enum(['bottom', 'top']).optional(),
});

export const stepSchema = z.discriminatedUnion('action', [
  holdStep,
  setArgStep,
  tweenStep,
  captionStep,
]);
export type Step = z.infer<typeof stepSchema>;

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Directive for the auto-storyboard heuristic when a scene has no explicit
 * `steps`. `include` is an ordered whitelist that turns the heuristic off
 * entirely (user is boss); `exclude` bans specific controls from the auto
 * selection; `values` overrides the cycled values for a named control.
 */
export const argSelectionSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  values: z.record(z.array(z.unknown())).optional(),
});
export type ArgSelection = z.infer<typeof argSelectionSchema>;

export const sceneSchema = z.object({
  storyId: z.string().min(1),
  initialArgs: z.record(z.unknown()).optional(),
  // Optional: an empty/omitted step list means "auto-storyboard this scene"
  // (see `args`), resolved by probing the story's controls at render time.
  steps: z.array(stepSchema).default([]),
  args: argSelectionSchema.optional(),
});
export type Scene = z.infer<typeof sceneSchema>;

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

export const outputFormatSchema = z.enum(['mp4', 'gif', 'webm']);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const outputSchema = z.object({
  format: outputFormatSchema,
  path: z.string().min(1),
});

export const sizeSchema = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([w, h]) => w % 2 === 0 && h % 2 === 0, {
    message: 'size width and height must both be even (yuv420p requirement)',
  });
export type Size = z.infer<typeof sizeSchema>;

/** Default hold/tween durations for the auto-storyboard heuristic; overridable as one object. */
export const timingsSchema = z.object({
  intro: z.number().positive().default(600),
  holdEnum: z.number().positive().default(600),
  holdBoolean: z.number().positive().default(800),
  tween: z.number().positive().default(1200),
  captionGap: z.number().positive().default(400),
  outro: z.number().positive().default(800),
});
export type Timings = z.infer<typeof timingsSchema>;
export type TimingsInput = z.input<typeof timingsSchema>;

export const posterSchema = z.union([z.boolean(), z.object({ at: z.number().nonnegative() })]);
export type Poster = z.infer<typeof posterSchema>;

export const loopSchema = z.enum(['normal', 'pingpong']);
export type Loop = z.infer<typeof loopSchema>;

export const reelConfigSchema = z.object({
  storybook: z.string().min(1),
  fps: z.number().int().positive().default(30),
  size: sizeSchema.default([1920, 1080]),
  theme: z.string().default('gradient-dusk'),
  showArgsPanel: z.boolean().default(true),
  watermark: z.boolean().default(true),
  output: outputSchema,
  scenes: z.array(sceneSchema).min(1),
  timings: timingsSchema.partial().optional(),
  maxControls: z.number().int().positive().default(4),
  maxDuration: z.number().positive().default(15_000),
  poster: posterSchema.default(true),
  loop: loopSchema.default('normal'),
});
export type ReelConfig = z.infer<typeof reelConfigSchema>;
/** Config as authored by the user, before defaults are applied. */
export type ReelConfigInput = z.input<typeof reelConfigSchema>;

/* -------------------------------------------------------------------------- */
/* Controls (contract between adapter and harness panel)                      */
/* -------------------------------------------------------------------------- */

export const controlTypeSchema = z.enum([
  'enum',
  'boolean',
  'number',
  'text',
  'color',
]);
export type ControlType = z.infer<typeof controlTypeSchema>;

export const controlMetaSchema = z.object({
  name: z.string(),
  type: controlTypeSchema,
  options: z.array(z.unknown()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});
export type ControlMeta = z.infer<typeof controlMetaSchema>;

/* -------------------------------------------------------------------------- */
/* Harness panel message (engine -> harness, per frame)                       */
/* -------------------------------------------------------------------------- */

export interface PanelMessage {
  type: 'panel';
  activeControl: string | null;
  values: Record<string, unknown>;
}

export interface CaptionMessage {
  type: 'caption';
  text: string | null;
  position: 'bottom' | 'top';
  opacity: number;
}

export interface InitMessage {
  type: 'init';
  theme: string;
  controls: ControlMeta[];
  showArgsPanel: boolean;
  watermark: boolean;
  size: Size;
  /** Baseline control values (story defaults); per-frame values override these. */
  values?: Record<string, unknown>;
}

export type HarnessMessage = PanelMessage | CaptionMessage | InitMessage;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Parse a config with human-readable error, applying defaults. */
export function parseReelConfig(input: unknown): ReelConfig {
  return reelConfigSchema.parse(input);
}

export { z };
