import type { Meta, StoryObj } from '@storybook/html-vite';

interface ToastArgs {
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  dismissible: boolean;
  autoDismissMs: number;
}

const SEVERITY: Record<ToastArgs['severity'], { bg: string; icon: string }> = {
  info: { bg: '#2d3436', icon: 'ℹ' },
  success: { bg: '#00875a', icon: '✓' },
  warning: { bg: '#b7791f', icon: '⚠' },
  error: { bg: '#c0392b', icon: '✕' },
};

let injected = false;
function ensureKeyframes(): void {
  if (injected) return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes storyreel-toast-in {
      from { transform: translateY(-14px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes storyreel-toast-progress {
      from { width: 100%; }
      to { width: 0%; }
    }
  `;
  document.head.appendChild(style);
  injected = true;
}

function render(args: ToastArgs): HTMLElement {
  ensureKeyframes();
  const s = SEVERITY[args.severity];

  const toast = document.createElement('div');
  toast.style.cssText = `
    width: 340px;
    background: ${s.bg};
    color: white;
    border-radius: 12px;
    padding: 14px 16px;
    font-family: system-ui, sans-serif;
    box-shadow: 0 10px 28px rgba(0,0,0,0.28);
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    overflow: hidden;
    animation: storyreel-toast-in 300ms ease-out;
  `;

  const icon = document.createElement('span');
  icon.textContent = s.icon;
  icon.style.cssText = 'font-size:18px; font-weight:700; line-height:1;';

  const msg = document.createElement('span');
  msg.textContent = args.message;
  msg.style.cssText = 'flex:1; font-size:14px; line-height:1.3;';

  toast.appendChild(icon);
  toast.appendChild(msg);

  if (args.dismissible) {
    const close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Dismiss');
    close.style.cssText =
      'background:none;border:none;color:white;opacity:0.7;cursor:pointer;font-size:14px;padding:0;';
    toast.appendChild(close);
  }

  const bar = document.createElement('div');
  bar.style.cssText = `
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: rgba(255,255,255,0.65);
    width: 100%;
    animation: storyreel-toast-progress ${args.autoDismissMs}ms linear forwards;
  `;
  toast.appendChild(bar);

  return toast;
}

const meta: Meta<ToastArgs> = {
  title: 'Example/Toast',
  render,
  argTypes: {
    message: { control: 'text' },
    severity: {
      control: { type: 'select' },
      options: ['info', 'success', 'warning', 'error'],
    },
    dismissible: { control: 'boolean' },
    autoDismissMs: { control: { type: 'range', min: 1000, max: 6000, step: 500 } },
  },
  args: {
    message: 'Changes saved successfully.',
    severity: 'success',
    dismissible: true,
    autoDismissMs: 4000,
  },
};

export default meta;

export const Notification: StoryObj<ToastArgs> = {};
