import type { Prisma } from '@prisma/client';

/**
 * Per-shop cap on storefront events, shared by every serverless instance through Postgres.
 * Fixed 10-second windows of at most RATE_LIMIT events: the old in-memory 10/s with a burst of 60.
 */
export const RATE_WINDOW_MS = 10_000;
export const RATE_LIMIT = 100;
const KEEP_MS = 24 * 3_600_000;

export interface RateDb {
  eventRate: Pick<Prisma.EventRateDelegate, 'upsert' | 'deleteMany'>;
}

const windowOf = (now: Date) => Math.floor(now.getTime() / RATE_WINDOW_MS);

/** Counts this event and says whether it is within the shop's cap. One atomic upsert per event. */
export async function allowEvent(db: RateDb, shop: string, now: Date): Promise<boolean> {
  const window = windowOf(now);
  const { count } = await db.eventRate.upsert({
    where: { shop_window: { shop, window } },
    create: { shop, window, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return count <= RATE_LIMIT;
}

/** Deletes counter windows older than a day; returns how many went. Run by the daily job. */
export async function pruneEventRates(db: RateDb, now: Date): Promise<number> {
  const { count } = await db.eventRate.deleteMany({ where: { window: { lt: windowOf(new Date(now.getTime() - KEEP_MS)) } } });
  return count;
}
