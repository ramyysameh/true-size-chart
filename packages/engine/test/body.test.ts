import { describe, expect, it } from 'vitest';
import { estimateBody } from '../src/body';
import type { ShopperProfile } from '../src/types';

const avg = { chest: 0, stomach: 0, hips: 0 } as const;
const male: ShopperProfile = { sex: 'male', heightCm: 180, weightKg: 89, shape: avg, fitPref: 'regular' };
const female: ShopperProfile = { sex: 'female', heightCm: 165, weightKg: 60, shape: avg, fitPref: 'regular' };

describe('estimateBody', () => {
  it('gives a plausible chest and waist for a 180 cm / 89 kg man', () => {
    const b = estimateBody(male);
    expect(b.chest).toBeGreaterThanOrEqual(100);
    expect(b.chest).toBeLessThanOrEqual(115);
    expect(b.waist).toBeGreaterThanOrEqual(88);
    expect(b.waist).toBeLessThanOrEqual(105);
    expect(b.heightCm).toBe(180);
  });

  it('gives a plausible hip for a 165 cm / 60 kg woman', () => {
    const b = estimateBody(female);
    expect(b.hip).toBeGreaterThanOrEqual(92);
    expect(b.hip).toBeLessThanOrEqual(104);
  });

  it('increases chest strictly with weight at a fixed height', () => {
    let prev = -Infinity;
    for (let w = 60; w <= 100; w += 5) {
      const chest = estimateBody({ ...male, weightKg: w }).chest;
      expect(chest).toBeGreaterThan(prev);
      prev = chest;
    }
  });

  it('applies shape steps as ±5% to chest, waist (stomach) and hip', () => {
    const b = estimateBody(male);
    const broad = estimateBody({ ...male, shape: { chest: 1, stomach: -1, hips: 1 } });
    expect(broad.chest).toBeCloseTo(b.chest * 1.05, 9);
    expect(broad.waist).toBeCloseTo(b.waist * 0.95, 9);
    expect(broad.hip).toBeCloseTo(b.hip * 1.05, 9);
    expect(broad.inseam).toBe(b.inseam);
  });
});
