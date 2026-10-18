import { groupOf } from './ease';
import { ChartError, type AreaFit, type Dim, type FitPref, type NormalizedChart, type Recommendation, type SizeScore } from './types';

const WEIGHTS = {
  tops: { chest: 0.5, waist: 0.3, length: 0.2 },
  dress: { chest: 0.5, hip: 0.5 },
  bottoms: { waist: 0.5, hip: 0.35, inseam: 0.15 },
} satisfies Record<string, Partial<Record<Dim, number>>>;

const IDEAL_BAND = 0.03;
const TIGHT_PENALTY_FROM = -0.04;
const TIGHT_PENALTY = 1.5;
const POSITION_SCALE = 0.1;

function weightsFor(chart: NormalizedChart): Partial<Record<Dim, number>> {
  if (chart.category === 'dress') return WEIGHTS.dress;
  return groupOf(chart.category) === 'bottoms' ? WEIGHTS.bottoms : WEIGHTS.tops;
}

function primaryDim(chart: NormalizedChart): Dim {
  return groupOf(chart.category) === 'bottoms' ? 'waist' : 'chest';
}

function area(dim: Dim, delta: number): AreaFit {
  const label = delta < -IDEAL_BAND ? 'snug' : delta > IDEAL_BAND ? 'roomy' : 'ideal';
  return { dim, delta, label, position: Math.max(-1, Math.min(1, delta / POSITION_SCALE)) };
}

/** Error per size against the target; dimensions missing from the chart or target are skipped and weights renormalized. */
export function scoreSizes(chart: NormalizedChart, target: Partial<Record<Dim, number>>): SizeScore[] {
  const weights = Object.entries(weightsFor(chart)) as [Dim, number][];

  return chart.sizes.map((size, i) => {
    const usable = weights.filter(([dim]) => target[dim] !== undefined && chart.measurements[dim]?.[i] != null);
    const total = usable.reduce((s, [, w]) => s + w, 0);
    if (total === 0) return { size, error: Infinity, areas: [] };

    let error = 0;
    const areas = usable.map(([dim, w]) => {
      const t = target[dim]!;
      const delta = (chart.measurements[dim]![i]! - t) / t;
      error += (w / total) * Math.abs(delta) * (delta < TIGHT_PENALTY_FROM ? TIGHT_PENALTY : 1);
      return area(dim, delta);
    });
    return { size, error, areas };
  });
}

/** Picks the best size and turns its error into the shopper-facing confidence. */
export function selectSize(chart: NormalizedChart, scores: SizeScore[], fit: FitPref): Omit<Recommendation, 'fitNote'> {
  const order = scores
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => Number.isFinite(s.error))
    .sort((a, b) => a.s.error - b.s.error || (fit === 'relaxed' ? b.i - a.i : a.i - b.i));

  const best = order[0];
  if (!best) throw new ChartError('Chart has no measurements usable for this category');

  const primary = best.s.areas.find((a) => a.dim === primaryDim(chart));
  let outOfRange: Recommendation['outOfRange'] = null;
  if (primary && best.i === scores.length - 1 && primary.delta < TIGHT_PENALTY_FROM) outOfRange = 'above';
  if (primary && best.i === 0 && primary.delta > POSITION_SCALE) outOfRange = 'below';

  const fitMatch = Math.max(55, Math.min(98, Math.round(100 - 350 * best.s.error)));
  const band = outOfRange ? 'between' : fitMatch >= 85 ? 'confident' : fitMatch >= 70 ? 'good' : 'between';

  return {
    size: best.s.size,
    runnerUp: order[1]?.s.size ?? null,
    fitMatch,
    band,
    areas: best.s.areas,
    scores,
    outOfRange,
  };
}
