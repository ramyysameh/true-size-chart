import type { PrismaClient } from '@prisma/client';
import type { ParsedEvent } from './events';

export type EventDb = Pick<PrismaClient, 'eventDaily' | 'eventSizeDaily'>;

/** Distinct size rows kept per chart and day; later new sizes are dropped (flood guard). */
export const MAX_SIZES_PER_DAY = 30;

type Counter = 'opens' | 'completions' | 'addToCarts';
const COUNTER: Record<ParsedEvent['e'], Counter> = { open: 'opens', complete: 'completions', atc: 'addToCarts' };

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

/**
 * Runs an increment upsert. Two first events of a new day can both take the create path;
 * the loser gets P2002 and retries once as a plain update, so no increment is lost.
 */
async function withCreateRace(upsert: () => Promise<unknown>, update: () => Promise<unknown>) {
  try {
    await upsert();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await update();
  }
}

export async function recordEvent(db: EventDb, shop: string, ev: ParsedEvent, date: string): Promise<void> {
  const day = { shop, chartKey: ev.c, date };
  const field = COUNTER[ev.e];
  const inc = { [field]: { increment: 1 } };

  await withCreateRace(
    () =>
      db.eventDaily.upsert({
        where: { shop_chartKey_date: day },
        create: { ...day, [field]: 1 },
        update: inc,
      }),
    () => db.eventDaily.update({ where: { shop_chartKey_date: day }, data: inc }),
  );

  // Only completions carry a recommended size worth counting; atc sizes go nowhere.
  if (ev.e !== 'complete') return;
  const row = { ...day, size: ev.s };
  const existing = await db.eventSizeDaily.findUnique({ where: { shop_chartKey_date_size: row }, select: { size: true } });
  if (!existing && (await db.eventSizeDaily.count({ where: day })) >= MAX_SIZES_PER_DAY) return;

  await withCreateRace(
    () =>
      db.eventSizeDaily.upsert({
        where: { shop_chartKey_date_size: row },
        create: { ...row, count: 1 },
        update: { count: { increment: 1 } },
      }),
    () => db.eventSizeDaily.update({ where: { shop_chartKey_date_size: row }, data: { count: { increment: 1 } } }),
  );
}
