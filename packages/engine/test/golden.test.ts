import { describe, expect, it } from 'vitest';
import { recommend } from '../src/recommend';
import { TSHIRT_UNISEX } from '../src/templates/tshirt';
import type { ShopperProfile, Sex } from '../src/types';

const shopper = (sex: Sex, heightCm: number, weightKg: number): ShopperProfile => ({
  sex,
  heightCm,
  weightKg,
  shape: { chest: 0, stomach: 0, hips: 0 },
  fitPref: 'regular',
});

describe('golden: unisex T-shirt template, regular fit, average shape', () => {
  it('matches the reviewed recommendation grid', () => {
    const rows: string[] = [];
    for (const sex of ['female', 'male'] as const) {
      for (let h = 150; h <= 200; h += 10) {
        for (let w = 45; w <= 130; w += 15) {
          const r = recommend(shopper(sex, h, w), TSHIRT_UNISEX);
          rows.push(`${sex.padEnd(6)} ${h}cm ${String(w).padStart(3)}kg → ${r.size.padEnd(3)} ${r.fitMatch}% ${r.band}${r.outOfRange ? ` (${r.outOfRange})` : ''}`);
        }
      }
    }
    expect(rows).toMatchSnapshot();
  });

  it('gives the smallest sizes to a very light tall shopper', () => {
    expect(['XS', 'S']).toContain(recommend(shopper('male', 186, 40), TSHIRT_UNISEX).size);
  });

  it('flags a very heavy shopper as above the range', () => {
    const r = recommend(shopper('male', 186, 150), TSHIRT_UNISEX);
    expect(r.size).toBe('XXL');
    expect(r.outOfRange).toBe('above');
  });
});
