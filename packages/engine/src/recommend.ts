import { estimateBody } from './body';
import { normalizeChart } from './chart';
import { targetFor } from './ease';
import { scoreSizes, selectSize } from './score';
import type { ChartInput, Recommendation, ShopperProfile } from './types';

/**
 * The full finder answer for one shopper and one chart. `reference` is the
 * category's standard chart; comparing against it produces the fit note.
 */
export function recommend(profile: ShopperProfile, chart: ChartInput, opts: { reference?: ChartInput } = {}): Recommendation {
  const normalized = normalizeChart(chart);
  const target = targetFor(estimateBody(profile), normalized, profile.fitPref);
  const selected = selectSize(normalized, scoreSizes(normalized, target), profile.fitPref);

  let fitNote: Recommendation['fitNote'] = 'true_to_size';
  if (opts.reference) {
    const usual = chart.sizes.indexOf(recommend(profile, opts.reference).size);
    const here = chart.sizes.indexOf(selected.size);
    if (usual >= 0 && here > usual) fitNote = 'runs_small';
    if (usual >= 0 && here < usual) fitNote = 'runs_large';
  }

  return { ...selected, fitNote };
}
