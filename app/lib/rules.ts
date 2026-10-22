import { CATEGORIES, type Category } from '@true-size-chart/engine';
import { norm } from './chart-model';

export type RuleType = 'product' | 'collection' | 'product_type' | 'vendor' | 'tag';

export interface Rule {
  id: string;
  chartId: string;
  type: RuleType;
  value: string;
  priority: number;
}

export interface ProductFacts {
  id: string;
  title: string;
  productType: string;
  vendor: string;
  tags: string[];
  collectionIds: string[];
  options: { name: string; values: string[] }[];
  chartId: string | null;
}

function matches(p: ProductFacts, rule: Rule): boolean {
  switch (rule.type) {
    case 'product':
      return p.id === rule.value;
    case 'collection':
      return p.collectionIds.includes(rule.value);
    case 'product_type':
      return norm(p.productType) === norm(rule.value);
    case 'vendor':
      return norm(p.vendor) === norm(rule.value);
    case 'tag': {
      const want = norm(rule.value);
      return p.tags.some((t) => norm(t) === want);
    }
    default:
      return false;
  }
}

/** Rules sorted by priority ascending; ties keep input order (Array.prototype.sort is stable). */
const byPriority = (rules: Rule[]): Rule[] => [...rules].sort((a, b) => a.priority - b.priority);

function resolveSorted(p: ProductFacts, sorted: Rule[]): string | null {
  return sorted.find((r) => matches(p, r))?.chartId ?? null;
}

/** The chart of the first matching rule (lowest priority first), or null. */
export function resolveChart(p: ProductFacts, rules: Rule[]): string | null {
  return resolveSorted(p, byPriority(rules));
}

/**
 * Metafield writes that bring products in line with the rules.
 * No rules means "assignment not set up": nothing is written or removed.
 */
export function planWrites(
  products: ProductFacts[],
  rules: Rule[],
): { set: { ownerId: string; chartId: string }[]; unset: string[] } {
  const set: { ownerId: string; chartId: string }[] = [];
  const unset: string[] = [];
  if (rules.length === 0) return { set, unset };
  const sorted = byPriority(rules);
  for (const p of products) {
    const resolved = resolveSorted(p, sorted);
    if (resolved === p.chartId) continue;
    if (resolved === null) unset.push(p.id);
    else set.push({ ownerId: p.id, chartId: resolved });
  }
  return { set, unset };
}

const KEYWORDS: Record<Category, string[]> = {
  tshirt: ['t-shirt', 'tee', 'tshirt'],
  shirt: ['shirt', 'blouse'],
  hoodie: ['hoodie', 'sweatshirt', 'sweater'],
  jacket: ['jacket', 'coat'],
  dress: ['dress'],
  pants: ['pants', 'jeans', 'trousers', 'chinos', 'leggings'],
  shorts: ['shorts'],
  skirt: ['skirt'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A keyword matches as a whole word (plural "s"/"es" allowed), so "shirt" does not match
 * inside "t-shirt" or "sweatshirt" and "tee" does not match "teen".
 */
const PATTERNS: [Category, RegExp][] = CATEGORIES.map((c) => [
  c,
  new RegExp(`(?<![a-z0-9-])(?:${KEYWORDS[c].map(escape).join('|')})(?:s|es)?(?![a-z0-9])`),
]);

/** One product_type rule per product type whose name names a category that has a chart (first chart wins). */
export function suggestRules(
  charts: { id: string; category: Category }[],
  productTypes: string[],
): { chartId: string; type: 'product_type'; value: string }[] {
  const out: { chartId: string; type: 'product_type'; value: string }[] = [];
  const seen = new Set<string>();
  for (const productType of productTypes) {
    const key = norm(productType);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    for (const [category, pattern] of PATTERNS) {
      if (!pattern.test(key)) continue;
      const chart = charts.find((c) => c.category === category);
      if (chart) {
        out.push({ chartId: chart.id, type: 'product_type', value: productType });
        break;
      }
    }
  }
  return out;
}
