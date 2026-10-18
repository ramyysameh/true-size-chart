import type { FitPref, Recommendation } from '@true-size-chart/engine';
import { fmt, type Strings } from './strings';

export interface ResultCopy {
  confidence: string;
  fitNote: string;
}

const FIT_NOTE = {
  true_to_size: 'trueToSize',
  runs_small: 'runsSmall',
  runs_large: 'runsLarge',
} as const;

function confidence(rec: Recommendation, sizes: string[], fit: FitPref, s: Strings): string {
  // Out of range comes first: there the runner-up is only the next size down, not a real "between".
  if (rec.outOfRange === 'above') return fmt(s.largest, { size: rec.size });
  if (rec.outOfRange === 'below') return fmt(s.smallest, { size: rec.size });
  if (rec.band === 'confident') return s.confident;
  if (rec.band === 'good') return s.good;
  if (rec.runnerUp === null) return s.closest;
  const [a, b] = [rec.size, rec.runnerUp].sort((x, y) => sizes.indexOf(x) - sizes.indexOf(y));
  return fmt(s.between, { a: a!, b: b!, size: rec.size, fit: s[fit] });
}

export function resultCopy(rec: Recommendation, sizes: string[], fit: FitPref, s: Strings): ResultCopy {
  return { confidence: confidence(rec, sizes, fit, s), fitNote: s[FIT_NOTE[rec.fitNote]] };
}

export function cta(size: string, s: Strings): string {
  return fmt(s.addToBag, { size });
}
