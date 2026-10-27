import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findState: vi.fn(), findDaily: vi.fn() }));

vi.mock('../db.server', () => ({
  default: {
    shopState: { findUnique: mocks.findState },
    eventDaily: { findMany: mocks.findDaily },
  },
}));
vi.mock('./charts.server', () => ({ listCharts: vi.fn() }));

const { loadTotals } = await import('./analytics.server');

const SHOP = 's.myshopify.com';

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe('loadTotals', () => {
  it('sums the last 7 shop-local days and computes the rates', async () => {
    // 06:30 UTC on 2026-10-25 is still 2026-10-24 in Los Angeles.
    vi.useFakeTimers({ now: new Date('2026-10-25T06:30:00Z'), toFake: ['Date'] });
    mocks.findState.mockResolvedValue({ timezone: 'America/Los_Angeles' });
    mocks.findDaily.mockResolvedValue([
      { chartKey: 'tee', date: '2026-10-20', opens: 10, completions: 5, addToCarts: 1 },
      { chartKey: 'hoodie', date: '2026-10-24', opens: 10, completions: 3, addToCarts: 3 },
    ]);

    const totals = await loadTotals(SHOP, 7);

    expect(mocks.findDaily).toHaveBeenCalledWith({
      where: { shop: SHOP, date: { gte: '2026-10-18', lte: '2026-10-24' } },
    });
    expect(totals).toEqual({ opens: 20, completions: 8, addToCarts: 4, completionRate: 0.4, cartRate: 0.5 });
  });

  it('gives null rates when nothing happened', async () => {
    mocks.findState.mockResolvedValue(null);
    mocks.findDaily.mockResolvedValue([]);

    expect(await loadTotals(SHOP, 7)).toEqual({
      opens: 0,
      completions: 0,
      addToCarts: 0,
      completionRate: null,
      cartRate: null,
    });
  });
});
