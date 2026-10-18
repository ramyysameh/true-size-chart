import { cmToFtIn, ftInToCm, kgToLbs, lbsToKg } from '@true-size-chart/engine';
import { toChartInput } from '../../config';
import { liveEstimate, type Draft } from '../../model';
import type { Units } from '../../profile-store';
import { h } from '../dom';
import type { ScreenRenderer } from '../element';
import { FIGURE, LOCK, icon, svg } from '../icons';
import { createSlider } from '../slider';

/** One unit's slider: range and value in that unit; `write` turns a value into the cm / kg the draft stores. */
interface Spec {
  min: number;
  max: number;
  value: number;
  text(v: number): string;
  write(v: number): Partial<Draft>;
}

/** Segmented aria-pressed buttons; `onPick` runs only when the choice changes. */
function segmented<T extends string>(options: readonly (readonly [T, string])[], current: T, onPick: (v: T) => void): HTMLElement {
  const buttons = options.map(([v, label]) =>
    h('button', {
      type: 'button',
      class: 'tsc-label',
      onclick: () => {
        if (v === current) return;
        current = v;
        paint();
        onPick(v);
      },
    }, label),
  );
  const paint = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]![0] === current)));
  paint();
  return h('div', { class: 'tsc-toggle' }, ...buttons);
}

/** Step 1: sex, height and weight with a live size estimate. Patches its own nodes; never re-renders. */
export const renderBody: ScreenRenderer = (ctx) => {
  const s = ctx.strings;
  const chart = toChartInput(ctx.config.chart);
  const est = h('span', { class: 'tsc-num tsc-est', 'aria-live': 'polite' });
  const figure = svg('g', {}, svg('path', { d: FIGURE }));
  const head = svg('line', { x1: 0, x2: 100 });

  const paint = () => {
    const { heightCm: cm, weightKg: kg } = ctx.draft;
    const sx = Math.min(1.3, Math.max(0.8, Math.sqrt(kg / (cm / 100) ** 2 / 22)));
    figure.setAttribute('transform', `translate(50 210)scale(${sx.toFixed(3)} ${(cm / 210).toFixed(3)})translate(-50 -210)`);
    const y = String(+(210 - cm).toFixed(1));
    head.setAttribute('y1', y);
    head.setAttribute('y2', y);
    est.textContent = liveEstimate(ctx.draft, chart) ?? s.emptyCell;
  };
  const update = (patch: Partial<Draft>) => {
    ctx.setDraft(patch);
    paint();
  };

  const height = (u: Units['height']): Spec => {
    if (u === 'cm') return { min: 140, max: 210, value: Math.round(ctx.draft.heightCm), text: (v) => `${v} ${s.cm}`, write: (v) => ({ heightCm: v }) };
    const { ft, inch } = cmToFtIn(ctx.draft.heightCm);
    return {
      min: 55,
      max: 83,
      value: ft * 12 + inch,
      text: (v) => `${Math.floor(v / 12)} ${s.feet} ${v % 12} ${s.inches}`,
      write: (v) => ({ heightCm: ftInToCm(Math.floor(v / 12), v % 12) }),
    };
  };
  const weight = (u: Units['weight']): Spec =>
    u === 'kg'
      ? { min: 40, max: 150, value: Math.round(ctx.draft.weightKg), text: (v) => `${v} ${s.kg}`, write: (v) => ({ weightKg: v }) }
      : { min: 88, max: 330, value: Math.round(kgToLbs(ctx.draft.weightKg)), text: (v) => `${v} ${s.lbs}`, write: (v) => ({ weightKg: lbsToKg(v) }) };

  /** Label, unit toggle, large value and slider; a unit switch swaps in that unit's slider. */
  const measure = <U extends string>(label: string, units: readonly (readonly [U, string])[], unit: U, spec: (u: U) => Spec, setUnit: (u: U) => void) => {
    const val = h('p', { class: 'tsc-val' });
    const slot = h('div');
    const show = (text: string) => val.replaceChildren(...text.split(/(\d+)/).map((part, i) => (i % 2 ? h('span', { class: 'tsc-num' }, part) : part)));
    const mount = (u: U) => {
      const sp = spec(u);
      const slider = createSlider({
        label,
        min: sp.min,
        max: sp.max,
        step: 1,
        value: sp.value,
        valueText: sp.text,
        onInput: (v) => {
          update(sp.write(v));
          show(sp.text(v));
        },
      });
      slot.replaceChildren(slider.el);
      show(sp.text(Math.min(sp.max, Math.max(sp.min, sp.value))));
    };
    mount(unit);
    return h(
      'div',
      { class: 'tsc-measure' },
      h('div', { class: 'tsc-row' }, h('p', { class: 'tsc-label' }, label), segmented(units, unit, (u) => {
        setUnit(u);
        mount(u);
      })),
      val,
      slot,
    );
  };

  paint();
  return h(
    'div',
    { class: 'tsc-step' },
    h('h3', { class: 'tsc-title' }, s.step1Title),
    h('p', { class: 'tsc-sub' }, s.step1Sub),
    h('div', { class: 'tsc-row' }, h('p', { class: 'tsc-label' }, s.sizing), segmented([['female', s.female], ['male', s.male]], ctx.draft.sex, (sex) => update({ sex }))),
    h(
      'div',
      { class: 'tsc-bodyfit' },
      svg('svg', { class: 'tsc-fig', viewBox: '0 0 100 210', 'aria-hidden': 'true' }, head, figure),
      h(
        'div',
        null,
        measure(s.height, [['cm', s.cm], ['ftin', s.ftin]], ctx.draft.units.height, height, (u) => ctx.setDraft({ units: { ...ctx.draft.units, height: u } })),
        measure(s.weight, [['kg', s.kg], ['lbs', s.lbs]], ctx.draft.units.weight, weight, (u) => ctx.setDraft({ units: { ...ctx.draft.units, weight: u } })),
      ),
    ),
    h('div', { class: 'tsc-live' }, h('div', null, h('p', { class: 'tsc-label' }, s.liveEstimate), h('p', { class: 'tsc-mute' }, s.liveSub)), est),
    h('p', { class: 'tsc-privacy' }, icon(LOCK), s.privacy),
  );
};
