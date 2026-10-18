import { describe, expect, it } from 'vitest';
import { cmToFtIn, ftInToCm, kgToLbs, lbsToKg } from '../src/units';

describe('units', () => {
  it('converts 6 ft 1 in to 185.42 cm', () => {
    expect(ftInToCm(6, 1)).toBeCloseTo(185.42, 2);
  });

  it('round-trips 185.42 cm back to 6 ft 1 in', () => {
    expect(cmToFtIn(185.42)).toEqual({ ft: 6, inch: 1 });
  });

  it('carries 12 rounded inches into the next foot', () => {
    expect(cmToFtIn(182.8)).toEqual({ ft: 6, inch: 0 });
  });

  it('converts 200 lbs to 90.718 kg and back', () => {
    expect(lbsToKg(200)).toBeCloseTo(90.718, 3);
    expect(kgToLbs(lbsToKg(200))).toBeCloseTo(200, 9);
  });
});
