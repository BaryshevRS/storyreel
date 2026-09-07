import type { OutputFormat, ReelConfig, Scene } from '@storyreel/schema';

/** Serialize a config to a readable reel.config.ts source string. */
export function serializeConfig(config: {
  storybook: string;
  fps: number;
  size: [number, number];
  theme: string;
  showArgsPanel: boolean;
  watermark: boolean;
  output: { format: OutputFormat; path: string };
  scenes: Scene[];
}): string {
  const json = JSON.stringify(config, null, 2)
    // Keep it valid TS while staying JSON-clean.
    .replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1:');
  return `import type { ReelConfig } from '@storyreel/schema';

const config: ReelConfig = ${json};

export default config;
`;
}

/** Example config written by \`storyreel init\`. */
export function exampleConfig(): string {
  return `import type { ReelConfig } from '@storyreel/schema';

const config: ReelConfig = {
  storybook: 'http://localhost:6006',
  fps: 30,
  size: [1920, 1080],
  theme: 'gradient-dusk',
  showArgsPanel: true,
  watermark: true,
  output: { format: 'mp4', path: 'storyreel.mp4' },
  scenes: [
    {
      storyId: 'example-button--primary',
      initialArgs: { label: 'Click me' },
      steps: [
        { action: 'caption', text: 'size', ms: 400 },
        { action: 'setArg', name: 'size', value: 'small' },
        { action: 'hold', ms: 600 },
        { action: 'setArg', name: 'size', value: 'large' },
        { action: 'hold', ms: 800 },
      ],
    },
  ],
};

export default config;
`;
}
