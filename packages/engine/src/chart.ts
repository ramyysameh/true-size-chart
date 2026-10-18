import { ChartError, type ChartInput, type Dim, type NormalizedChart } from './types';

const GIRTHS: ReadonlySet<Dim> = new Set(['chest', 'waist', 'hip']);

/** Converts a merchant chart to cm and circumference so every chart is compared the same way. */
export function normalizeChart(chart: ChartInput): NormalizedChart {
  if (chart.sizes.length === 0) throw new ChartError('Chart has no sizes');

  const unitFactor = chart.unit === 'in' ? 2.54 : 1;
  const measurements: NormalizedChart['measurements'] = {};

  for (const [dim, values] of Object.entries(chart.measurements) as [Dim, (number | null)[]][]) {
    if (values.length !== chart.sizes.length) {
      throw new ChartError(`"${dim}" has ${values.length} values for ${chart.sizes.length} sizes`);
    }
    const factor = unitFactor * (chart.basis === 'garment_flat' && GIRTHS.has(dim) ? 2 : 1);
    measurements[dim] = values.map((v) => (v === null ? null : v * factor));
  }

  return {
    sizes: [...chart.sizes],
    measurements,
    basis: chart.basis === 'body' ? 'body' : 'garment',
    category: chart.category,
    intendedFit: chart.intendedFit,
  };
}
