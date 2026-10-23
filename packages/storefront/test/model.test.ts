import { describe, expect, it } from 'vitest';
import { TEMPLATE_CHARTS, TSHIRT_UNISEX, recommend, type ChartInput, type ShopperProfile } from '@true-size-chart/engine';
import { defaultDraft, finalRecommendation, liveEstimate, toProfile, type Draft } from '../src/model';
import type { StoredProfile } from '../src/profile-store';
import { CONFIG } from './fixtures/config';

const MEN = { ...CONFIG, chart: { ...CONFIG.chart, audience: 'men' as const } };
const MALE_180: Draft = {
  sex: 'male',
  heightCm: 180,
  weightKg: 89,
  shape: { chest: 0, stomach: 0, hips: 0 },
  fitPref: 'regular',
  units: { height: 'cm', weight: 'kg' },
};

function scaled(chart: ChartInput, factor: number): ChartInput {
  const measurements: ChartInput['measurements'] = {};
  for (const [dim, values] of Object.entries(chart.measurements)) {
    measurements[dim as keyof ChartInput['measurements']] = values.map((v) => (v === null ? null : v * factor));
  }
  return { ...chart, measurements };
}

describe('defaultDraft', () => {
  it('uses male 178/80 for a men chart, regular fit and a flat shape', () => {
    const d = defaultDraft(MEN, null, 'de-DE');
    expect(d).toMatchObject({ sex: 'male', heightCm: 178, weightKg: 80, fitPref: 'regular' });
    expect(d.shape).toEqual({ chest: 0, stomach: 0, hips: 0 });
  });

  it('uses female 165/65 for any other audience', () => {
    for (const audience of ['women', 'unisex', null] as const) {
      const d = defaultDraft({ ...CONFIG, chart: { ...CONFIG.chart, audience } }, null, 'de-DE');
      expect(d).toMatchObject({ sex: 'female', heightCm: 165, weightKg: 65 });
    }
  });

  it('picks ft/in and lbs for en-US, cm and kg elsewhere', () => {
    expect(defaultDraft(MEN, null, 'en-US').units).toEqual({ height: 'ftin', weight: 'lbs' });
    expect(defaultDraft(MEN, null, 'en-GB').units).toEqual({ height: 'cm', weight: 'kg' });
  });

  it('returns the stored profile and its units', () => {
    const profile: ShopperProfile = {
      sex: 'female',
      heightCm: 170,
      weightKg: 60,
      shape: { chest: 1, stomach: -1, hips: 0 },
      fitPref: 'slim',
    };
    const stored: StoredProfile = { v: 1, profile, units: { height: 'ftin', weight: 'kg' }, sizes: {} };
    const d = defaultDraft(MEN, stored, 'en-US');
    expect(toProfile(d)).toEqual(profile);
    expect(d.units).toEqual({ height: 'ftin', weight: 'kg' });
  });
});

describe('toProfile', () => {
  it('drops the units', () => {
    expect(Object.keys(toProfile(MALE_180)).sort()).toEqual(['fitPref', 'heightCm', 'sex', 'shape', 'weightKg']);
  });
});

describe('liveEstimate', () => {
  it('matches the engine for a flat regular shape', () => {
    const expected = recommend(
      { sex: 'male', heightCm: 180, weightKg: 89, shape: { chest: 0, stomach: 0, hips: 0 }, fitPref: 'regular' },
      TSHIRT_UNISEX,
    ).size;
    expect(liveEstimate(MALE_180, TSHIRT_UNISEX)).toBe(expected);
  });

  it('ignores the shopper shape and fit preference', () => {
    const odd: Draft = { ...MALE_180, shape: { chest: 1, stomach: 1, hips: 1 }, fitPref: 'relaxed' };
    expect(liveEstimate(odd, TSHIRT_UNISEX)).toBe(liveEstimate(MALE_180, TSHIRT_UNISEX));
  });

  it('is null instead of throwing for an unusable chart', () => {
    expect(liveEstimate(MALE_180, { ...TSHIRT_UNISEX, sizes: [], measurements: {} })).toBeNull();
  });

  it('is null for an out-of-range shopper', () => {
    expect(liveEstimate({ ...MALE_180, heightCm: 20 }, TSHIRT_UNISEX)).toBeNull();
  });
});

describe('finalRecommendation', () => {
  const SMALL_RUNNING: ChartInput = scaled(TSHIRT_UNISEX, 0.94);

  it('compares a tshirt against the reference chart', () => {
    expect(finalRecommendation(MALE_180, SMALL_RUNNING).fitNote).toBe('runs_small');
  });

  it('compares against the template for the config audience', () => {
    const women = TEMPLATE_CHARTS['tshirt-women']!;
    expect(finalRecommendation(MALE_180, women, 'women').fitNote).toBe('true_to_size');
    expect(finalRecommendation(MALE_180, women, 'unisex').fitNote).not.toBe('true_to_size');
  });

  it('throws on an unusable chart', () => {
    expect(() => finalRecommendation(MALE_180, { ...TSHIRT_UNISEX, sizes: [], measurements: {} })).toThrow();
  });
});
