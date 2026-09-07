import type { Meta, StoryObj } from '@storybook/html-vite';

interface SpinnerArgs {
  size: number;
  thickness: number;
}

let injected = false;
function ensureKeyframes(): void {
  if (injected) return;
  const style = document.createElement('style');
  style.textContent = `@keyframes storyreel-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
  injected = true;
}

function render(args: SpinnerArgs): HTMLElement {
  ensureKeyframes();
  const wrap = document.createElement('div');
  wrap.style.cssText = `display:flex;align-items:center;justify-content:center;padding:24px;`;
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: ${args.size}px;
    height: ${args.size}px;
    border: ${args.thickness}px solid rgba(108,92,231,0.2);
    border-top-color: #6c5ce7;
    border-radius: 50%;
    animation: storyreel-spin 1s linear infinite;
  `;
  wrap.appendChild(spinner);
  return wrap;
}

const meta: Meta<SpinnerArgs> = {
  title: 'Example/Spinner',
  render,
  argTypes: {
    size: { control: { type: 'range', min: 24, max: 96, step: 2 } },
    thickness: { control: { type: 'range', min: 2, max: 12, step: 1 } },
  },
  args: {
    size: 48,
    thickness: 6,
  },
};

export default meta;

export const Loading: StoryObj<SpinnerArgs> = {};
