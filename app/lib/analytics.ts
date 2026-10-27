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

const rate = (num: number, den: number) => (den === 0 ? null : Math.min(1, num / den));

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
