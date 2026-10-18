import { DIMS, type ChartInput, type Dim } from '@true-size-chart/engine';
import type { Strings } from '../../strings';
import { h } from '../dom';
import type { ScreenRenderer } from '../element';

type Unit = 'cm' | 'in';

const DIM_LABEL: Record<Dim, keyof Strings> = { chest: 'chest', waist: 'waist', hip: 'hip', length: 'length', inseam: 'inseam' };
const BASIS_LABEL: Record<ChartInput['basis'], keyof Strings> = {
  garment_flat: 'basisFlat',
  garment_circ: 'basisCirc',
  body: 'basisBody',
};

/** As entered in the chart's own unit; converted: inches to 1 decimal, centimetres whole or 1 decimal. */
function cell(value: unknown, from: Unit, to: Unit): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (from === to) return String(value);
  return to === 'in' ? (value / 2.54).toFixed(1) : String(Math.round(value * 25.4) / 10);
}

/** The size chart tab: the merchant's table (flat stays flat), a cm | in toggle and how to measure. */
export const renderChart: ScreenRenderer = ({ config, strings: s }) => {
  const { table, unit, basis, howToMeasure } = config.chart;
  const dims = DIMS.filter((d) => table.measurements[d]);
  const cells: [HTMLElement, unknown][] = [];

  const rows = table.sizes.map((size, i) =>
    h(
      'tr',
      null,
      h('th', { scope: 'row' }, size),
      ...dims.map((d) => {
        const td = h('td');
        cells.push([td, table.measurements[d]?.[i]]);
        return td;
      }),
    ),
  );

  const toggles = (['cm', 'in'] as const).map((u) => {
    const button = h('button', { type: 'button', class: 'tsc-label', onclick: () => paint(u) }, u === 'cm' ? s.cm : s.inches);
    return [u, button] as const;
  });

  const paint = (shown: Unit) => {
    for (const [td, value] of cells) td.textContent = cell(value, unit, shown) ?? s.emptyCell;
    for (const [tu, button] of toggles) button.setAttribute('aria-pressed', String(tu === shown));
  };
  paint(unit);

  const how = howToMeasure?.trim();
  return h(
    'div',
    { class: 'tsc-chart' },
    h('div', { class: 'tsc-toggle' }, ...toggles.map(([, button]) => button)),
    h(
      'table',
      null,
      h('caption', { class: 'tsc-label' }, s[BASIS_LABEL[basis]] ?? null),
      h('thead', null, h('tr', null, h('td'), ...dims.map((d) => h('th', { scope: 'col', class: 'tsc-label' }, s[DIM_LABEL[d]])))),
      h('tbody', null, ...rows),
    ),
    how ? h('h3', { class: 'tsc-label' }, s.howToMeasure) : null,
    how ? h('p', { class: 'tsc-how' }, how) : null,
  );
};
