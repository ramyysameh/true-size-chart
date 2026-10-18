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

  it('throws ChartError when a measurement row length differs from sizes', () => {
    expect(() => normalizeChart({ ...base, sizes: ['S', 'M'], measurements: { chest: [20] } })).toThrow(ChartError);
  });
});
