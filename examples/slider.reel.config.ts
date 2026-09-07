import type { ReelConfig } from '@storyreel/schema';

// Ручная правка авто-конфига: инструмент не знал диапазон value,
// автор — знает. Один tween вместо перебора булевых флагов.
const config: ReelConfig = {
  storybook: 'https://react.carbondesignsystem.com',
  fps: 30,
  size: [1280, 720],
  theme: 'gradient-dusk',
  showArgsPanel: true,
  watermark: true,
  output: { format: 'mp4', path: 'examples/slider-manual.mp4' },
  scenes: [
    {
      storyId: 'components-slider--default',
      steps: [
        { action: 'hold', ms: 600 },
        { action: 'caption', text: 'value', ms: 400 },
        { action: 'tween', name: 'value', from: 0, to: 100, ms: 2000, easing: 'easeInOut', step: 5 },
        { action: 'hold', ms: 400 },
        { action: 'tween', name: 'value', from: 100, to: 50, ms: 1000, easing: 'easeOut', step: 5 },
        { action: 'caption', text: 'disabled', ms: 400 },
        { action: 'setArg', name: 'disabled', value: true },
        { action: 'hold', ms: 800 },
      ],
    },
  ],
};

export default config;
