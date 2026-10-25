import db from '../db.server';
import { AdminError, gql, type AdminClient } from './admin.server';
import { dateRange, parseStoreRate, shopifyqlFor, summarize, type RangeDays, type StoreRate, type Summary } from './analytics';
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

const STORE_SESSIONS = `#graphql
  query StoreSessions($q: String!) {
    shopifyqlQuery(query: $q) { tableData { columns { name dataType } rows } parseErrors }
  }
`;

/** The store's add-to-cart rate from ShopifyQL sessions. An AdminError (e.g. no read_reports yet) gives null. */
export async function storeCartRate(admin: AdminClient, days: RangeDays): Promise<StoreRate | null> {
  try {
    const data = await gql<{
      shopifyqlQuery: { tableData: { columns: { name: string }[]; rows: unknown } | null; parseErrors: unknown } | null;
    }>(admin, STORE_SESSIONS, { q: shopifyqlFor(days) });
    const result = data.shopifyqlQuery;
    return result ? parseStoreRate(result.tableData, result.parseErrors) : null;
  } catch (e) {
    if (e instanceof AdminError) return null;
    throw e;
  }
}
