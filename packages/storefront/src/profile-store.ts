import { validateProfile, type ShopperProfile } from '@true-size-chart/engine';

export const PROFILE_KEY = 'tsc:profile:v1';

export interface Units {
  height: 'cm' | 'ftin';
  weight: 'kg' | 'lbs';
}

export interface StoredProfile {
  v: 1;
  profile: ShopperProfile;
  units: Units;
  /** Size the shopper last got per chart key; only valid for `profile`. */
  sizes: Record<string, string>;
}

function resolve(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function discard(store: Storage): void {
  try {
    store.removeItem(PROFILE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The stored profile, or null if missing, unparsable, a different version or out of range (the bad value is removed). */
export function loadProfile(storage?: Storage | null): StoredProfile | null {
  const store = resolve(storage);
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfile> | null;
    if (!parsed || parsed.v !== 1 || !parsed.profile) throw new Error('unusable');
    validateProfile(parsed.profile);
    return {
      v: 1,
      profile: parsed.profile,
      units: parsed.units ?? { height: 'cm', weight: 'kg' },
      sizes: parsed.sizes && typeof parsed.sizes === 'object' ? parsed.sizes : {},
    };
  } catch {
    discard(store);
    return null;
  }
}

/** Cached sizes belong to one profile: a changed profile starts a fresh map, an unchanged one merges. */
export function saveProfile(
  profile: ShopperProfile,
  units: Units,
  chartKey: string,
  size: string,
  storage?: Storage | null,
): void {
  const store = resolve(storage);
  if (!store) return;
  try {
    const prev = loadProfile(store);
    const same = prev !== null && JSON.stringify(prev.profile) === JSON.stringify(profile);
    const sizes = same ? { ...prev.sizes, [chartKey]: size } : { [chartKey]: size };
    const next: StoredProfile = { v: 1, profile, units, sizes };
    store.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable or full: the finder still works, it just will not remember */
  }
}

export function clearProfile(storage?: Storage | null): void {
  const store = resolve(storage);
  if (store) discard(store);
}
