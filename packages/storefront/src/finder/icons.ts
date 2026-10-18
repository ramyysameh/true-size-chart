import type { ShapeStep } from '@true-size-chart/engine';

/** Thin single-stroke line icons (24 × 24) as path strings; `k` is the shape or fit step, −1 … 1. */
export const LOCK = 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z';
export const SHAPE_ICON: Record<'chest' | 'stomach' | 'hips', (k: ShapeStep) => string> = {
  chest: (k) => `M4 3v8q4 ${4 + 4 * k} 8 0q4 ${4 + 4 * k} 8 0V3`,
  stomach: (k) => `M9 3v5q${4 + 3 * k} 4 0 9v4`,
  hips: (k) => `M8 3q${-3 - 2 * k} 9 ${-1 - k} 18M16 3q${3 + 2 * k} 9 ${1 + k} 18`,
};
/** A tee whose body widens with `k`. */
export const fitIcon = (k: ShapeStep) =>
  `M10 4q2 3 4 0h${2 + k}l4 4-2 2-2-1v11H${8 - k}V9l-2 1-2-2 4-4z`;
/** Step 1's figure, 100 × 210 user units (1 unit = 1 cm at full height), head top at y = 0. */
export const FIGURE =
  'M38 12a12 12 0 1 0 24 0a12 12 0 1 0-24 0M45 24v6l-19 6q-6 2-7 10l-5 54h6l6-46 4 42 2 22 4 92h12l2-86 2 86h12l4-92 2-22 4-42 6 46h6l-5-54q-1-8-7-10l-19-6v-6';

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Record<string, string | number>, ...children: Element[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  el.append(...children);
  return el;
}

export const icon = (d: string) =>
  svg('svg', { class: 'tsc-ico', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d }));
