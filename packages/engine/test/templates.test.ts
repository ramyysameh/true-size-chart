import { describe, expect, it } from 'vitest';
import { normalizeChart } from '../src/chart';
import { recommend } from '../src/recommend';
import { TEMPLATE_CHARTS, referenceFor } from '../src/templates/charts';
import { TEMPLATES } from '../src/templates/copy';
import { TSHIRT_UNISEX } from '../src/templates/tshirt';
import type { ShopperProfile } from '../src/types';

const shopper = (sex: 'female' | 'male', heightCm: number, weightKg: number): ShopperProfile => ({
  sex,
  heightCm,
  weightKg,
  shape: { chest: 0, stomach: 0, hips: 0 },
  fitPref: 'regular',
});

const SHOPPERS = {
  women: { small: shopper('female', 155, 48), median: shopper('female', 165, 65), large: shopper('female', 175, 95) },
  unisex: { small: shopper('male', 165, 58), median: shopper('male', 178, 80), large: shopper('male', 190, 110) },
};

describe('starter templates', () => {
  it('has 14 unique, valid templates registered in TEMPLATE_CHARTS', () => {
    expect(TEMPLATES).toHaveLength(14);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(14);
    for (const t of TEMPLATES) {
      expect(() => normalizeChart(t.chart)).not.toThrow();
      expect(TEMPLATE_CHARTS[t.key]).toBe(t.chart);
    }
  });

  describe.each(TEMPLATES.map((t) => [t.key, t] as const))('%s', (_key, t) => {
    const group = SHOPPERS[t.audience];
    it('sizes the median shopper M or L, not between', () => {
      const rec = recommend(group.median, t.chart);
      expect(['M', 'L']).toContain(rec.size);
      expect(rec.band).not.toBe('between');
    });
    it('sizes the small shopper XS or S', () => {
      expect(['XS', 'S']).toContain(recommend(group.small, t.chart).size);
    });
    it('sizes the large shopper XL or XXL', () => {
      expect(['XL', 'XXL']).toContain(recommend(group.large, t.chart).size);
    });
  });

  it('lets fit preference move the answer', () => {
    const chart = TEMPLATE_CHARTS['pants-unisex']!;
    expect(recommend({ ...SHOPPERS.unisex.median, fitPref: 'slim' }, chart).size).toBe('M');
    expect(recommend({ ...SHOPPERS.unisex.median, fitPref: 'relaxed' }, chart).size).toBe('L');
  });
});

describe('referenceFor', () => {
  it('prefers the audience template and falls back to whichever exists', () => {
    expect(referenceFor('dress', 'men')).toBe(TEMPLATE_CHARTS['dress-women']);
    expect(referenceFor('pants', 'women')).toBe(TEMPLATE_CHARTS['pants-women']);
    expect(referenceFor('tshirt', null)).toBe(TSHIRT_UNISEX);
    expect(referenceFor('tshirt', 'women')).toBe(TEMPLATE_CHARTS['tshirt-women']);
  });
});
