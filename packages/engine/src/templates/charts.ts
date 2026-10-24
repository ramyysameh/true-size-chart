import type { Category, ChartInput } from '../types';
import { TSHIRT_UNISEX } from './tshirt';

export type TemplateAudience = 'women' | 'unisex';
export type TemplateKey = `${Category}-${TemplateAudience}`;

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const chart = (
  category: Category,
  basis: ChartInput['basis'],
  measurements: ChartInput['measurements'],
): ChartInput => ({ sizes: [...SIZES], measurements, unit: 'cm', basis, category, intendedFit: 'regular' });

const PANTS_WOMEN = { waist: [68, 72, 76, 80, 86, 92], hip: [92, 96, 100, 104, 110, 116] };
const PANTS_UNISEX = { waist: [76, 81, 86, 91, 97, 103], hip: [92, 97, 102, 107, 113, 119] };

/** Brand-neutral starter charts, calibrated against the engine so a median shopper lands on M or L. */
export const TEMPLATE_CHARTS: Readonly<Partial<Record<TemplateKey, ChartInput>>> = {
  'tshirt-women': chart('tshirt', 'garment_flat', { chest: [44, 47, 50, 53, 56, 59], length: [60, 62, 64, 66, 68, 70] }),
  'tshirt-unisex': TSHIRT_UNISEX,
  'shirt-women': chart('shirt', 'garment_flat', { chest: [44, 47, 50, 53, 56, 59], length: [64, 66, 68, 70, 72, 74] }),
  'shirt-unisex': chart('shirt', 'garment_flat', { chest: [50, 53, 56, 59, 62, 65], length: [72, 74, 76, 78, 80, 82] }),
  'hoodie-women': chart('hoodie', 'garment_flat', { chest: [47, 50, 53, 56, 59, 62], length: [60, 62, 64, 66, 68, 70] }),
  'hoodie-unisex': chart('hoodie', 'garment_flat', { chest: [52, 55, 58, 61, 64, 67], length: [66, 68, 70, 72, 74, 76] }),
  'jacket-women': chart('jacket', 'garment_flat', { chest: [48, 51, 54, 57, 60, 63], length: [60, 62, 64, 66, 68, 70] }),
  'jacket-unisex': chart('jacket', 'garment_flat', { chest: [54, 57, 60, 63, 66, 69], length: [68, 70, 72, 74, 76, 78] }),
  'dress-women': chart('dress', 'body', {
    chest: [80, 84, 88, 94, 100, 106],
    waist: [62, 66, 70, 76, 82, 88],
    hip: [88, 92, 96, 102, 108, 114],
  }),
  'pants-women': chart('pants', 'garment_circ', { ...PANTS_WOMEN, inseam: [76, 77, 78, 79, 80, 81] }),
  'pants-unisex': chart('pants', 'garment_circ', { ...PANTS_UNISEX, inseam: [80, 81, 82, 83, 84, 85] }),
  'shorts-women': chart('shorts', 'garment_circ', PANTS_WOMEN),
  'shorts-unisex': chart('shorts', 'garment_circ', PANTS_UNISEX),
  'skirt-women': chart('skirt', 'garment_circ', { ...PANTS_WOMEN, length: [45, 46, 47, 48, 49, 50] }),
};

/** women → the women template; men/unisex/null → unisex; falls back to whichever exists. */
export function referenceFor(category: Category, audience: 'women' | 'men' | 'unisex' | null): ChartInput | undefined {
  const women = TEMPLATE_CHARTS[`${category}-women`];
  const unisex = TEMPLATE_CHARTS[`${category}-unisex`];
  return audience === 'women' ? (women ?? unisex) : (unisex ?? women);
}
