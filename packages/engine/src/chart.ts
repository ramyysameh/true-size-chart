import { CATEGORIES, ChartError, DIMS, type ChartInput, type Dim, type NormalizedChart } from './types';

const GIRTHS: ReadonlySet<Dim> = new Set(['chest', 'waist', 'hip']);
const UNITS = ['cm', 'in'];
const BASES = ['garment_flat', 'garment_circ', 'body'];
const INTENDED_FITS = ['slim', 'regular', 'oversized'];

function oneOf(field: string, value: unknown, allowed: readonly string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ChartError(`${field} must be one of ${allowed.join(', ')} (got ${JSON.stringify(value)})`);
  }
}

/**
 * Validates merchant chart data and converts it to cm and circumference so every
 * chart is compared the same way. Columns the engine does not score are dropped.
 */
export function normalizeChart(chart: ChartInput): NormalizedChart {
  if (!Array.isArray(chart.sizes) || chart.sizes.length === 0) throw new ChartError('Chart has no sizes');
  if (typeof chart.measurements !== 'object' || chart.measurements === null) throw new ChartError('Chart has no measurements');
  oneOf('unit', chart.unit, UNITS);
  oneOf('basis', chart.basis, BASES);
  oneOf('category', chart.category, CATEGORIES);
  oneOf('intendedFit', chart.intendedFit, INTENDED_FITS);

  const unitFactor = chart.unit === 'in' ? 2.54 : 1;
  const measurements: NormalizedChart['measurements'] = {};

  for (const dim of DIMS) {
    const values: unknown = chart.measurements[dim];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.length !== chart.sizes.length) {
      throw new ChartError(`"${dim}" needs one value per size (${chart.sizes.length})`);
    }
    const factor = unitFactor * (chart.basis === 'garment_flat' && GIRTHS.has(dim) ? 2 : 1);
    measurements[dim] = values.map((v: unknown, i) => {
      if (v === null) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        throw new ChartError(`"${dim}" for size ${chart.sizes[i]} must be a positive number or empty (got ${JSON.stringify(v)})`);
      }
      return v * factor;
    });
  }

  return {
    sizes: [...chart.sizes],
    measurements,
    basis: chart.basis === 'body' ? 'body' : 'garment',
    category: chart.category,
    intendedFit: chart.intendedFit,
  };
}
