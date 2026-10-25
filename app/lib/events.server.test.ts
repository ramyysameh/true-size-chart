import { describe, expect, it } from 'vitest';
import { MAX_SIZES_PER_DAY, recordEvent, type EventDb } from './events.server';

type Day = { shop: string; chartKey: string; date: string; opens: number; completions: number; addToCarts: number };
type SizeRow = { shop: string; chartKey: string; date: string; size: string; count: number };
type Inc = Record<string, { increment: number } | undefined>;

const dayKey = (w: { shop: string; chartKey: string; date: string }) => `${w.shop}|${w.chartKey}|${w.date}`;
const sizeKey = (w: { shop: string; chartKey: string; date: string; size: string }) => `${dayKey(w)}|${w.size}`;
const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

/** In-memory stand-in for the two Prisma delegates, covering only the calls recordEvent makes. */
function fakeDb(opts: { failDayUpsertOnce?: boolean; failSizeUpsertOnce?: boolean } = {}) {
  const days = new Map<string, Day>();
  const sizes = new Map<string, SizeRow>();
  let failDay = !!opts.failDayUpsertOnce;
  let failSize = !!opts.failSizeUpsertOnce;
  const apply = (row: Record<string, unknown>, data: Inc) => {
    for (const [k, v] of Object.entries(data)) if (v) row[k] = (row[k] as number) + v.increment;
  };

  const db = {
    eventDaily: {
      async upsert(args: { where: { shop_chartKey_date: Day }; create: Partial<Day>; update: Inc }) {
        const k = dayKey(args.where.shop_chartKey_date);
        if (failDay) {
          // Simulates the race: a concurrent request created the row between the lookup and the insert.
          failDay = false;
          days.set(k, { ...(args.create as Day), opens: 0, completions: 0, addToCarts: 0 });
          throw p2002();
        }
        const row = days.get(k);
        if (row) apply(row, args.update);
        else days.set(k, { opens: 0, completions: 0, addToCarts: 0, ...args.create } as Day);
      },
      async update(args: { where: { shop_chartKey_date: Day }; data: Inc }) {
        const row = days.get(dayKey(args.where.shop_chartKey_date));
        if (!row) throw new Error('not found');
        apply(row, args.data);
      },
    },
    eventSizeDaily: {
      async findUnique(args: { where: { shop_chartKey_date_size: SizeRow } }) {
        return sizes.get(sizeKey(args.where.shop_chartKey_date_size)) ?? null;
      },
      async count(args: { where: { shop: string; chartKey: string; date: string } }) {
        const prefix = `${dayKey(args.where)}|`;
        return [...sizes.keys()].filter((k) => k.startsWith(prefix)).length;
      },
      async upsert(args: { where: { shop_chartKey_date_size: SizeRow }; create: Partial<SizeRow>; update: Inc }) {
        const k = sizeKey(args.where.shop_chartKey_date_size);
        if (failSize) {
          failSize = false;
          sizes.set(k, { ...(args.create as SizeRow), count: 0 });
          throw p2002();
        }
        const row = sizes.get(k);
        if (row) apply(row, args.update);
        else sizes.set(k, { count: 0, ...args.create } as SizeRow);
      },
      async update(args: { where: { shop_chartKey_date_size: SizeRow }; data: Inc }) {
        const row = sizes.get(sizeKey(args.where.shop_chartKey_date_size));
        if (!row) throw new Error('not found');
        apply(row, args.data);
      },
    },
  };
  return { db: db as unknown as EventDb, days, sizes };
}

const SHOP = 's.myshopify.com';
const DATE = '2026-10-24';

describe('recordEvent', () => {
  it('increments the right counter for each event', async () => {
    const { db, days, sizes } = fakeDb();
    await recordEvent(db, SHOP, { e: 'open', c: 'tee' }, DATE);
    await recordEvent(db, SHOP, { e: 'open', c: 'tee' }, DATE);
    await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: 'M' }, DATE);
    await recordEvent(db, SHOP, { e: 'atc', c: 'tee', s: 'L' }, DATE);
    expect(days.get(`${SHOP}|tee|${DATE}`)).toEqual({
      shop: SHOP,
      chartKey: 'tee',
      date: DATE,
      opens: 2,
      completions: 1,
      addToCarts: 1,
    });
    // Only the completion's size is counted; atc sizes go nowhere.
    expect([...sizes.values()]).toEqual([{ shop: SHOP, chartKey: 'tee', date: DATE, size: 'M', count: 1 }]);
  });

  it('creates a new day row with 1 on the first event', async () => {
    const { db, days } = fakeDb();
    await recordEvent(db, SHOP, { e: 'atc', c: 'tee', s: 'M' }, DATE);
    expect(days.get(`${SHOP}|tee|${DATE}`)).toMatchObject({ opens: 0, completions: 0, addToCarts: 1 });
  });

  it('retries a P2002 on the day row as an update so the increment lands', async () => {
    const { db, days } = fakeDb({ failDayUpsertOnce: true });
    await recordEvent(db, SHOP, { e: 'open', c: 'tee' }, DATE);
    expect(days.get(`${SHOP}|tee|${DATE}`)?.opens).toBe(1);
  });

  it('retries a P2002 on the size row as an update', async () => {
    const { db, sizes } = fakeDb({ failSizeUpsertOnce: true });
    await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: 'M' }, DATE);
    expect(sizes.get(`${SHOP}|tee|${DATE}|M`)?.count).toBe(1);
  });

  it('rethrows errors that are not P2002', async () => {
    const { db } = fakeDb();
    (db.eventDaily as unknown as { upsert: () => Promise<never> }).upsert = async () => {
      throw new Error('disk full');
    };
    await expect(recordEvent(db, SHOP, { e: 'open', c: 'tee' }, DATE)).rejects.toThrow('disk full');
  });

  it(`skips a new size once the chart-day has ${MAX_SIZES_PER_DAY}, but still bumps existing ones`, async () => {
    const { db, days, sizes } = fakeDb();
    for (let i = 0; i < MAX_SIZES_PER_DAY; i++) {
      await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: `S${i}` }, DATE);
    }
    expect(sizes.size).toBe(MAX_SIZES_PER_DAY);
    await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: 'NEW' }, DATE);
    expect(sizes.size).toBe(MAX_SIZES_PER_DAY);
    expect(sizes.has(`${SHOP}|tee|${DATE}|NEW`)).toBe(false);
    await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: 'S0' }, DATE);
    expect(sizes.get(`${SHOP}|tee|${DATE}|S0`)?.count).toBe(2);
    // The completion itself still counts when its size is dropped.
    expect(days.get(`${SHOP}|tee|${DATE}`)?.completions).toBe(MAX_SIZES_PER_DAY + 2);
  });

  it('caps sizes per chart and day, not per shop', async () => {
    const { db, sizes } = fakeDb();
    for (let i = 0; i < MAX_SIZES_PER_DAY; i++) {
      await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: `S${i}` }, DATE);
    }
    await recordEvent(db, SHOP, { e: 'complete', c: 'pants', s: 'S0' }, DATE);
    await recordEvent(db, SHOP, { e: 'complete', c: 'tee', s: 'S0' }, '2026-10-25');
    expect(sizes.has(`${SHOP}|pants|${DATE}|S0`)).toBe(true);
    expect(sizes.has(`${SHOP}|tee|2026-10-25|S0`)).toBe(true);
  });
});
