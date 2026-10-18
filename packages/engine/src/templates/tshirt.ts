import type { ChartInput } from '../types';

/** Brand-neutral starter chart: garment measured flat, in cm. */
export const TSHIRT_UNISEX: ChartInput = {
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  measurements: {
    chest: [46, 49, 52, 55, 58, 61],
    length: [68, 70, 72, 74, 76, 78],
  },
  unit: 'cm',
  basis: 'garment_flat',
  category: 'tshirt',
  intendedFit: 'regular',
};
