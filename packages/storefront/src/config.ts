import type { Category, ChartInput, ChartTable } from '@true-size-chart/engine';

export interface VariantInfo {
  id: number;
  available: boolean;
  options: string[];
}

export interface FinderConfig {
  chart: {
    key: string;
    name: string;
    category: Category;
    unit: 'cm' | 'in';
    basis: ChartInput['basis'];
    intendedFit: ChartInput['intendedFit'];
    audience: 'women' | 'men' | 'unisex' | null;
    table: ChartTable;
    howToMeasure: string | null;
  };
  product: { title: string; image: string | null; price: string };
  variants: VariantInfo[];
  /** Index into VariantInfo.options; null = no size option matched. */
  sizeOptionIndex: number | null;
  selectedVariantId: number;
  /** Liquid routes.cart_add_url / routes.cart_url. */
  routes: { cartAdd: string; cart: string };
  assets: { js: string; css: string };
  settings: { font: 'theme' | 'editorial'; accent: string; radius: number };
  /** Merchant overrides, merged over the built-in strings. */
  strings: Record<string, string>;
  /** Admin preview: the add button never touches a cart. */
  preview?: boolean;
  /** App proxy URL for anonymous finder events; absent = no events (the admin preview never sets it). */
  events?: string;
}

/** Reads the block's inline config; null when it is absent or not JSON. */
export function readConfig(doc: Document): FinderConfig | null {
  const el = doc.getElementById('tsc-config');
  if (!el) return null;
  try {
    const parsed: unknown = JSON.parse(el.textContent ?? '');
    return parsed && typeof parsed === 'object' ? (parsed as FinderConfig) : null;
  } catch {
    return null;
  }
}

export function toChartInput(chart: FinderConfig['chart']): ChartInput {
  return {
    sizes: chart.table.sizes,
    measurements: chart.table.measurements,
    unit: chart.unit,
    basis: chart.basis,
    category: chart.category,
    intendedFit: chart.intendedFit,
  };
}
