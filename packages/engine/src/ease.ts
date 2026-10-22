import type { BodyEstimate } from './body';
import type { Category, Dim, FitPref, NormalizedChart, Sex } from './types';

export type Group = 'tops' | 'bottoms';

export function groupOf(category: Category): Group {
  return category === 'pants' || category === 'shorts' || category === 'skirt' ? 'bottoms' : 'tops';
}

/** Extra room a garment has over the body, as a fraction of the body girth. */
export const EASE: Record<Group, Record<FitPref, Partial<Record<Dim, number>>>> = {
  tops: {
    slim: { chest: 0.04, waist: 0.08, hip: 0.08 },
    regular: { chest: 0.08, waist: 0.16, hip: 0.16 },
    relaxed: { chest: 0.15, waist: 0.26, hip: 0.26 },
  },
  bottoms: {
    slim: { waist: -0.04, hip: -0.02 },
    regular: { waist: -0.02, hip: 0.01 },
    relaxed: { waist: 0.01, hip: 0.05 },
  },
};

/** ANSUR measures the waist at the navel; trousers sit lower, where women are narrower. Bottoms only. */
export const WAISTBAND: Record<Sex, number> = { female: 0.95, male: 1 };

/** Outerwear-style categories are cut with extra room on top of the tops ease. */
const LAYER_EASE: Partial<Record<Category, number>> = { hoodie: 0.06, jacket: 0.06 };

/** How the designer cut the garment shifts what "regular" means for this chart. */
export const INTENDED: Record<NormalizedChart['intendedFit'], number> = { slim: -0.04, regular: 0, oversized: 0.1 };

/** Garment length (shoulder to hem) as a fraction of the shopper's height. */
export const LENGTH_RATIO: Partial<Record<Category, number>> = { tshirt: 0.4, shirt: 0.42, hoodie: 0.4, jacket: 0.42 };

const BODY_KEY: Record<'chest' | 'waist' | 'hip', 'chest' | 'waist' | 'hip'> = { chest: 'chest', waist: 'waist', hip: 'hip' };

/** The garment measurements that would fit this shopper the way they asked. */
export function targetFor(body: BodyEstimate, chart: NormalizedChart, fit: FitPref): Partial<Record<Dim, number>> {
  const group = groupOf(chart.category);
  const isGarment = chart.basis === 'garment';
  const extra = isGarment ? (LAYER_EASE[chart.category] ?? 0) * (group === 'tops' ? 1 : 0) + INTENDED[chart.intendedFit] : 0;
  const target: Partial<Record<Dim, number>> = {};

  for (const [dim, ease] of Object.entries(EASE[group][fit]) as ['chest' | 'waist' | 'hip', number][]) {
    const girth = body[BODY_KEY[dim]] * (group === 'bottoms' && dim === 'waist' ? WAISTBAND[body.sex] : 1);
    target[dim] = girth * (1 + (isGarment ? ease + extra : 0));
  }

  const ratio = LENGTH_RATIO[chart.category];
  if (isGarment && ratio !== undefined) target.length = body.heightCm * ratio;
  if (chart.category === 'pants') target.inseam = body.inseam;

  return target;
}
