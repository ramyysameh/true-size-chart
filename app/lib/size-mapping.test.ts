import { describe, expect, it } from 'vitest';
import type { ChartDraft } from './chart-model';
import type { ProductFacts } from './rules';
import {
  groupIssuesByChart,
  mappingIssues,
  mergeAliases,
  parseSizeOptionNames,
  sizeOptionValues,
  unmatchedValues,
} from './size-mapping';

const product = (o: Partial<ProductFacts>): ProductFacts => ({
  id: 'p1',
  title: 'Tee',
  productType: '',
  vendor: '',
  tags: [],
  collectionIds: [],
  options: [{ name: 'Size', values: ['S', 'M'] }],
  chartId: 'c1',
  ...o,
});
const chart = (aliases?: Record<string, string>): ChartDraft =>
  ({
    id: 'c1',
    handle: 'h',
    name: 'Tee chart',
    table: { sizes: ['S', 'M', 'XL'], measurements: {}, ...(aliases ? { aliases } : {}) },
  }) as unknown as ChartDraft;

describe('unmatchedValues', () => {
  it('honours aliases and trims/normalises', () => {
    expect(unmatchedValues(['Small', 'M', 'XL '], ['S', 'M', 'XL'], { small: 'S' })).toEqual([]);
    expect(unmatchedValues(['Small', 'M', 'XL '], ['S', 'M', 'XL'])).toEqual(['Small']);
  });
  it('de-duplicates', () => {
    expect(unmatchedValues(['Small', 'small '], ['S'])).toEqual(['Small']);
  });
});

describe('sizeOptionValues', () => {
  it('matches case/space-insensitively', () => {
    expect(sizeOptionValues(product({}), ['size '])).toEqual(['S', 'M']);
  });
  it('null when no option is listed', () => {
    expect(sizeOptionValues(product({ options: [{ name: 'Color', values: ['Red'] }] }), ['Size'])).toBeNull();
  });
});

describe('mappingIssues', () => {
  const charts = new Map([['c1', chart()]]);
  it('reports unmatched values and missing size options, skips clean/unassigned products', () => {
    const issues = mappingIssues(
      [
        product({ id: 'a', options: [{ name: 'Size', values: ['Small', 'M'] }] }),
        product({ id: 'b', options: [{ name: 'Color', values: ['Red'] }] }),
        product({ id: 'c' }),
        product({ id: 'd', chartId: null, options: [{ name: 'Size', values: ['Huge'] }] }),
      ],
      charts,
      ['Size'],
    );
    expect(issues).toEqual([
      { productId: 'a', productTitle: 'Tee', chartId: 'c1', unmatched: ['Small'], noSizeOption: false },
      { productId: 'b', productTitle: 'Tee', chartId: 'c1', unmatched: [], noSizeOption: true },
    ]);
  });
});

describe('groupIssuesByChart', () => {
  it('merges the same value across products', () => {
    const groups = groupIssuesByChart([
      { productId: 'a', productTitle: 'A', chartId: 'c1', unmatched: ['Small'], noSizeOption: false },
      { productId: 'b', productTitle: 'B', chartId: 'c1', unmatched: ['small'], noSizeOption: false },
      { productId: 'c', productTitle: 'C', chartId: 'c1', unmatched: [], noSizeOption: true },
    ]);
    expect(groups).toEqual([
      {
        chartId: 'c1',
        values: [{ value: 'Small', products: ['A', 'B'] }],
        noSizeOption: [{ productId: 'c', productTitle: 'C' }],
      },
    ]);
  });
});

describe('mergeAliases', () => {
  it('keeps existing, norms keys, drops unknown targets', () => {
    expect(mergeAliases(['S', 'M'], { Medium: 'M' }, { ' Small ': 's', Huge: 'XXL', '': 'S' })).toEqual({
      medium: 'M',
      small: 'S',
    });
  });
});

describe('parseSizeOptionNames', () => {
  it('trims and drops empties', () => {
    expect(parseSizeOptionNames(' Size, ,Talla ,')).toEqual(['Size', 'Talla']);
    expect(parseSizeOptionNames('')).toEqual([]);
  });
});
