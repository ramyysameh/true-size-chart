import { describe, expect, it } from 'vitest';
import type { FinderConfig } from '../src/config';
import type { FinderContext } from '../src/finder/element';
import { renderChart } from '../src/finder/screens/chart';
import { defaultDraft } from '../src/model';
import { STRINGS } from '../src/strings';
import { CONFIG } from './fixtures/config';

function render(chart: Partial<FinderConfig['chart']>): HTMLElement {
  const config: FinderConfig = { ...CONFIG, chart: { ...CONFIG.chart, ...chart } };
  const ctx: FinderContext = {
    config,
    strings: { ...STRINGS },
    draft: defaultDraft(config, null, 'en-GB'),
    setDraft() {},
    go() {},
    close() {},
  };
  return renderChart(ctx);
}

const texts = (root: HTMLElement, sel: string) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const unitButton = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label)!;

const FLAT: Partial<FinderConfig['chart']> = {
  unit: 'cm',
  basis: 'garment_flat',
  table: { sizes: ['S', 'M', 'L'], measurements: { chest: [49, 52, null], length: [70, 72, 74] } },
};

describe('size chart tab', () => {
  it('renders a header row of measurement names and one row per size, as entered', () => {
    const root = render(FLAT);
    expect(texts(root, 'thead th')).toEqual(['Chest', 'Length']);
    expect(texts(root, 'tbody th')).toEqual(['S', 'M', 'L']);
    expect(texts(root, 'tbody tr:first-child td')).toEqual(['49', '70']);
  });

  it('starts in the chart unit and converts to inches with one decimal', () => {
    const root = render(FLAT);
    const chest = () => texts(root, 'tbody td:nth-of-type(1)');
    expect(unitButton(root, 'cm').getAttribute('aria-pressed')).toBe('true');
    expect(chest()).toEqual(['49', '52', '—']);

    unitButton(root, 'in').click();
    expect(chest()).toEqual(['19.3', '20.5', '—']);
    expect(unitButton(root, 'in').getAttribute('aria-pressed')).toBe('true');
    expect(unitButton(root, 'cm').getAttribute('aria-pressed')).toBe('false');

    unitButton(root, 'cm').click();
    expect(chest()).toEqual(['49', '52', '—']);
  });

  it('converts an inch chart to whole or one-decimal centimetres', () => {
    const root = render({ unit: 'in', table: { sizes: ['S', 'M'], measurements: { chest: [20, 21.5] } } });
    expect(unitButton(root, 'in').getAttribute('aria-pressed')).toBe('true');
    expect(texts(root, 'tbody td')).toEqual(['20', '21.5']);
    unitButton(root, 'cm').click();
    expect(texts(root, 'tbody td')).toEqual(['50.8', '54.6']);
  });

  it('captions the table from the basis', () => {
    expect(render(FLAT).querySelector('caption')?.textContent).toBe('Garment measured flat');
    expect(render({ ...FLAT, basis: 'garment_circ' }).querySelector('caption')?.textContent).toBe('Garment measurements');
    expect(render({ ...FLAT, basis: 'body' }).querySelector('caption')?.textContent).toBe('Body measurements');
  });

  it('shows how to measure only when the chart has the text', () => {
    expect(render({ ...FLAT, howToMeasure: null }).textContent).not.toContain('How to measure');
    expect(render({ ...FLAT, howToMeasure: '  ' }).textContent).not.toContain('How to measure');
    const root = render({ ...FLAT, howToMeasure: 'Lay the tee flat.' });
    expect(root.textContent).toContain('How to measure');
    expect(root.textContent).toContain('Lay the tee flat.');
  });

  it('shows the empty cell for a ragged measurement array', () => {
    const root = render({ table: { sizes: ['S', 'M'], measurements: { chest: [49] } } });
    expect(texts(root, 'tbody td')).toEqual(['49', '—']);
  });
});
