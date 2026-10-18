import { describe, expect, it } from 'vitest';
import { scoreSizes, selectSize } from '../src/score';
import type { NormalizedChart } from '../src/types';

const tops: NormalizedChart = {
  sizes: ['S', 'M', 'L', 'XL'],
  measurements: { chest: [96, 104, 112, 120], waist: [90, 98, 106, 114], length: [70, 72, 74, 76] },
  basis: 'garment',
  category: 'tshirt',
  intendedFit: 'regular',
};

const noNaN = (value: unknown) => expect(JSON.stringify(value)).not.toMatch(/NaN|null/);

describe('scoreSizes + selectSize', () => {
  it('picks M with 98% and every area ideal when the target equals M', () => {
    const scores = scoreSizes(tops, { chest: 104, waist: 98, length: 72 });
    const r = selectSize(tops, scores, 'regular');
    expect(r.size).toBe('M');
    expect(r.fitMatch).toBe(98);
    expect(r.band).toBe('confident');
    expect(r.outOfRange).toBeNull();
    for (const a of r.areas) {
      expect(a.label).toBe('ideal');
      expect(a.position).toBe(0);
    }
  });

  it('flags a shopper above the largest size instead of a confident match', () => {
    const scores = scoreSizes(tops, { chest: 120 * 1.05, waist: 114 * 1.05, length: 76 * 1.05 });
    const r = selectSize(tops, scores, 'regular');
    expect(r.size).toBe('XL');
    expect(r.outOfRange).toBe('above');
    expect(r.band).toBe('between');
    expect(r.areas.every((a) => a.label === 'snug')).toBe(true);
  });

  it('flags a shopper below the smallest size', () => {
    const scores = scoreSizes(tops, { chest: 96 / 1.15, waist: 90 / 1.15, length: 70 / 1.15 });
    const r = selectSize(tops, scores, 'regular');
    expect(r.size).toBe('S');
    expect(r.outOfRange).toBe('below');
    expect(r.band).toBe('between');
  });

  it('scores a chest-only chart with a missing size without NaN and never picks the missing size', () => {
    const gappy: NormalizedChart = { ...tops, measurements: { chest: [null, 104, 112, 120] } };
    const scores = scoreSizes(gappy, { chest: 97, waist: 90, length: 70 });
    for (const s of scores.filter((x) => x.size !== 'S')) noNaN(s);
    const r = selectSize(gappy, scores, 'regular');
    expect(r.size).not.toBe('S');
    expect(r.areas.map((a) => a.dim)).toEqual(['chest']);
    expect(Number.isNaN(r.fitMatch)).toBe(false);
  });

  it('handles a one-size chart', () => {
    const one: NormalizedChart = { ...tops, sizes: ['OS'], measurements: { chest: [110] } };
    const r = selectSize(one, scoreSizes(one, { chest: 104 }), 'regular');
    expect(r.size).toBe('OS');
    expect(r.runnerUp).toBeNull();
  });

  it('breaks an exact tie toward the larger size for relaxed and the smaller otherwise', () => {
    const tie: NormalizedChart = { ...tops, sizes: ['L', 'XL'], measurements: { chest: [100, 104] } };
    const scores = scoreSizes(tie, { chest: 102 });
    expect(scores[0]!.error).toBe(scores[1]!.error);
    expect(selectSize(tie, scores, 'relaxed').size).toBe('XL');
    expect(selectSize(tie, scores, 'slim').size).toBe('L');
    expect(selectSize(tie, scores, 'regular').size).toBe('L');
  });

  it('penalises tight sizes 1.5x beyond -4%', () => {
    const two: NormalizedChart = { ...tops, sizes: ['M', 'L'], measurements: { chest: [95, 105] } };
    const [m, l] = scoreSizes(two, { chest: 100 });
    expect(m!.error).toBeCloseTo(0.05 * 1.5, 9);
    expect(l!.error).toBeCloseTo(0.05, 9);
  });

  it('labels areas snug / ideal / roomy and clamps position to ±1', () => {
    const [s] = scoreSizes({ ...tops, sizes: ['X'], measurements: { chest: [80], waist: [101], length: [90] } }, {
      chest: 100,
      waist: 100,
      length: 72,
    });
    const byDim = Object.fromEntries(s!.areas.map((a) => [a.dim, a]));
    expect(byDim.chest!.label).toBe('snug');
    expect(byDim.chest!.position).toBe(-1);
    expect(byDim.waist!.label).toBe('ideal');
    expect(byDim.length!.label).toBe('roomy');
    expect(byDim.length!.position).toBe(1);
  });
});
