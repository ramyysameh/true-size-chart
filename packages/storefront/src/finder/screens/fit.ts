import type { FitPref } from '@true-size-chart/engine';
import { h, radioGroup } from '../dom';
import type { ScreenRenderer } from '../element';
import { fitIcon, icon } from '../icons';

const FITS: readonly FitPref[] = ['slim', 'regular', 'relaxed'];

/** Step 3: slim, regular or relaxed; the shell's Find my size goes on to the result. */
export const renderFit: ScreenRenderer = (ctx) => {
  const s = ctx.strings;
  return h(
    'div',
    { class: 'tsc-step' },
    h('h3', { class: 'tsc-title', id: 'tsc-fit' }, s.step3Title),
    h('p', { class: 'tsc-sub' }, s.step3Sub),
    radioGroup(
      'tsc-fit',
      'tsc-fitrow',
      FITS,
      (fit, i) => [
        icon(fitIcon((i - 1) as -1 | 0 | 1)),
        h('span', null, h('span', { class: 'tsc-label' }, s[fit]), h('span', { class: 'tsc-mute' }, s[`${fit}Desc` as const])),
        h('span', { class: 'tsc-dot' }),
      ],
      ctx.draft.fitPref,
      (fitPref) => ctx.setDraft({ fitPref }),
    ),
  );
};
