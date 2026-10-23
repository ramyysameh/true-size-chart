import { norm, type ChartDraft } from './chart-model';
import type { ProductFacts } from './rules';

/** Comma-separated setting -> trimmed names, empty entries dropped. */
export function parseSizeOptionNames(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** The values of the first product option whose name is one of `sizeOptionNames` (case/space-insensitive). */
export function sizeOptionValues(p: ProductFacts, sizeOptionNames: string[]): string[] | null {
  const wanted = new Set(sizeOptionNames.map(norm));
  const option = p.options.find((o) => wanted.has(norm(o.name)));
  return option ? option.values : null;
}

/** Option values that are neither one of the chart sizes nor an alias key. De-duplicated, trimmed. */
export function unmatchedValues(
  values: string[],
  sizes: string[],
  aliases: Record<string, string> = {},
): string[] {
  const known = new Set(sizes.map(norm));
  const aliased = new Set(Object.keys(aliases).map(norm));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = norm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!known.has(key) && !aliased.has(key)) out.push(value.trim());
  }
  return out;
}

export interface MappingIssue {
  productId: string;
  productTitle: string;
  chartId: string;
  unmatched: string[];
  noSizeOption: boolean;
}

/** Products that have a chart but whose size option does not line up with it. */
export function mappingIssues(
  products: ProductFacts[],
  charts: Map<string, ChartDraft>,
  sizeOptionNames: string[],
): MappingIssue[] {
  const issues: MappingIssue[] = [];
  for (const p of products) {
    if (!p.chartId) continue;
    const chart = charts.get(p.chartId);
    if (!chart) continue;
    const base = { productId: p.id, productTitle: p.title, chartId: p.chartId };
    const values = sizeOptionValues(p, sizeOptionNames);
    if (values === null) {
      issues.push({ ...base, unmatched: [], noSizeOption: true });
      continue;
    }
    const unmatched = unmatchedValues(values, chart.table.sizes, chart.table.aliases);
    if (unmatched.length > 0) issues.push({ ...base, unmatched, noSizeOption: false });
  }
  return issues;
}

export interface ChartIssueGroup {
  chartId: string;
  values: { value: string; products: string[] }[];
  noSizeOption: { productId: string; productTitle: string }[];
}

/** Issues grouped by chart; one entry per distinct unmatched value (aliases are per chart). */
export function groupIssuesByChart(issues: MappingIssue[]): ChartIssueGroup[] {
  const groups = new Map<string, ChartIssueGroup>();
  for (const issue of issues) {
    let g = groups.get(issue.chartId);
    if (!g) {
      g = { chartId: issue.chartId, values: [], noSizeOption: [] };
      groups.set(issue.chartId, g);
    }
    if (issue.noSizeOption) g.noSizeOption.push({ productId: issue.productId, productTitle: issue.productTitle });
    for (const value of issue.unmatched) {
      const existing = g.values.find((v) => norm(v.value) === norm(value));
      if (existing) existing.products.push(issue.productTitle);
      else g.values.push({ value, products: [issue.productTitle] });
    }
  }
  return [...groups.values()];
}

/**
 * Existing aliases plus new ones (keys stored `norm`-ed). A new alias is kept only if its target is one of
 * `sizes` (stored with the chart's own spelling); blank keys or unknown targets are dropped.
 */
export function mergeAliases(
  sizes: string[],
  existing: Record<string, string> | undefined,
  additions: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing ?? {})) out[norm(k)] = v;
  for (const [k, target] of Object.entries(additions)) {
    const key = norm(k);
    const size = sizes.find((s) => norm(s) === norm(target));
    if (key && size !== undefined) out[key] = size;
  }
  return out;
}
