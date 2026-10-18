import { beforeEach, describe, expect, it } from 'vitest';
import type { ShopperProfile } from '@true-size-chart/engine';
import { PROFILE_KEY, clearProfile, loadProfile, saveProfile, type Units } from '../src/profile-store';

const PROFILE: ShopperProfile = {
  sex: 'male',
  heightCm: 180,
  weightKg: 80,
  shape: { chest: 0, stomach: 0, hips: 0 },
  fitPref: 'regular',
};
const UNITS: Units = { height: 'cm', weight: 'kg' };

beforeEach(() => localStorage.clear());

describe('profile store', () => {
  it('round-trips a saved profile', () => {
    saveProfile(PROFILE, UNITS, 'dev-tshirt-unisex', 'XL');
    expect(loadProfile()).toEqual({ v: 1, profile: PROFILE, units: UNITS, sizes: { 'dev-tshirt-unisex': 'XL' } });
  });

  it('drops other charts sizes when the profile changed', () => {
    saveProfile(PROFILE, UNITS, 'a', 'M');
    saveProfile({ ...PROFILE, heightCm: 170 }, UNITS, 'b', 'S');
    expect(loadProfile()?.sizes).toEqual({ b: 'S' });
  });

  it('keeps both sizes when the same profile is saved for another chart', () => {
    saveProfile(PROFILE, UNITS, 'a', 'M');
    saveProfile({ ...PROFILE }, UNITS, 'b', 'S');
    expect(loadProfile()?.sizes).toEqual({ a: 'M', b: 'S' });
  });

  it('clearProfile removes the stored value', () => {
    saveProfile(PROFILE, UNITS, 'a', 'M');
    clearProfile();
    expect(loadProfile()).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it.each([
    ['unparsable', 'not json'],
    ['wrong version', JSON.stringify({ v: 2 })],
    ['invalid profile', JSON.stringify({ v: 1, profile: { ...PROFILE, heightCm: 999 }, units: UNITS, sizes: {} })],
  ])('returns null and removes the value when it is %s', (_name, raw) => {
    localStorage.setItem(PROFILE_KEY, raw);
    expect(loadProfile()).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(loadProfile()).toBeNull();
  });

  it('never throws when storage throws', () => {
    const boom = () => {
      throw new Error('denied');
    };
    const storage = { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage;
    expect(loadProfile(storage)).toBeNull();
    expect(() => saveProfile(PROFILE, UNITS, 'a', 'M', storage)).not.toThrow();
    expect(() => clearProfile(storage)).not.toThrow();
  });

  it('never throws when storage is unavailable', () => {
    expect(loadProfile(null)).toBeNull();
    expect(() => saveProfile(PROFILE, UNITS, 'a', 'M', null)).not.toThrow();
    expect(() => clearProfile(null)).not.toThrow();
  });
});
