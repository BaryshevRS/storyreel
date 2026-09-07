import type { Meta, StoryObj } from '@storybook/html-vite';

interface CardArgs {
  radius: number;
  padding: number;
  elevation: number;
}

function render(args: CardArgs): HTMLElement {
  const card = document.createElement('div');
  const shadow = `0 ${args.elevation}px ${args.elevation * 2}px rgba(0,0,0,0.18)`;
  card.style.cssText = `
    width: 260px;
    background: #ffffff;
    border: 1px solid #eee;
    border-radius: ${args.radius}px;
    padding: ${args.padding}px;
    box-shadow: ${shadow};
    font-family: system-ui, sans-serif;
    color: #2d3436;
  `;
  const h = document.createElement('h3');
  h.textContent = 'Card title';
  h.style.margin = '0 0 8px';
  const p = document.createElement('p');
  p.textContent = 'A little body copy to give the card some substance.';
  p.style.margin = '0';
  p.style.color = '#636e72';
  card.appendChild(h);
  card.appendChild(p);
  return card;
}

const meta: Meta<CardArgs> = {
  title: 'Example/Card',
  render,
  argTypes: {
    radius: { control: { type: 'range', min: 0, max: 32, step: 1 } },
    padding: { control: { type: 'range', min: 8, max: 48, step: 1 } },
    elevation: { control: { type: 'range', min: 0, max: 24, step: 1 } },
  },
  args: {
    radius: 12,
    padding: 20,
    elevation: 8,
  },
};

export default meta;

export const Basic: StoryObj<CardArgs> = {};
