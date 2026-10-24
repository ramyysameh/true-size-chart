import {
  CATEGORIES,
  ChartError,
  DIMS,
  normalizeChart,
  recommend,
  type Category,
  type ChartInput,
  type ChartTable,
  type Dim,
  type Template,
} from '@true-size-chart/engine';

export type Audience = 'women' | 'men' | 'unisex';

export interface ChartDraft {
  id: string | null;
  handle: string | null;
  name: string;
  category: Category;
  audience: Audience;
  unit: 'cm' | 'in';
  basis: ChartInput['basis'];
  intendedFit: ChartInput['intendedFit'];
  table: ChartTable;
  howToMeasure: string;
}

const AUDIENCES: readonly Audience[] = ['women', 'men', 'unisex'];
const UNITS: readonly ChartDraft['unit'][] = ['cm', 'in'];
const BASES: readonly ChartDraft['basis'][] = ['garment_flat', 'garment_circ', 'body'];
const FITS: readonly ChartDraft['intendedFit'][] = ['slim', 'regular', 'oversized'];

const CANT_SCORE =
  "The finder can't score this chart, so shoppers will only see the size chart. Add a chest column (tops/dresses) or a waist column (bottoms).";

export const norm = (label: string): string => label.trim().toLowerCase();

function copyTable(t: ChartTable): ChartTable {
  const measurements: ChartTable['measurements'] = {};
  for (const dim of DIMS) {
    const col = t.measurements[dim];
    if (col) measurements[dim] = [...col];
  }
  const out: ChartTable = { sizes: [...t.sizes], measurements };
  if (t.aliases) out.aliases = { ...t.aliases };
  return out;
}

export function draftFromTemplate(t: Template): ChartDraft {
  return {
    id: null,
    handle: null,
    name: t.name,
    category: t.category,
    audience: t.audience,
    unit: t.chart.unit,
    basis: t.chart.basis,
    intendedFit: t.chart.intendedFit,
    table: copyTable(t.chart),
    howToMeasure: t.howToMeasure,
  };
}

export function blankDraft(): ChartDraft {
  return {
    id: null,
    handle: null,
    name: '',
    category: 'tshirt',
    audience: 'unisex',
    unit: 'cm',
    basis: 'garment_flat',
    intendedFit: 'regular',
    table: {
      sizes: ['S', 'M', 'L', 'XL'],
      measurements: {
        chest: [null, null, null, null],
        length: [null, null, null, null],
      },
    },
    howToMeasure: '',
  };
}

/** Normalizes alias keys and drops aliases whose target size no longer exists. */
export function pruneAliases(table: ChartTable): ChartTable {
  const out = copyTable(table);
  delete out.aliases;
  if (!table.aliases) return out;
  const aliases: Record<string, string> = {};
  for (const [key, target] of Object.entries(table.aliases)) {
    const nk = norm(key);
    const size = table.sizes.find((s) => norm(s) === norm(target));
    if (nk && size !== undefined) aliases[nk] = size;
  }
  if (Object.keys(aliases).length > 0) out.aliases = aliases;
  return out;
}

export function toFields(d: ChartDraft): { key: string; value: string }[] {
  return [
    { key: 'name', value: d.name },
    { key: 'category', value: d.category },
    { key: 'audience', value: d.audience },
    { key: 'unit', value: d.unit },
    { key: 'basis', value: d.basis },
    { key: 'intended_fit', value: d.intendedFit },
    { key: 'table', value: JSON.stringify(pruneAliases(d.table)) },
    { key: 'how_to_measure', value: d.howToMeasure },
  ];
}

function parseTable(raw: string | undefined): ChartTable {
  const empty: ChartTable = { sizes: [], measurements: {} };
  if (!raw) return empty;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return empty;
    const o = v as Record<string, unknown>;
    if (!Array.isArray(o.sizes) || !o.sizes.every((s) => typeof s === 'string')) return empty;
    if (!o.measurements || typeof o.measurements !== 'object') return empty;
    const measurements: ChartTable['measurements'] = {};
    for (const dim of DIMS) {
      const col = (o.measurements as Record<string, unknown>)[dim];
      if (col === undefined) continue;
      if (!Array.isArray(col)) return empty;
      measurements[dim] = col.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null));
    }
    const table: ChartTable = { sizes: [...(o.sizes as string[])], measurements };
    if (o.aliases && typeof o.aliases === 'object' && !Array.isArray(o.aliases)) {
      const aliases: Record<string, string> = {};
      for (const [k, val] of Object.entries(o.aliases as Record<string, unknown>)) {
        if (typeof val === 'string') aliases[k] = val;
      }
      if (Object.keys(aliases).length > 0) table.aliases = aliases;
    }
    return table;
  } catch {
    return empty;
  }
}

function choice<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function fromFields(
  id: string,
  handle: string,
  fields: { key: string; value: string | null }[],
): ChartDraft {
  const get = (key: string) => fields.find((f) => f.key === key)?.value ?? undefined;
  const blank = blankDraft();
  return {
    id,
    handle,
    name: get('name') ?? '',
    category: choice(get('category'), CATEGORIES, blank.category),
    audience: choice(get('audience'), AUDIENCES, blank.audience),
    unit: choice(get('unit'), UNITS, blank.unit),
    basis: choice(get('basis'), BASES, blank.basis),
    intendedFit: choice(get('intended_fit'), FITS, blank.intendedFit),
    table: parseTable(get('table')),
    howToMeasure: get('how_to_measure') ?? '',
  };
}

export function toChartInput(d: ChartDraft): ChartInput {
  return {
    ...copyTable(d.table),
    unit: d.unit,
    basis: d.basis,
    category: d.category,
    intendedFit: d.intendedFit,
  };
}

export function validateDraft(d: ChartDraft): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!d.name.trim()) errors.push('Give the chart a name.');
  if (d.table.sizes.length === 0) errors.push('Add at least one size.');
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const s of d.table.sizes) {
    const n = norm(s);
    if (seen.has(n)) dupes.add(s.trim());
    seen.add(n);
  }
  if (dupes.size > 0) errors.push(`Duplicate sizes: ${[...dupes].join(', ')}.`);

  const input = toChartInput(d);
  try {
    normalizeChart(input);
  } catch (e) {
    if (e instanceof ChartError) errors.push(e.message);
    else throw e;
  }
  if (errors.length === 0) {
    try {
      recommend(
        { sex: 'female', heightCm: 165, weightKg: 65, shape: { chest: 0, stomach: 0, hips: 0 }, fitPref: 'regular' },
        input,
      );
    } catch (e) {
      if (e instanceof ChartError) warnings.push(CANT_SCORE);
      else throw e;
    }
  }
  return { errors, warnings };
}

export function convertUnit(d: ChartDraft, to: 'cm' | 'in'): ChartDraft {
  const table = copyTable(d.table);
  if (d.unit === to) return { ...d, table };
  const f = (v: number) => Math.round((to === 'in' ? v / 2.54 : v * 2.54) * 2) / 2;
  for (const dim of DIMS as readonly Dim[]) {
    const col = table.measurements[dim];
    if (col) table.measurements[dim] = col.map((v) => (v === null ? null : f(v)));
  }
  return { ...d, unit: to, table };
}

export function newHandle(name: string, now: number = Date.now()): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `${slug || 'chart'}-${now.toString(36)}`;
}
