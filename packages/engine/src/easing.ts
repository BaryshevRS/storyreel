import type { Easing } from '@storyreel/schema';

export type EasingFn = (t: number) => number;

/** Easing functions over normalized time t ∈ [0, 1]. */
export const easings: Record<Easing, EasingFn> = {
  linear: (t) => t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

export function applyEasing(easing: Easing, t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return easings[easing](clamped);
}
