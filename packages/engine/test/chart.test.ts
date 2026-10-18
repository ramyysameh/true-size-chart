import { describe, expect, it } from 'vitest';
import { normalizeChart } from '../src/chart';
import { ChartError, type ChartInput } from '../src/types';

const base: ChartInput = {
  sizes: ['M'],
  measurements: { chest: [20], length: [28] },
  unit: 'in',
  basis: 'garment_flat',
  category: 'tshirt',
  intendedFit: 'regular',
};

describe('normalizeChart', () => {
  it('converts inches to cm and doubles flat girths but not lengths', () => {
    const n = normalizeChart(base);
    expect(n.measurements.chest?.[0]).toBeCloseTo(101.6, 6);
    expect(n.measurements.length?.[0]).toBeCloseTo(71.12, 6);
    expect(n.basis).toBe('garment');
  });

  it('keeps circumference cm charts unchanged and maps body basis', () => {
    const n = normalizeChart({ ...base, unit: 'cm', basis: 'body', measurements: { chest: [100] } });
    expect(n.measurements.chest).toEqual([100]);
    expect(n.basis).toBe('body');
  });

  it('preserves null entries', () => {
    const n = normalizeChart({ ...base, sizes: ['S', 'M'], measurements: { chest: [null, 20] } });
    expect(n.measurements.chest?.[0]).toBeNull();
  });

  it('throws ChartError for empty sizes', () => {
    expect(() => normalizeChart({ ...base, sizes: [], measurements: {} })).toThrow(ChartError);
  });

  const bad = (patch: Record<string, unknown>) => ({ ...base, ...patch }) as unknown as ChartInput;

  it.each([
    ['an unknown unit', { unit: 'IN' }],
    ['an unknown basis', { basis: 'flat' }],
    ['an unknown category', { category: 'Tshirt' }],
    ['an unknown intended fit', { intendedFit: 'boxy' }],
    ['missing measurements', { measurements: undefined }],
    ['missing sizes', { sizes: undefined }],
    ['an empty-string cell', { measurements: { chest: [''], length: [28] } }],
    ['a text cell', { measurements: { chest: ['abc'], length: [28] } }],
    ['a zero cell', { measurements: { chest: [0], length: [28] } }],
    ['a negative cell', { measurements: { chest: [-20], length: [28] } }],
    ['a non-finite cell', { measurements: { chest: [Infinity], length: [28] } }],
  ])('throws ChartError for %s', (_, patch) => {
    expect(() => normalizeChart(bad(patch))).toThrow(ChartError);
  });

  it('ignores measurement columns the engine does not score', () => {
    const n = normalizeChart(bad({ measurements: { chest: [20], sleeve: [9] } }));
    expect(Object.keys(n.measurements)).toEqual(['chest']);
  });

  it('throws ChartError when a measurement row length differs from sizes', () => {
    expect(() => normalizeChart({ ...base, sizes: ['S', 'M'], measurements: { chest: [20] } })).toThrow(ChartError);
  });
});
