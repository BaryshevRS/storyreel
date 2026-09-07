import type { ReelConfig } from '@storyreel/schema';

// Two tuning knobs beyond the defaults, on the repo's own fixture Storybook
// (fixtures/sb-fixture) so this renders out of the box:
// - timings: this component's states are simple, so a snappier pace (shorter
//   holdEnum than the 600ms default, faster tween than the 1200ms default)
//   keeps the reel tight without losing legibility.
// - poster: default poster picks 40% into the render; here the interesting
//   frame is mid-way through the radius tween, so it's pinned explicitly.
//   That frame is what shows up as card-tuned.poster.png (docs og:image,
//   video poster attribute) — see the embed snippet storyreel prints after
//   render.
const config: ReelConfig = {
  storybook: 'fixtures/sb-fixture/storybook-static',
  fps: 30,
  size: [960, 540],
  theme: 'gradient-dusk',
  showArgsPanel: true,
  watermark: true,
  timings: {
    holdEnum: 300,
    tween: 700,
    captionGap: 250,
  },
  maxControls: 2,
  maxDuration: 6_000,
  poster: { at: 900 },
  output: { format: 'mp4', path: 'examples/card-tuned.mp4' },
  scenes: [
    {
      storyId: 'example-card--basic',
      steps: [
        { action: 'hold', ms: 400 },
        { action: 'caption', text: 'radius', ms: 250 },
        { action: 'tween', name: 'radius', from: 0, to: 32, ms: 700, easing: 'easeInOut', step: 1 },
        { action: 'hold', ms: 300 },
        { action: 'caption', text: 'elevation', ms: 250 },
        { action: 'tween', name: 'elevation', from: 0, to: 24, ms: 700, easing: 'easeInOut', step: 1 },
        { action: 'hold', ms: 400 },
      ],
    },
  ],
};

export default config;
