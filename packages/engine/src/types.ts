import type { Page } from 'playwright';
import type { ControlMeta, ReelConfig, Scene, Size } from '@storyreel/schema';

/**
 * Contract between the engine and any adapter (Storybook, and future ones).
 * The engine never imports an adapter directly — it only speaks this interface.
 */
export interface SceneSource {
  /** Prepare the page: load the component into the harness, wait for readiness. */
  mount(page: Page, scene: Scene): Promise<void>;
  /** Apply an arg state on a given frame (e.g. update story args). */
  applyState(page: Page, args: Record<string, unknown>): Promise<void>;
  /** Control metadata for the harness panel. */
  getControlsMeta(scene: Scene): Promise<ControlMeta[]>;
  /** Optional: story default arg values, to seed the panel for untouched controls. */
  getInitialValues?(scene: Scene): Promise<Record<string, unknown>>;
  /**
   * Optional: pin every CSS animation in the story to an absolute scene time
   * (ms). Keeps internal animations (spinners, etc.) continuous even when an arg
   * change re-renders the DOM and would otherwise restart the animation.
   */
  syncAnimations?(page: Page, virtualTimeMs: number): Promise<void>;
}

export interface RenderProgress {
  sceneIndex: number;
  sceneCount: number;
  storyId: string;
  frame: number;
  totalFrames: number;
  etaMs: number;
}

export interface RenderOptions {
  config: ReelConfig;
  source: SceneSource;
  /** file:// URL or http URL of the built harness page. */
  harnessUrl: string;
  onProgress?: (p: RenderProgress) => void;
  /** Keep temp frames on disk (debug). */
  keepFrames?: boolean;
  /** Override headless (default true). */
  headless?: boolean;
  /** Fast low-fidelity render: jpeg frames (quality 80) + lower mp4/webm crf. */
  draft?: boolean;
}

export interface RenderResult {
  outputPath: string;
  frameCount: number;
  durationSeconds: number;
  /** Path to the saved poster frame, if config.poster was enabled. */
  posterPath?: string;
}

export type { Size };
