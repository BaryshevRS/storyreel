import type { ReelConfig } from '@storyreel/schema';

// A 4-way enum (not just a boolean) pingponged: info -> success -> warning ->
// error -> back down to info, seamlessly. Combines with the toast's own CSS
// entrance/progress animations to prove virtual-time continuity holds even
// under a reversed frame sequence.
const config: ReelConfig = {
  storybook: 'fixtures/sb-fixture/storybook-static',
  fps: 30,
  size: [960, 540],
  theme: 'gradient-dusk',
  showArgsPanel: true,
  watermark: true,
  loop: 'pingpong',
  output: { format: 'gif', path: 'examples/toast-boomerang.gif' },
  scenes: [
    {
      storyId: 'example-toast--notification',
      steps: [
        { action: 'hold', ms: 400 },
        { action: 'caption', text: 'severity', ms: 300 },
        { action: 'setArg', name: 'severity', value: 'success' },
        { action: 'hold', ms: 500 },
        { action: 'setArg', name: 'severity', value: 'warning' },
        { action: 'hold', ms: 500 },
        { action: 'setArg', name: 'severity', value: 'error' },
        { action: 'hold', ms: 600 },
      ],
    },
  ],
};

export default config;
