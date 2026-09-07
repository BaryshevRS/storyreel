import type { ReelConfig } from '@storyreel/schema';

// Booleans read as an on/off loop — pingpong makes the gif breathe instead of
// snapping back to "off" on every repeat. Points at the repo's own fixture
// Storybook (fixtures/sb-fixture) so it renders out of the box. Render with:
//   pnpm --filter @storyreel/sb-fixture build   (once, if storybook-static/ is missing)
//   storyreel render examples/boomerang.reel.config.ts --draft   (preview)
//   storyreel render examples/boomerang.reel.config.ts           (final)
const config: ReelConfig = {
  storybook: 'fixtures/sb-fixture/storybook-static',
  fps: 30,
  size: [960, 540],
  theme: 'gradient-dusk',
  showArgsPanel: true,
  watermark: true,
  loop: 'pingpong',
  output: { format: 'gif', path: 'examples/button-boomerang.gif' },
  scenes: [
    {
      storyId: 'example-button--primary',
      steps: [
        { action: 'hold', ms: 400 },
        { action: 'caption', text: 'disabled', ms: 400 },
        { action: 'setArg', name: 'disabled', value: true },
        { action: 'hold', ms: 700 },
      ],
    },
  ],
};

export default config;
