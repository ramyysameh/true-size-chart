import { describe, expect, it } from 'vitest';
import { planWrites, resolveChart, suggestRules, type ProductFacts, type Rule } from './rules';

function product(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    id: 'gid://shopify/Product/1',
    title: 'Tee',
    productType: 'T-Shirts',
    vendor: 'Acme',
    tags: ['Summer'],
    collectionIds: ['gid://shopify/Collection/9'],
    options: [{ name: 'Size', values: ['S', 'M'] }],
    chartId: null,
    ...over,
  };
}

function rule(over: Partial<Rule>): Rule {
  return { id: 'r', chartId: 'chart-a', type: 'vendor', value: 'nobody', priority: 0, ...over };
}

describe('resolveChart', () => {
  it('returns null without rules', () => {
    expect(resolveChart(product(), [])).toBeNull();
  });

  it('lets the lowest priority win regardless of input order', () => {
    const rules = [
      rule({ id: 'b', chartId: 'chart-b', type: 'vendor', value: 'Acme', priority: 2 }),
      rule({ id: 'a', chartId: 'chart-a', type: 'tag', value: 'summer', priority: 1 }),
    ];
    expect(resolveChart(product(), rules)).toBe('chart-a');
  });

  it('breaks priority ties by input order', () => {
    const rules = [
      rule({ id: 'b', chartId: 'chart-b', type: 'vendor', value: 'acme', priority: 1 }),
      rule({ id: 'a', chartId: 'chart-a', type: 'tag', value: 'summer', priority: 1 }),
    ];
    expect(resolveChart(product(), rules)).toBe('chart-b');
  });

  it('compares tag, product type and vendor case-insensitively and trimmed', () => {
    expect(resolveChart(product(), [rule({ type: 'tag', value: '  SUMMER ' })])).toBe('chart-a');
    expect(resolveChart(product(), [rule({ type: 'product_type', value: 't-shirts' })])).toBe('chart-a');
    expect(resolveChart(product(), [rule({ type: 'vendor', value: 'ACME' })])).toBe('chart-a');
    expect(resolveChart(product(), [rule({ type: 'tag', value: 'winter' })])).toBeNull();
  });

  it('matches product and collection rules by GID', () => {
    expect(
      resolveChart(product(), [rule({ type: 'collection', value: 'gid://shopify/Collection/9' })]),
    ).toBe('chart-a');
    expect(
      resolveChart(product(), [rule({ type: 'collection', value: 'gid://shopify/Collection/8' })]),
    ).toBeNull();
    expect(
      resolveChart(product(), [rule({ type: 'product', value: 'gid://shopify/Product/1' })]),
    ).toBe('chart-a');
    expect(
      resolveChart(product(), [rule({ type: 'product', value: 'gid://shopify/Product/2' })]),
    ).toBeNull();
  });
});

describe('planWrites', () => {
  it('writes nothing without rules, even when a product already has a chart', () => {
    const products = [product({ chartId: 'chart-a' }), product({ id: 'p2', chartId: null })];
    expect(planWrites(products, [])).toEqual({ set: [], unset: [] });
  });

  it('sets changed charts, skips unchanged ones and unsets products no rule matches', () => {
    const rules = [rule({ type: 'vendor', value: 'acme', chartId: 'chart-a' })];
    const products = [
      product({ id: 'same', chartId: 'chart-a' }),
      product({ id: 'new', chartId: null }),
      product({ id: 'changed', chartId: 'chart-old' }),
      product({ id: 'orphan', vendor: 'Other', chartId: 'chart-a' }),
      product({ id: 'none', vendor: 'Other', chartId: null }),
    ];
    expect(planWrites(products, rules)).toEqual({
      set: [
        { ownerId: 'new', chartId: 'chart-a' },
        { ownerId: 'changed', chartId: 'chart-a' },
      ],
      unset: ['orphan'],
    });
  });
});

describe('suggestRules', () => {
  const charts = [
    { id: 'tee', category: 'tshirt' as const },
    { id: 'shirt', category: 'shirt' as const },
    { id: 'pants', category: 'pants' as const },
    { id: 'pants-2', category: 'pants' as const },
    { id: 'hoodie', category: 'hoodie' as const },
  ];

  it('maps product types to chart categories by keyword', () => {
    expect(suggestRules(charts, ['T-Shirts', 'Shirts', 'Denim Jeans'])).toEqual([
      { chartId: 'tee', type: 'product_type', value: 'T-Shirts' },
      { chartId: 'shirt', type: 'product_type', value: 'Shirts' },
      { chartId: 'pants', type: 'product_type', value: 'Denim Jeans' },
    ]);
  });

  it('does not let shirt match inside t-shirt or sweatshirt', () => {
    expect(suggestRules([{ id: 'shirt', category: 'shirt' }], ['T-Shirt', 'Sweatshirts'])).toEqual([]);
    expect(suggestRules(charts, ['Sweatshirts'])).toEqual([
      { chartId: 'hoodie', type: 'product_type', value: 'Sweatshirts' },
    ]);
  });

  it('skips product types without a keyword or without a chart of that category', () => {
    expect(suggestRules(charts, ['Mugs', '', 'Dresses', 'Teen Accessories'])).toEqual([]);
  });

  it('suggests each product type once', () => {
    expect(suggestRules(charts, ['Tees', 'tees'])).toEqual([
      { chartId: 'tee', type: 'product_type', value: 'Tees' },
    ]);
  });
});
