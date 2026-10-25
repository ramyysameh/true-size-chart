import { describe, expect, it } from 'vitest';
import { parseChartHandles, parseStep, safeReturnTo, setupChecklist, templatesToCreate } from './onboarding';

describe('parseStep', () => {
  it('defaults to 1 and clamps to 1-4', () => {
    expect(parseStep(null)).toBe(1);
    expect(parseStep('abc')).toBe(1);
    expect(parseStep('0')).toBe(1);
    expect(parseStep('3')).toBe(3);
    expect(parseStep('9')).toBe(4);
  });
});

describe('parseChartHandles', () => {
  it('splits, trims, drops junk and duplicates', () => {
    expect(parseChartHandles('a-1, b_2,,a-1,bad handle,x/y')).toEqual(['a-1', 'b_2']);
    expect(parseChartHandles(null)).toEqual([]);
  });
});

describe('templatesToCreate', () => {
  const templates = [
    { key: 't1', name: 'Tee' },
    { key: 't2', name: 'Hoodie' },
  ];
  it('skips templates already created in this flow and unknown keys', () => {
    expect(templatesToCreate(['t1', 't2', 'nope'], templates, ['Tee'])).toEqual([{ key: 't2', name: 'Hoodie' }]);
  });
});

describe('setupChecklist', () => {
  it('marks each step and links to its fix', () => {
    const items = setupChecklist({ embed: 'active', block: 'available', charts: 1, rules: 0 });
    expect(items.map((i) => [i.key, i.done])).toEqual([
      ['embed', true],
      ['block', false],
      ['charts', true],
      ['rules', false],
      ['mapping', false],
    ]);
    expect(items.find((i) => i.key === 'rules')?.href).toBe('/app/rules');
  });
});

describe('setupChecklist labels', () => {
  it('names the live theme, because the status comes from the published theme only', () => {
    const items = setupChecklist({ embed: 'available', block: 'available', charts: 0, rules: 0 });
    expect(items.find((i) => i.key === 'embed')?.label).toBe('Turn on the app embed in your live theme');
    expect(items.find((i) => i.key === 'block')?.label).toBe('Place the size finder button in your live theme');
  });
});

describe('safeReturnTo', () => {
  it('accepts onboarding paths only', () => {
    expect(safeReturnTo('/app/onboarding?step=2&charts=a,b')).toBe('/app/onboarding?step=2&charts=a,b');
    expect(safeReturnTo('/app/onboarding')).toBe('/app/onboarding');
    expect(safeReturnTo('/app/onboardingx')).toBeNull();
    expect(safeReturnTo('//evil.com')).toBeNull();
    expect(safeReturnTo('https://evil.com/app/onboarding')).toBeNull();
    expect(safeReturnTo('/app/onboarding?x=\\evil')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });
});
