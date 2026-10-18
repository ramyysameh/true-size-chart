import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@true-size-chart/engine';
import { cta, resultCopy } from '../src/copy';
import { STRINGS, fmt } from '../src/strings';

function rec(over: Partial<Recommendation>): Recommendation {
  return {
    size: 'L',
    runnerUp: null,
    fitMatch: 90,
    band: 'confident',
    areas: [],
    scores: [],
    fitNote: 'true_to_size',
    outOfRange: null,
    ...over,
  };
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

describe('fmt', () => {
  it('replaces every placeholder and leaves unknown ones', () => {
    expect(fmt('{a} and {a} and {b} {c}', { a: 'x', b: 2 })).toBe('x and x and 2 {c}');
  });
});

describe('resultCopy', () => {
  it('uses largest-size copy above the chart, never between', () => {
    const c = resultCopy(rec({ band: 'between', outOfRange: 'above', size: 'XXL', runnerUp: 'XL' }), SIZES, 'regular', STRINGS);
    expect(c.confidence).toBe('XXL is our largest size, so it may fit snug.');
    expect(c.confidence).not.toContain('Between');
  });

  it('uses smallest-size copy below the chart', () => {
    const c = resultCopy(rec({ band: 'confident', outOfRange: 'below', size: 'XS' }), SIZES, 'regular', STRINGS);
    expect(c.confidence).toBe('XS is our smallest size, so it may fit roomy.');
  });

  it('names both sizes in chart order for between', () => {
    const c = resultCopy(rec({ band: 'between', size: 'L', runnerUp: 'M' }), SIZES, 'regular', STRINGS);
    expect(c.confidence).toBe("Between M and L — we'd pick L for Regular fit.");
    const up = resultCopy(rec({ band: 'between', size: 'M', runnerUp: 'L' }), SIZES, 'slim', STRINGS);
    expect(up.confidence).toBe("Between M and L — we'd pick M for Slim fit.");
  });

  it('falls back to closest without a runner-up', () => {
    const c = resultCopy(rec({ band: 'between', runnerUp: null }), SIZES, 'regular', STRINGS);
    expect(c.confidence).toBe(STRINGS.closest);
  });

  it('maps the confident and good bands', () => {
    expect(resultCopy(rec({ band: 'confident' }), SIZES, 'regular', STRINGS).confidence).toBe(STRINGS.confident);
    expect(resultCopy(rec({ band: 'good' }), SIZES, 'regular', STRINGS).confidence).toBe(STRINGS.good);
  });

  it('maps the fit note', () => {
    const note = (fitNote: Recommendation['fitNote']) =>
      resultCopy(rec({ fitNote }), SIZES, 'regular', STRINGS).fitNote;
    expect(note('runs_small')).toBe(STRINGS.runsSmall);
    expect(note('runs_large')).toBe(STRINGS.runsLarge);
    expect(note('true_to_size')).toBe(STRINGS.trueToSize);
  });

  it('honours merchant string overrides', () => {
    const s = { ...STRINGS, confident: 'Spot on.' };
    expect(resultCopy(rec({ band: 'confident' }), SIZES, 'regular', s).confidence).toBe('Spot on.');
  });
});

describe('cta', () => {
  it('names the size', () => {
    expect(cta('XL', STRINGS)).toBe('Add XL to bag');
  });
});
