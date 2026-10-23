import { CATEGORIES, type Category, type ChartInput } from '../types';
import { TEMPLATE_CHARTS, type TemplateAudience, type TemplateKey } from './charts';

export interface Template {
  key: TemplateKey;
  name: string;
  category: Category;
  audience: TemplateAudience;
  chart: ChartInput;
  howToMeasure: string;
}

const LABEL: Record<Category, string> = {
  tshirt: 'T-shirt',
  shirt: 'Shirt',
  hoodie: 'Hoodie & sweatshirt',
  jacket: 'Jacket',
  dress: 'Dress',
  pants: 'Pants & jeans',
  shorts: 'Shorts',
  skirt: 'Skirt',
};

const GARMENT_FLAT =
  'Lay the garment flat. Chest: measure straight across, 2 cm below the armholes. Length: from the highest point of the shoulder to the hem.';
const BODY =
  'Measure your body, not a garment. Bust: around the fullest part. Waist: around the narrowest part. Hips: around the fullest part, feet together.';
const GARMENT_CIRC =
  'Measure all the way around. Waist: along the top of the waistband. Hips: around the fullest part. Inseam: from the crotch seam to the hem.';
const SKIRT = GARMENT_CIRC.replace(
  'Inseam: from the crotch seam to the hem.',
  'Length: from the top of the waistband to the hem.',
);

function howToMeasure(chart: ChartInput): string {
  if (chart.basis === 'garment_flat') return GARMENT_FLAT;
  if (chart.basis === 'body') return BODY;
  return chart.category === 'skirt' ? SKIRT : GARMENT_CIRC;
}

/** The starter templates in CATEGORIES order, women first. Merchant-admin copy only: keep it out of the storefront bundle. */
export const TEMPLATES: readonly Template[] = CATEGORIES.flatMap((category) =>
  (['women', 'unisex'] as const).flatMap((audience) => {
    const key: TemplateKey = `${category}-${audience}`;
    const chart = TEMPLATE_CHARTS[key];
    if (!chart) return [];
    return [{ key, name: `${LABEL[category]} (${audience})`, category, audience, chart, howToMeasure: howToMeasure(chart) }];
  }),
);
