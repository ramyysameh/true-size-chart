import type { Recommendation, SizeScore } from '@true-size-chart/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FinderConfig } from '../src/config';
import { currentVariantId, inStockPick, isOffered, variantForSize } from '../src/variants';
import { CONFIG, mountConfig } from './fixtures/config';

// Fixture ids: 1000 + colorIndex * 10 + sizeIndex; Black = 0, White = 1; sizes S, M, L, XL.
const BLACK_M = 1001;
const WHITE_M = 1011;
const WHITE_XL = 1013;
const BLACK_XL = 1003;

const at = (search: string) => ({ search }) as Location;

function addForm(id: string): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<form action="/cart/add" method="post"><input type="hidden" name="id" value="${id}"></form>`,
  );
}

beforeEach(() => mountConfig(document));

describe('currentVariantId', () => {
  it('prefers ?variant= over the product form and selectedVariantId', () => {
    addForm(String(BLACK_M));
    expect(currentVariantId(document, CONFIG, at(`?variant=${WHITE_M}`))).toBe(WHITE_M);
  });

  it('falls back to the product form input', () => {
    addForm(String(BLACK_M));
    expect(currentVariantId(document, CONFIG, at(''))).toBe(BLACK_M);
  });

  it('falls back to selectedVariantId when there is no param and no form', () => {
    expect(currentVariantId(document, CONFIG, at(''))).toBe(CONFIG.selectedVariantId);
  });

  it('ignores an unknown id in the URL', () => {
    addForm(String(BLACK_M));
    expect(currentVariantId(document, CONFIG, at('?variant=999999'))).toBe(BLACK_M);
  });

  it('ignores an unknown form id and a non-numeric param', () => {
    addForm('123');
    expect(currentVariantId(document, CONFIG, at('?variant=abc'))).toBe(CONFIG.selectedVariantId);
  });
});

describe('variantForSize', () => {
  it('matches labels after trim and case folding, keeping the current colour', () => {
    expect(variantForSize(CONFIG, 'xl ', WHITE_M)?.id).toBe(WHITE_XL);
  });

  it('returns the swapped variant even when it is unavailable', () => {
    expect(variantForSize(CONFIG, 'XL', BLACK_M)?.id).toBe(BLACK_XL);
  });

  it('is null when the current colour lacks the size, even though another colour has it', () => {
    const noWhiteXl: FinderConfig = { ...CONFIG, variants: CONFIG.variants.filter((v) => v.id !== WHITE_XL) };
    expect(variantForSize(noWhiteXl, 'XL', WHITE_M)).toBeNull();
  });

  it('falls back to any variant with the size, available first, only when the current variant is unknown', () => {
    const onlyBlackXl: FinderConfig = { ...CONFIG, variants: CONFIG.variants.filter((v) => v.id !== WHITE_XL) };
    // Black/XL is the only XL left, so it is returned even though it is unavailable.
    expect(variantForSize(onlyBlackXl, 'XL', 999)?.id).toBe(BLACK_XL);

    const mixed: FinderConfig = {
      ...CONFIG,
      variants: [
        { id: 1, available: false, options: ['Red', 'M'] },
        { id: 2, available: true, options: ['Green', 'M'] },
        { id: 3, available: true, options: ['Blue', 'S'] },
      ],
    };
    expect(variantForSize(mixed, 'M', 999)?.id).toBe(2);
    expect(variantForSize(mixed, 'M', 3)).toBeNull();
  });

  it('is null without a size option', () => {
    expect(variantForSize({ ...CONFIG, sizeOptionIndex: null }, 'M', WHITE_M)).toBeNull();
  });

  it('is null for a size no variant has', () => {
    expect(variantForSize(CONFIG, 'XXL', WHITE_M)).toBeNull();
  });
});

function rec(scores: Array<[string, number]>): Recommendation {
  const list: SizeScore[] = scores.map(([size, error]) => ({ size, error, areas: [] }));
  return {
    size: list[0]?.size ?? 'M',
    runnerUp: null,
    fitMatch: 90,
    band: 'confident',
    areas: [],
    scores: list,
    fitNote: 'true_to_size',
    outOfRange: null,
  };
}

describe('inStockPick', () => {
  const scores: Array<[string, number]> = [
    ['XL', 0.02],
    ['L', 0.05],
    ['M', 0.09],
    ['S', Infinity],
  ];

  it('returns the size itself when its variant is available', () => {
    const pick = inStockPick(rec(scores), 'L', CONFIG, WHITE_M);
    expect(pick).toMatchObject({ size: 'L', substituted: false });
    expect(pick?.variant.options).toEqual(['White', 'L']);
  });

  it('substitutes the next-best available size, in ascending error order', () => {
    const pick = inStockPick(rec(scores), 'XL', CONFIG, BLACK_M);
    expect(pick).toMatchObject({ size: 'L', substituted: true });
    expect(pick?.variant.options).toEqual(['Black', 'L']);
  });

  it('sorts by error rather than trusting the scores order', () => {
    const shuffled = rec([
      ['M', 0.09],
      ['L', 0.05],
      ['XL', 0.02],
    ]);
    expect(inStockPick(shuffled, 'XL', CONFIG, BLACK_M)?.size).toBe('L');
  });

  it('stays in the current colour when only another colour has the size in stock', () => {
    const config: FinderConfig = {
      ...CONFIG,
      variants: CONFIG.variants.filter((v) => v.id !== WHITE_XL).map((v) => (v.id === BLACK_XL ? { ...v, available: true } : v)),
    };
    const pick = inStockPick(rec(scores), 'XL', config, WHITE_M);
    expect(pick).toMatchObject({ size: 'L', substituted: true });
    expect(pick?.variant.options).toEqual(['White', 'L']);
  });

  it('is null when every size is unavailable', () => {
    const config: FinderConfig = { ...CONFIG, variants: CONFIG.variants.map((v) => ({ ...v, available: false })) };
    expect(inStockPick(rec(scores), 'XL', config, BLACK_M)).toBeNull();
  });

  it('never returns a size whose error is not finite', () => {
    // Only S is in stock, and S has an Infinity error.
    const config: FinderConfig = {
      ...CONFIG,
      variants: CONFIG.variants.map((v) => ({ ...v, available: v.options[1] === 'S' })),
    };
    expect(inStockPick(rec(scores), 'XL', config, BLACK_M)).toBeNull();
  });
});

describe('isOffered', () => {
  it('is true when any variant carries the size label, in stock or not', () => {
    expect(isOffered(CONFIG, 'xl ')).toBe(true);
    const soldOut: FinderConfig = { ...CONFIG, variants: CONFIG.variants.map((v) => ({ ...v, available: false })) };
    expect(isOffered(soldOut, 'M')).toBe(true);
  });

  it('is false for a size no variant carries, and without a size option', () => {
    expect(isOffered(CONFIG, 'XXL')).toBe(false);
    expect(isOffered({ ...CONFIG, sizeOptionIndex: null }, 'M')).toBe(false);
  });
});

describe('size aliases', () => {
  const named = (aliases?: Record<string, string>): FinderConfig => ({
    ...CONFIG,
    chart: { ...CONFIG.chart, table: { ...CONFIG.chart.table, aliases } },
    variants: [
      { id: 1, available: true, options: ['Black', 'Small'] },
      { id: 2, available: true, options: ['Black', ' Medium '] },
      { id: 3, available: true, options: ['Black', 'Large'] },
    ],
  });
  const aliases = { small: 'S', medium: 'M', large: 'L' };

  it('matches a variant option through the chart aliases', () => {
    expect(variantForSize(named(aliases), 'M', 2)?.id).toBe(2);
    expect(isOffered(named(aliases), 'L')).toBe(true);
  });

  it('matches nothing without aliases', () => {
    expect(variantForSize(named(), 'M', 1)).toBeNull();
  });

  it('an alias to a size that is not in the chart matches nothing', () => {
    expect(variantForSize(named({ small: 'XXS' }), 'S', 2)).toBeNull();
    expect(isOffered(named({ small: 'XXS' }), 'S')).toBe(false);
  });
});
