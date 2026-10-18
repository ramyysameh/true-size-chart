import type { ShapeStep } from '@true-size-chart/engine';
import { h, radioGroup } from '../dom';
import type { ScreenRenderer } from '../element';
import { SHAPE_ICON, icon } from '../icons';

const STEPS: readonly ShapeStep[] = [-1, 0, 1];
const ROWS = [
  ['chest', ['slimmer', 'average', 'broader']],
  ['stomach', ['flatter', 'average', 'rounder']],
  ['hips', ['narrower', 'average', 'fuller']],
] as const;

/** Step 2: chest, stomach and hips, each slimmer · average · broader. */
export const renderShape: ScreenRenderer = (ctx) => {
  const s = ctx.strings;
  return h(
    'div',
    { class: 'tsc-step' },
    h('h3', { class: 'tsc-title' }, s.step2Title),
    h('p', { class: 'tsc-sub' }, s.step2Sub),
    ...ROWS.map(([part, labels]) => {
      const id = `tsc-${part}`;
      return h(
        'div',
        { class: 'tsc-shape' },
        h('p', { class: 'tsc-label', id }, s[part]),
        radioGroup(
          id,
          'tsc-tile',
          STEPS,
          (k, i) => [icon(SHAPE_ICON[part](k)), h('span', { class: 'tsc-label' }, s[labels[i]!])],
          ctx.draft.shape[part],
          (k) => ctx.setDraft({ shape: { ...ctx.draft.shape, [part]: k } }),
        ),
      );
    }),
  );
};
