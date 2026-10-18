import { describe, expect, it } from 'vitest';
import { recommend } from '../src/recommend';
import { targetFor } from '../src/ease';
import type { ChartInput, ShopperProfile } from '../src/types';
import type { BodyEstimate } from '../src/body';

const profile: ShopperProfile = {
  sex: 'male',
  heightCm: 180,
  weightKg: 89,
  shape: { chest: 0, stomach: 0, hips: 0 },
  fitPref: 'regular',
};

const cmCirc: ChartInput = {
  sizes: ['S', 'M', 'L', 'XL', 'XXL'],
  measurements: { chest: [96, 104, 112, 120, 128], length: [70, 72, 74, 76, 78] },
  unit: 'cm',
  basis: 'garment_circ',
  category: 'tshirt',
  intendedFit: 'regular',
};

const body: BodyEstimate = { chest: 100, waist: 90, hip: 100, inseam: 80, heightCm: 180 };

describe('targetFor', () => {
  it('adds regular tops ease to chest and derives length from height', () => {
    const t = targetFor(body, { ...cmCirc, basis: 'garment', measurements: {} }, 'regular');
    expect(t.chest).toBeCloseTo(108, 9);
    expect(t.waist).toBeCloseTo(104.4, 9);
    expect(t.length).toBeCloseTo(72, 9);
  });

  it('adds hoodie and oversized allowances', () => {
    const t = targetFor(body, { ...cmCirc, basis: 'garment', category: 'hoodie', intendedFit: 'oversized', measurements: {} }, 'slim');
    expect(t.chest).toBeCloseTo(100 * (1 + 0.04 + 0.06 + 0.1), 9);
  });

  it('uses no ease and no length for body-basis charts', () => {
    const t = targetFor(body, { ...cmCirc, basis: 'body', intendedFit: 'oversized', measurements: {} }, 'relaxed');
    expect(t.chest).toBe(100);
    expect(t.length).toBeUndefined();
  });

  it('targets waist, hip and inseam for pants and no inseam for shorts', () => {
    const pants = targetFor(body, { ...cmCirc, basis: 'garment', category: 'pants', measurements: {} }, 'regular');
    expect(pants.waist).toBeCloseTo(91.8, 9);
    expect(pants.hip).toBeCloseTo(108, 9);
    expect(pants.inseam).toBe(80);
    expect(pants.chest).toBeUndefined();
    const shorts = targetFor(body, { ...cmCirc, basis: 'garment', category: 'shorts', measurements: {} }, 'regular');
    expect(shorts.inseam).toBeUndefined();
  });
});

describe('recommend', () => {
  it('gives the same answer for an equivalent inch / flat chart', () => {
    const inFlat: ChartInput = {
      ...cmCirc,
      unit: 'in',
      basis: 'garment_flat',
      measurements: {
        chest: cmCirc.measurements.chest!.map((v) => v! / 2 / 2.54),
        length: cmCirc.measurements.length!.map((v) => v! / 2.54),
      },
    };
    const a = recommend(profile, cmCirc);
    const b = recommend(profile, inFlat);
    expect(b.size).toBe(a.size);
    expect(b.runnerUp).toBe(a.runnerUp);
    expect(b.fitMatch).toBe(a.fitMatch);
    expect(b.band).toBe(a.band);
    expect(b.outOfRange).toBe(a.outOfRange);
    b.areas.forEach((area, i) => expect(area.delta).toBeCloseTo(a.areas[i]!.delta, 9));
  });

  it('never recommends a smaller size as weight rises at a fixed height', () => {
    let prev = -1;
    for (let w = 50; w <= 130; w += 5) {
      const idx = cmCirc.sizes.indexOf(recommend({ ...profile, weightKg: w }, cmCirc).size);
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it('notes true to size against an identical reference and runs small against a smaller-cut chart', () => {
    expect(recommend(profile, cmCirc, { reference: cmCirc }).fitNote).toBe('true_to_size');
    const smallCut: ChartInput = {
      ...cmCirc,
      measurements: {
        chest: cmCirc.measurements.chest!.map((v) => v! - 8),
        length: cmCirc.measurements.length!.map((v) => v! - 2),
      },
    };
    expect(recommend(profile, smallCut, { reference: cmCirc }).fitNote).toBe('runs_small');
    expect(recommend(profile, cmCirc, { reference: smallCut }).fitNote).toBe('runs_large');
    expect(recommend(profile, cmCirc).fitNote).toBe('true_to_size');
  });
});
