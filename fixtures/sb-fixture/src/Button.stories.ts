import type { Meta, StoryObj } from '@storybook/html-vite';

interface ButtonArgs {
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  size: 'small' | 'medium' | 'large';
  disabled: boolean;
}

const COLORS: Record<ButtonArgs['variant'], string> = {
  primary: '#6c5ce7',
  secondary: '#636e72',
  danger: '#d63031',
};

const PADDING: Record<ButtonArgs['size'], string> = {
  small: '6px 12px',
  medium: '10px 20px',
  large: '16px 32px',
};

const FONT: Record<ButtonArgs['size'], string> = {
  small: '13px',
  medium: '16px',
  large: '20px',
};

function render(args: ButtonArgs): HTMLElement {
  const btn = document.createElement('button');
  btn.textContent = args.label;
  btn.disabled = args.disabled;
  btn.style.cssText = `
    background: ${COLORS[args.variant]};
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    padding: ${PADDING[args.size]};
    font-size: ${FONT[args.size]};
    opacity: ${args.disabled ? 0.5 : 1};
    transition: transform 120ms ease, background 120ms ease;
  `;
  return btn;
}

const meta: Meta<ButtonArgs> = {
  title: 'Example/Button',
  render,
  argTypes: {
    label: { control: 'text' },
    variant: { control: { type: 'select' }, options: ['primary', 'secondary', 'danger'] },
    size: { control: { type: 'select' }, options: ['small', 'medium', 'large'] },
    disabled: { control: 'boolean' },
  },
  args: {
    label: 'Click me',
    variant: 'primary',
    size: 'medium',
    disabled: false,
  },
};

export default meta;

export const Primary: StoryObj<ButtonArgs> = {};
export const Danger: StoryObj<ButtonArgs> = { args: { variant: 'danger' } };
