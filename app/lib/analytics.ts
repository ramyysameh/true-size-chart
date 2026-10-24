// Pure helpers for the analytics dashboard: date ranges and summaries of the daily counters.

export type RangeDays = 7 | 30 | 90;

export interface DailyRow { chartKey: string; date: string; opens: number; completions: number; addToCarts: number }
export interface SizeRow { chartKey: string; date: string; size: string; count: number }
export interface Totals {
  opens: number;
  completions: number;
  addToCarts: number;
  completionRate: number | null;
  cartRate: number | null;
}
export interface ChartStats extends Totals {
  chartKey: string;
  name: string;
  deleted: boolean;
  sizes: { size: string; count: number; share: number }[];
}
export interface Summary {
  from: string;
  to: string;
  totals: Totals;
  charts: ChartStats[];
  daily: ({ date: string } & Omit<Totals, 'completionRate' | 'cartRate'>)[];
}

/** Adds `delta` days to a 'YYYY-MM-DD' date (calendar arithmetic in UTC, so no DST drift). */
function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Inclusive range of `days` dates ending on `today`. */
export function dateRange(today: string, days: RangeDays): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today };
}

const rate = (num: number, den: number) => (den === 0 ? null : num / den);

function totalsOf(opens: number, completions: number, addToCarts: number): Totals {
  return { opens, completions, addToCarts, completionRate: rate(completions, opens), cartRate: rate(addToCarts, completions) };
}

export function summarize(
  daily: DailyRow[],
  sizes: SizeRow[],
  charts: { handle: string; name: string; sizes: string[] }[],
  range: { from: string; to: string },
): Summary {
  const known = new Map(charts.map((c) => [c.handle, c]));

  const perChart = new Map<string, { opens: number; completions: number; addToCarts: number }>();
  const perDay = new Map<string, { opens: number; completions: number; addToCarts: number }>();
  for (const r of daily) {
    const c = perChart.get(r.chartKey) ?? { opens: 0, completions: 0, addToCarts: 0 };
    c.opens += r.opens;
    c.completions += r.completions;
    c.addToCarts += r.addToCarts;
    perChart.set(r.chartKey, c);
    const d = perDay.get(r.date) ?? { opens: 0, completions: 0, addToCarts: 0 };
    d.opens += r.opens;
    d.completions += r.completions;
    d.addToCarts += r.addToCarts;
    perDay.set(r.date, d);
  }

  const sizeCounts = new Map<string, Map<string, number>>();
  for (const r of sizes) {
    const m = sizeCounts.get(r.chartKey) ?? new Map<string, number>();
    m.set(r.size, (m.get(r.size) ?? 0) + r.count);
    sizeCounts.set(r.chartKey, m);
  }

  const keys = new Set([...perChart.keys(), ...sizeCounts.keys()]);
  const stats: ChartStats[] = [...keys].map((chartKey) => {
    const c = perChart.get(chartKey) ?? { opens: 0, completions: 0, addToCarts: 0 };
    const chart = known.get(chartKey);
    const counts = sizeCounts.get(chartKey) ?? new Map<string, number>();
    const order = chart?.sizes ?? [];
    const labels = [...counts.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const sum = labels.reduce((n, l) => n + (counts.get(l) ?? 0), 0);
    return {
      chartKey,
      name: chart ? chart.name : 'Deleted chart',
      deleted: !chart,
      ...totalsOf(c.opens, c.completions, c.addToCarts),
      sizes: labels.map((size) => {
        const count = counts.get(size) ?? 0;
        return { size, count, share: sum === 0 ? 0 : count / sum };
      }),
    };
  });
  stats.sort((a, b) => b.opens - a.opens || a.name.localeCompare(b.name));

  const series: Summary['daily'] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const v = perDay.get(d) ?? { opens: 0, completions: 0, addToCarts: 0 };
    series.push({ date: d, ...v });
  }

  const t = [...perChart.values()].reduce(
    (n, c) => ({ opens: n.opens + c.opens, completions: n.completions + c.completions, addToCarts: n.addToCarts + c.addToCarts }),
    { opens: 0, completions: 0, addToCarts: 0 },
  );

  return { from: range.from, to: range.to, totals: totalsOf(t.opens, t.completions, t.addToCarts), charts: stats, daily: series };
}

export interface StoreRate { sessions: number; withCart: number; rate: number | null }

/** ShopifyQL for the store's human sessions and the ones that added to cart over the last `days` days. */
export function shopifyqlFor(days: RangeDays): string {
  return `FROM sessions SHOW sessions, sessions_with_cart_additions WHERE human_or_bot_session = 'human' SINCE -${days}d UNTIL today`;
}

const toCount = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Reads the first row of a `shopifyqlQuery` result. Returns null on parse errors, a missing column,
 * no rows or non-numeric values. `rows` may be objects keyed by column name, arrays in column order,
 * or a JSON string of either.
 */
export function parseStoreRate(
  tableData: { columns: { name: string }[]; rows: unknown } | null,
  parseErrors: unknown,
): StoreRate | null {
  if (Array.isArray(parseErrors) ? parseErrors.length > 0 : parseErrors) return null;
  if (!tableData) return null;

  let rows = tableData.rows;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const names = tableData.columns.map((c) => c.name);
  const first: unknown = rows[0];
  const cell = (name: string): unknown => {
    if (Array.isArray(first)) {
      const i = names.indexOf(name);
      return i === -1 ? undefined : first[i];
    }
    if (first && typeof first === 'object') return (first as Record<string, unknown>)[name];
    return undefined;
  };

  const sessions = toCount(cell('sessions'));
  const withCart = toCount(cell('sessions_with_cart_additions'));
  if (sessions === null || withCart === null) return null;
  return { sessions, withCart, rate: sessions === 0 ? null : withCart / sessions };
}
