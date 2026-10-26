import { describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT, RATE_WINDOW_MS, allowEvent, pruneEventRates } from './rate.server';

/** In-memory EventRate table: upsert increments `count` and returns the row. */
function fakeDb() {
  const rows = new Map<string, { shop: string; window: number; count: number }>();
  const key = (shop: string, window: number) => `${shop}|${window}`;
  return {
    rows,
    eventRate: {
      upsert: vi.fn(async ({ where, create }: { where: { shop_window: { shop: string; window: number } }; create: { shop: string; window: number; count: number } }) => {
        const k = key(where.shop_window.shop, where.shop_window.window);
        const row = rows.get(k);
        const next = row ? { ...row, count: row.count + 1 } : { ...create };
        rows.set(k, next);
        return next;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { window: { lt: number } } }) => {
        let count = 0;
        for (const [k, r] of rows) if (r.window < where.window.lt) { rows.delete(k); count++; }
        return { count };
      }),
    },
  };
}

const SHOP = 's.myshopify.com';
const T = new Date('2026-10-26T12:00:05Z');

describe('allowEvent', () => {
  it('counts per shop in fixed windows and refuses past the limit', async () => {
    const db = fakeDb();
    const results: boolean[] = [];
    for (let i = 0; i < RATE_LIMIT + 1; i++) results.push(await allowEvent(db as never, SHOP, T));
    expect(results.slice(0, RATE_LIMIT).every(Boolean)).toBe(true);
    expect(results[RATE_LIMIT]).toBe(false);
  });

  it('starts a fresh count in the next window', async () => {
    const db = fakeDb();
    for (let i = 0; i < RATE_LIMIT + 1; i++) await allowEvent(db as never, SHOP, T);
    expect(await allowEvent(db as never, SHOP, new Date(T.getTime() + RATE_WINDOW_MS))).toBe(true);
  });

  it('keeps shops apart', async () => {
    const db = fakeDb();
    for (let i = 0; i < RATE_LIMIT + 1; i++) await allowEvent(db as never, SHOP, T);
    expect(await allowEvent(db as never, 'other.myshopify.com', T)).toBe(true);
  });

  it('increments in one upsert per event', async () => {
    const db = fakeDb();
    await allowEvent(db as never, SHOP, T);
    expect(db.eventRate.upsert).toHaveBeenCalledWith({
      where: { shop_window: { shop: SHOP, window: Math.floor(T.getTime() / RATE_WINDOW_MS) } },
      create: { shop: SHOP, window: Math.floor(T.getTime() / RATE_WINDOW_MS), count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  });
});

describe('pruneEventRates', () => {
  it('deletes windows older than a day and keeps recent ones', async () => {
    const db = fakeDb();
    await allowEvent(db as never, SHOP, new Date(T.getTime() - 25 * 3_600_000));
    await allowEvent(db as never, SHOP, new Date(T.getTime() - 60_000));
    expect(await pruneEventRates(db as never, T)).toBe(1);
    expect(db.rows.size).toBe(1);
  });
});
