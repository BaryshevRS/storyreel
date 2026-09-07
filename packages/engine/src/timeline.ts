import type { Scene } from '@storyreel/schema';
import { applyEasing } from './easing.js';

export interface Frame {
  index: number;
  /** Full arg state to apply to the story on this frame. */
  args: Record<string, unknown>;
  /** Control currently being animated/changed (for panel highlight), or null. */
  activeControl: string | null;
  /** Caption overlay state, or null when no caption is visible. */
  caption: { text: string; position: 'bottom' | 'top'; opacity: number } | null;
}

export interface Timeline {
  fps: number;
  frameMs: number;
  totalMs: number;
  frames: Frame[];
}

type Segment =
  | {
      kind: 'hold';
      start: number;
      end: number;
      args: Record<string, unknown>;
      active: string | null;
    }
  | {
      kind: 'tween';
      start: number;
      end: number;
      args: Record<string, unknown>;
      name: string;
      from: number;
      to: number;
      easingName: 'linear' | 'easeInOut' | 'easeOut';
      step?: number;
    }
  | {
      kind: 'caption';
      start: number;
      end: number;
      args: Record<string, unknown>;
      text: string;
      position: 'bottom' | 'top';
    };

const CAPTION_FADE_MS = 150;

/**
 * Compile a scene into a flat list of frames sampled at 1/fps.
 * Pure and deterministic: no I/O, no time source. Sampling uses a single global
 * clock so per-segment rounding never accumulates drift.
 */
export function compileTimeline(scene: Scene, fps: number): Timeline {
  const frameMs = 1000 / fps;
  const segments: Segment[] = [];
  const currentArgs: Record<string, unknown> = { ...(scene.initialArgs ?? {}) };
  let t = 0;
  let pendingActive: string | null = null;

  for (const step of scene.steps) {
    switch (step.action) {
      case 'setArg': {
        currentArgs[step.name] = step.value;
        pendingActive = step.name;
        break;
      }
      case 'hold': {
        segments.push({
          kind: 'hold',
          start: t,
          end: t + step.ms,
          args: { ...currentArgs },
          active: pendingActive,
        });
        t += step.ms;
        pendingActive = null;
        break;
      }
      case 'tween': {
        segments.push({
          kind: 'tween',
          start: t,
          end: t + step.ms,
          args: { ...currentArgs },
          name: step.name,
          from: step.from,
          to: step.to,
          easingName: step.easing,
          step: step.step,
        });
        currentArgs[step.name] = step.to;
        t += step.ms;
        pendingActive = null;
        break;
      }
      case 'caption': {
        segments.push({
          kind: 'caption',
          start: t,
          end: t + step.ms,
          args: { ...currentArgs },
          text: step.text,
          position: step.position ?? 'bottom',
        });
        t += step.ms;
        break;
      }
    }
  }

  const totalMs = t;
  const frameCount = totalMs <= 0 ? 1 : Math.max(1, Math.round(totalMs / frameMs));
  const frames: Frame[] = [];

  for (let i = 0; i < frameCount; i++) {
    const sampleTime = i * frameMs;
    const seg = findSegment(segments, sampleTime);
    frames.push(sampleFrame(i, seg, sampleTime, currentArgs));
  }

  return { fps, frameMs, totalMs, frames };
}

function findSegment(segments: Segment[], time: number): Segment | null {
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (time >= seg.start && time < seg.end) return seg;
  }
  // Clamp to last segment for the trailing edge (sampleTime === totalMs).
  return segments[segments.length - 1] ?? null;
}

function sampleFrame(
  index: number,
  seg: Segment | null,
  time: number,
  fallbackArgs: Record<string, unknown>,
): Frame {
  if (!seg) {
    return { index, args: { ...fallbackArgs }, activeControl: null, caption: null };
  }

  switch (seg.kind) {
    case 'hold':
      return {
        index,
        args: { ...seg.args },
        activeControl: seg.active,
        caption: null,
      };
    case 'tween': {
      const duration = seg.end - seg.start;
      const local = duration <= 0 ? 1 : (time - seg.start) / duration;
      const eased = applyEasing(seg.easingName, local);
      let value = seg.from + (seg.to - seg.from) * eased;
      if (seg.step) {
        // Snap to the step grid anchored at `from`; clamp so the final frame
        // lands exactly on `to` even when the range isn't a step multiple.
        value = seg.from + Math.round((value - seg.from) / seg.step) * seg.step;
        value =
          seg.to >= seg.from
            ? Math.min(value, seg.to)
            : Math.max(value, seg.to);
      }
      return {
        index,
        args: { ...seg.args, [seg.name]: value },
        activeControl: seg.name,
        caption: null,
      };
    }
    case 'caption': {
      const duration = seg.end - seg.start;
      const fade = Math.min(CAPTION_FADE_MS, duration / 3);
      const local = time - seg.start;
      let opacity = 1;
      if (fade > 0) {
        if (local < fade) opacity = local / fade;
        else if (local > duration - fade) opacity = (duration - local) / fade;
      }
      return {
        index,
        args: { ...seg.args },
        activeControl: null,
        caption: {
          text: seg.text,
          position: seg.position,
          opacity: Math.max(0, Math.min(1, opacity)),
        },
      };
    }
  }
}
