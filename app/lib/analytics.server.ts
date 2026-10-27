import db from '../db.server';
import type { AdminClient } from './admin.server';
import { dateRange, summarize, type RangeDays, type Summary, type Totals } from './analytics';
import { listCharts } from './charts.server';
import { localDate } from './events';

export async function loadSummary(shop: string, admin: AdminClient, days: RangeDays): Promise<Summary> {
  const state = await db.shopState.findUnique({ where: { shop }, select: { timezone: true } });
  const { from, to } = dateRange(localDate(new Date(), state?.timezone), days);
  const where = { shop, date: { gte: from, lte: to } };

  const [daily, sizes, drafts] = await Promise.all([
    db.eventDaily.findMany({ where }),
    db.eventSizeDaily.findMany({ where }),
    listCharts(admin),
  ]);

  const charts = drafts.flatMap((d) => (d.handle ? [{ handle: d.handle, name: d.name, sizes: d.table.sizes }] : []));
  return summarize(daily, sizes, charts, { from, to });
}

/** Finder totals for the last `days` shop-local days, from the counters alone (no Admin API call). */
export async function loadTotals(shop: string, days: RangeDays): Promise<Totals> {
  const state = await db.shopState.findUnique({ where: { shop }, select: { timezone: true } });
  const range = dateRange(localDate(new Date(), state?.timezone), days);
  const daily = await db.eventDaily.findMany({ where: { shop, date: { gte: range.from, lte: range.to } } });
  return summarize(daily, [], [], range).totals;
}
