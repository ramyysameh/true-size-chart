import { describe, expect, it } from 'vitest';
import { dateRange, parseStoreRate, shopifyqlFor, summarize, type DailyRow, type SizeRow } from './analytics';

const range = { from: '2026-10-18', to: '2026-10-24' };
const tee = { handle: 'tee', name: 'Tee', sizes: ['S', 'M', 'L'] };

describe('dateRange', () => {
  it('returns an inclusive range of `days` dates ending today', () => {
    expect(dateRange('2026-10-24', 7)).toEqual({ from: '2026-10-18', to: '2026-10-24' });
  });
  it('crosses a month boundary', () => {
    expect(dateRange('2026-11-03', 7)).toEqual({ from: '2026-10-28', to: '2026-11-03' });
  });
  it('crosses a year boundary', () => {
    expect(dateRange('2027-01-02', 30)).toEqual({ from: '2026-12-04', to: '2027-01-02' });
  });
});

describe('summarize', () => {
  const daily: DailyRow[] = [
    { chartKey: 'tee', date: '2026-10-23', opens: 10, completions: 5, addToCarts: 2 },
    { chartKey: 'tee', date: '2026-10-24', opens: 10, completions: 5, addToCarts: 3 },
    { chartKey: 'hat', date: '2026-10-24', opens: 4, completions: 0, addToCarts: 0 },
  ];

  it('totals and rates', () => {
    const s = summarize(daily, [], [tee, { handle: 'hat', name: 'Hat', sizes: [] }], range);
    expect(s.totals).toEqual({ opens: 24, completions: 10, addToCarts: 5, completionRate: 10 / 24, cartRate: 0.5 });
    const hat = s.charts.find((c) => c.chartKey === 'hat')!;
    expect(hat.completionRate).toBe(0);
    expect(hat.cartRate).toBeNull();
    expect(s.from).toBe('2026-10-18');
    expect(s.to).toBe('2026-10-24');
  });

  it('gives null rates when there are no opens', () => {
    const s = summarize([], [], [tee], range);
    expect(s.totals).toEqual({ opens: 0, completions: 0, addToCarts: 0, completionRate: null, cartRate: null });
    expect(s.charts).toEqual([]);
  });

  it('sorts charts by opens desc, then name', () => {
    const rows: DailyRow[] = [
      { chartKey: 'b', date: '2026-10-24', opens: 3, completions: 0, addToCarts: 0 },
      { chartKey: 'a', date: '2026-10-24', opens: 3, completions: 0, addToCarts: 0 },
      { chartKey: 'c', date: '2026-10-24', opens: 9, completions: 0, addToCarts: 0 },
    ];
    const charts = [
      { handle: 'a', name: 'Zed', sizes: [] },
      { handle: 'b', name: 'Alpha', sizes: [] },
      { handle: 'c', name: 'Mid', sizes: [] },
    ];
    expect(summarize(rows, [], charts, range).charts.map((c) => c.name)).toEqual(['Mid', 'Alpha', 'Zed']);
  });

  it('orders sizes by the chart, unknown labels last alphabetically, with shares', () => {
    const sizes: SizeRow[] = [
      { chartKey: 'tee', date: '2026-10-23', size: 'L', count: 2 },
      { chartKey: 'tee', date: '2026-10-24', size: 'L', count: 1 },
      { chartKey: 'tee', date: '2026-10-24', size: 'XXXL', count: 1 },
      { chartKey: 'tee', date: '2026-10-24', size: 'M', count: 4 },
      { chartKey: 'tee', date: '2026-10-24', size: 'XXL', count: 2 },
    ];
    const s = summarize(daily, sizes, [tee], range);
    const tc = s.charts.find((c) => c.chartKey === 'tee')!;
    expect(tc.sizes.map((x) => x.size)).toEqual(['M', 'L', 'XXL', 'XXXL']);
    expect(tc.sizes.map((x) => x.count)).toEqual([4, 3, 2, 1]);
    expect(tc.sizes[0].share).toBeCloseTo(0.4);
  });

  it('marks a key with no current chart as deleted', () => {
    const s = summarize(daily, [], [tee], range);
    const hat = s.charts.find((c) => c.chartKey === 'hat')!;
    expect(hat.name).toBe('Deleted chart');
    expect(hat.deleted).toBe(true);
    expect(s.charts.find((c) => c.chartKey === 'tee')!.deleted).toBe(false);
  });

  it('zero-fills the daily series across the range', () => {
    const s = summarize(daily, [], [tee], range);
    expect(s.daily).toHaveLength(7);
    expect(s.daily[0]).toEqual({ date: '2026-10-18', opens: 0, completions: 0, addToCarts: 0 });
    expect(s.daily[5]).toEqual({ date: '2026-10-23', opens: 10, completions: 5, addToCarts: 2 });
    expect(s.daily[6]).toEqual({ date: '2026-10-24', opens: 14, completions: 5, addToCarts: 3 });
  });
});

describe('shopifyqlFor', () => {
  it.each([7, 30, 90] as const)('builds the sessions query for %i days', (d) => {
    expect(shopifyqlFor(d)).toBe(
      `FROM sessions SHOW sessions, sessions_with_cart_additions WHERE human_or_bot_session = 'human' SINCE -${d}d UNTIL today`,
    );
  });
});

describe('parseStoreRate', () => {
  const columns = [{ name: 'sessions' }, { name: 'sessions_with_cart_additions' }];

  it('reads object rows', () => {
    const t = { columns, rows: [{ sessions: 200, sessions_with_cart_additions: 30 }] };
    expect(parseStoreRate(t, [])).toEqual({ sessions: 200, withCart: 30, rate: 0.15 });
  });
  it('reads array rows in column order', () => {
    expect(parseStoreRate({ columns, rows: [[200, 30]] }, null)).toEqual({ sessions: 200, withCart: 30, rate: 0.15 });
  });
  it('reads array rows when columns are in a different order', () => {
    const t = { columns: [columns[1], columns[0]], rows: [[30, 200]] };
    expect(parseStoreRate(t, undefined)).toEqual({ sessions: 200, withCart: 30, rate: 0.15 });
  });
  it('accepts numeric strings', () => {
    const t = { columns, rows: [{ sessions: '200', sessions_with_cart_additions: '30' }] };
    expect(parseStoreRate(t, [])).toEqual({ sessions: 200, withCart: 30, rate: 0.15 });
  });
  it('accepts rows as a JSON string', () => {
    const t = { columns, rows: JSON.stringify([{ sessions: '200', sessions_with_cart_additions: '30' }]) };
    expect(parseStoreRate(t, [])).toEqual({ sessions: 200, withCart: 30, rate: 0.15 });
  });
  it('returns null for rows that are an unparseable string', () => {
    expect(parseStoreRate({ columns, rows: 'not json' }, [])).toBeNull();
  });
  it('has a null rate with zero sessions', () => {
    const t = { columns, rows: [{ sessions: 0, sessions_with_cart_additions: 0 }] };
    expect(parseStoreRate(t, [])).toEqual({ sessions: 0, withCart: 0, rate: null });
  });
  it('returns null on parse errors', () => {
    expect(parseStoreRate({ columns, rows: [[200, 30]] }, ['x'])).toBeNull();
  });
  it('returns null with no rows or no table', () => {
    expect(parseStoreRate({ columns, rows: [] }, [])).toBeNull();
    expect(parseStoreRate(null, [])).toBeNull();
  });
  it('returns null when a column is missing', () => {
    expect(parseStoreRate({ columns: [{ name: 'sessions' }], rows: [[200]] }, [])).toBeNull();
    expect(parseStoreRate({ columns, rows: [{ sessions: 200 }] }, [])).toBeNull();
  });
  it('returns null for non-numeric values', () => {
    expect(parseStoreRate({ columns, rows: [{ sessions: 'abc', sessions_with_cart_additions: 1 }] }, [])).toBeNull();
  });
});

describe('rate clamping', () => {
  it('never reports a rate above 100%', () => {
    const rows: DailyRow[] = [{ chartKey: 'tee', date: '2026-10-24', opens: 4, completions: 3, addToCarts: 5 }];
    const s = summarize(rows, [], [tee], range);
    expect(s.totals.cartRate).toBe(1);
    expect(s.totals.addToCarts).toBe(5);
    expect(s.charts.find((c) => c.chartKey === 'tee')!.cartRate).toBe(1);
  });
});
