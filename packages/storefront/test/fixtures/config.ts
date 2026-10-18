import type { ChartInput } from '@true-size-chart/engine';
import type { FinderConfig } from '../../src/config';

/** The seeded dev chart, as the engine sees it. */
export const DEV_CHART: ChartInput = {
  sizes: ['S', 'M', 'L', 'XL'],
  measurements: { chest: [49, 52, 55, 58], length: [70, 72, 74, 76] },
  unit: 'cm',
  basis: 'garment_flat',
  category: 'tshirt',
  intendedFit: 'regular',
};

const SIZES = ['S', 'M', 'L', 'XL'];
const COLORS = ['Black', 'White'];

export const CONFIG: FinderConfig = {
  chart: {
    key: 'dev-tshirt-unisex',
    name: 'Dev T-shirt',
    category: 'tshirt',
    unit: 'cm',
    basis: 'garment_flat',
    intendedFit: 'regular',
    audience: 'unisex',
    table: {
      sizes: [...SIZES],
      measurements: { chest: [49, 52, 55, 58], length: [70, 72, 74, 76] },
    },
    howToMeasure: null,
  },
  product: { title: 'Dev tee', image: null, price: '$29.00' },
  variants: COLORS.flatMap((color, c) =>
    SIZES.map((size, s) => ({
      id: 1000 + c * 10 + s,
      available: !(color === 'Black' && size === 'XL'),
      options: [color, size],
    })),
  ),
  sizeOptionIndex: 1,
  selectedVariantId: 1000,
  routes: { cartAdd: '/cart/add', cart: '/cart' },
  assets: { js: '/assets/tsc-finder.js', css: '/assets/tsc-finder.css' },
  settings: { font: 'editorial', accent: '#111111', radius: 0 },
  strings: {},
};

/** Writes the config and an opener button, shaped like the theme block output. */
export function mountConfig(doc: Document, config: FinderConfig = CONFIG): void {
  doc.body.innerHTML = '';
  const script = doc.createElement('script');
  script.id = 'tsc-config';
  script.setAttribute('type', 'application/json');
  script.textContent = JSON.stringify(config);
  doc.body.appendChild(script);

  const button = doc.createElement('button');
  button.setAttribute('data-tsc-open', '');
  button.setAttribute('data-tsc-default', 'Find my size');
  button.setAttribute('data-tsc-remembered', 'Your size: {size}');
  const label = doc.createElement('span');
  label.setAttribute('data-tsc-label', '');
  label.textContent = 'Find my size';
  button.appendChild(label);
  doc.body.appendChild(button);
}
