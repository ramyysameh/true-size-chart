import {
  recommend,
  referenceFor,
  type ChartInput,
  type FitPref,
  type Recommendation,
  type Sex,
  type ShopperProfile,
} from '@true-size-chart/engine';
import type { FinderConfig } from './config';
import type { StoredProfile, Units } from './profile-store';

/** What the shopper has entered so far: the engine's profile plus the display units. */
export interface Draft {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  shape: ShopperProfile['shape'];
  fitPref: FitPref;
  units: Units;
}

export function defaultDraft(
  config: FinderConfig,
  stored: StoredProfile | null,
  lang: string = navigator.language,
): Draft {
  if (stored) return { ...stored.profile, shape: { ...stored.profile.shape }, units: { ...stored.units } };
  const male = config.chart.audience === 'men';
  const imperial = lang === 'en-US';
  return {
    sex: male ? 'male' : 'female',
    heightCm: male ? 178 : 165,
    weightKg: male ? 80 : 65,
    shape: { chest: 0, stomach: 0, hips: 0 },
    fitPref: 'regular',
    units: imperial ? { height: 'ftin', weight: 'lbs' } : { height: 'cm', weight: 'kg' },
  };
}

export function toProfile(d: Draft): ShopperProfile {
  return { sex: d.sex, heightCm: d.heightCm, weightKg: d.weightKg, shape: { ...d.shape }, fitPref: d.fitPref };
}

/** Step 1's quick answer: height and weight only, an average shape and regular fit. Null when it cannot be computed. */
export function liveEstimate(d: Draft, chart: ChartInput): string | null {
  try {
    const profile: ShopperProfile = {
      ...toProfile(d),
      shape: { chest: 0, stomach: 0, hips: 0 },
      fitPref: 'regular',
    };
    return recommend(profile, chart).size;
  } catch {
    return null;
  }
}

/** Throws ChartError (hide the finder) or ProfileError (re-ask). */
export function finalRecommendation(
  d: Draft,
  chart: ChartInput,
  audience: FinderConfig['chart']['audience'] = null,
): Recommendation {
  return recommend(toProfile(d), chart, { reference: referenceFor(chart.category, audience) });
}
