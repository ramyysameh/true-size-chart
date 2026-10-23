import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@true-size-chart/engine';
import {
  blankDraft,
  convertUnit,
  draftFromTemplate,
  fromFields,
  newHandle,
  norm,
  pruneAliases,
  toChartInput,
  toFields,
  validateDraft,
  type ChartDraft,
} from './chart-model';

const tpl = TEMPLATES[0];

function valid(): ChartDraft {
  const d = draftFromTemplate(tpl);
  return d;
}

describe('norm', () => {
  it('trims and lower-cases', () => expect(norm('  XL ')).toBe('xl'));
});

describe('draftFromTemplate', () => {
  it('has null id/handle and the template fields', () => {
    const d = draftFromTemplate(tpl);
    expect(d.id).toBeNull();
    expect(d.handle).toBeNull();
    expect(d.name).toBe(tpl.name);
    expect(d.category).toBe(tpl.category);
    expect(d.howToMeasure).toBe(tpl.howToMeasure);
    expect(d.table.sizes).toEqual(tpl.chart.sizes);
  });

  it('deep-copies so editing a draft never changes TEMPLATES', () => {
    for (const t of TEMPLATES) {
      const before = JSON.stringify(t);
      const d = draftFromTemplate(t);
      d.table.sizes.push('ZZ');
      for (const col of Object.values(d.table.measurements)) {
        col![0] = 9999;
        col!.push(1);
      }
      expect(JSON.stringify(t)).toBe(before);
    }
  });
});

describe('blankDraft', () => {
  it('is an empty unisex t-shirt', () => {
    const d = blankDraft();
    expect(d).toMatchObject({
      id: null,
      handle: null,
      name: '',
      category: 'tshirt',
      audience: 'unisex',
      unit: 'cm',
      basis: 'garment_flat',
      intendedFit: 'regular',
    });
    expect(d.table).toEqual({
      sizes: ['S', 'M', 'L', 'XL'],
      measurements: { chest: [null, null, null, null], length: [null, null, null, null] },
    });
  });
});

describe('toFields / fromFields', () => {
  it('writes the 8 TOML keys with the table as JSON', () => {
    const f = toFields(valid());
    expect(f.map((x) => x.key)).toEqual([
      'name', 'category', 'audience', 'unit', 'basis', 'intended_fit', 'table', 'how_to_measure',
    ]);
    expect(JSON.parse(f.find((x) => x.key === 'table')!.value).sizes).toEqual(tpl.chart.sizes);
  });

  it('round-trips with id and handle set', () => {
    const d = valid();
    d.table.aliases = { small: d.table.sizes[0] };
    const back = fromFields('gid://x/1', 'h', toFields(d));
    expect(back).toEqual({ ...d, id: 'gid://x/1', handle: 'h' });
  });

  it('never throws on bad JSON and falls back on unknown choices', () => {
    const d = fromFields('i', 'h', [
      { key: 'name', value: 'N' },
      { key: 'category', value: 'cape' },
      { key: 'audience', value: 'kids' },
      { key: 'unit', value: 'yd' },
      { key: 'basis', value: 'x' },
      { key: 'intended_fit', value: 'baggy' },
      { key: 'table', value: '{nope' },
      { key: 'how_to_measure', value: null },
    ]);
    const b = blankDraft();
    expect(d).toMatchObject({
      name: 'N', category: b.category, audience: b.audience, unit: b.unit, basis: b.basis,
      intendedFit: b.intendedFit, howToMeasure: '',
    });
    expect(d.table).toEqual({ sizes: [], measurements: {} });
  });

  it('treats a malformed table shape as empty', () => {
    const d = fromFields('i', 'h', [{ key: 'table', value: '{"sizes":"S"}' }]);
    expect(d.table).toEqual({ sizes: [], measurements: {} });
  });

  it('prunes aliases when writing fields', () => {
    const d = valid();
    d.table.aliases = { gone: 'NOPE', ' Small ': d.table.sizes[0] };
    const table = JSON.parse(toFields(d).find((x) => x.key === 'table')!.value);
    expect(table.aliases).toEqual({ small: d.table.sizes[0] });
  });
});

describe('pruneAliases', () => {
  const table = { sizes: ['S', 'M'], measurements: { chest: [1, 2] } };

  it('drops aliases whose size was removed', () => {
    const out = pruneAliases({ ...table, aliases: { small: 'S', large: 'L' } });
    expect(out.aliases).toEqual({ small: 'S' });
  });

  it('matches target sizes by norm', () => {
    const out = pruneAliases({ ...table, aliases: { small: ' s ' } });
    expect(out.aliases).toEqual({ small: 'S' });
  });

  it('normalizes alias keys', () => {
    const out = pruneAliases({ ...table, aliases: { ' Small ': 'S' } });
    expect(out.aliases).toEqual({ small: 'S' });
  });

  it('omits aliases when none survive and does not mutate the input', () => {
    const input = { ...table, aliases: { x: 'Z' } };
    const out = pruneAliases(input);
    expect(out.aliases).toBeUndefined();
    expect(input.aliases).toEqual({ x: 'Z' });
  });
});

describe('toChartInput', () => {
  it('maps draft fields to a ChartInput', () => {
    const d = valid();
    const c = toChartInput(d);
    expect(c).toMatchObject({ unit: d.unit, basis: d.basis, category: d.category, intendedFit: d.intendedFit });
    expect(c.sizes).toEqual(d.table.sizes);
  });
});

describe('validateDraft', () => {
  it('accepts a template draft with no errors or warnings', () => {
    expect(validateDraft(valid())).toEqual({ errors: [], warnings: [] });
  });

  it('requires a name and sizes', () => {
    const d = valid();
    d.name = '  ';
    d.table = { sizes: [], measurements: {} };
    const { errors } = validateDraft(d);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects duplicate sizes after norm', () => {
    const d = valid();
    d.table.sizes[1] = ` ${d.table.sizes[0].toLowerCase()} `;
    expect(validateDraft(d).errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  it('surfaces engine ChartError messages', () => {
    const d = valid();
    d.table.measurements.chest = [1];
    const { errors } = validateDraft(d);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('warns, without erroring, when the finder cannot score the chart', () => {
    const d = blankDraft();
    d.name = 'Blank';
    const r = validateDraft(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      "The finder can't score this chart, so shoppers will only see the size chart. Add a chest column (tops/dresses) or a waist column (bottoms).",
    ]);
  });
});

describe('convertUnit', () => {
  it('converts cm to in and rounds to 0.5, leaving nulls', () => {
    const d = blankDraft();
    d.table.measurements = { chest: [100, null, 50.8], length: [70, 71, 72] };
    const out = convertUnit(d, 'in');
    expect(out.unit).toBe('in');
    expect(out.table.measurements.chest).toEqual([39.5, null, 20]);
    expect(d.unit).toBe('cm');
    expect(d.table.measurements.chest).toEqual([100, null, 50.8]);
  });

  it('converts in to cm', () => {
    const d = { ...blankDraft(), unit: 'in' as const };
    d.table.measurements = { chest: [40, null] };
    expect(convertUnit(d, 'cm').table.measurements.chest).toEqual([101.5, null]);
  });
});

describe('newHandle', () => {
  it('slugs the name and appends base36 time', () => {
    expect(newHandle('T-shirt (women)', 1730000000000)).toBe('t-shirt-women-' + (1730000000000).toString(36));
  });
  it('caps the slug at 40 chars without a trailing dash', () => {
    const h = newHandle('a'.repeat(39) + ' bbbbbb', 1);
    expect(h).toBe('a'.repeat(39) + '-1');
  });
  it('falls back to chart', () => {
    expect(newHandle('!!!', 1)).toBe('chart-1');
  });
});
