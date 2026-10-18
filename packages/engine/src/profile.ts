import { ProfileError, type ShopperProfile } from './types';

export const HEIGHT_RANGE_CM = [120, 230] as const;
export const WEIGHT_RANGE_KG = [30, 250] as const;

function inRange(field: string, value: unknown, [min, max]: readonly [number, number]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ProfileError(`${field} must be between ${min} and ${max} (got ${JSON.stringify(value)})`);
  }
}

/** Rejects shopper answers the body model was never fitted for. */
export function validateProfile(p: ShopperProfile): void {
  if (p.sex !== 'female' && p.sex !== 'male') throw new ProfileError(`sex must be female or male (got ${JSON.stringify(p.sex)})`);
  inRange('heightCm', p.heightCm, HEIGHT_RANGE_CM);
  inRange('weightKg', p.weightKg, WEIGHT_RANGE_KG);
  if (!['slim', 'regular', 'relaxed'].includes(p.fitPref)) {
    throw new ProfileError(`fitPref must be slim, regular or relaxed (got ${JSON.stringify(p.fitPref)})`);
  }
  for (const key of ['chest', 'stomach', 'hips'] as const) {
    const step: unknown = p.shape?.[key];
    if (step !== -1 && step !== 0 && step !== 1) throw new ProfileError(`shape.${key} must be -1, 0 or 1 (got ${JSON.stringify(step)})`);
  }
}
