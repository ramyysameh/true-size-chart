import type { FinderConfig } from '../../packages/storefront/src/config';
import type { ChartDraft } from './chart-model';

export function previewConfig(d: ChartDraft, assets: { js: string; css: string }): FinderConfig {
  return {
    chart: {
      key: d.handle ?? 'preview',
      name: d.name,
      category: d.category,
      unit: d.unit,
      basis: d.basis,
      intendedFit: d.intendedFit,
      audience: d.audience,
      table: d.table,
      howToMeasure: d.howToMeasure.trim() ? d.howToMeasure : null,
    },
    product: { title: 'Preview product', image: null, price: '' },
    variants: d.table.sizes.map((size, i) => ({ id: i + 1, available: true, options: [size] })),
    sizeOptionIndex: 0,
    selectedVariantId: 1,
    routes: { cartAdd: '/cart/add', cart: '/cart' },
    assets,
    settings: { font: 'editorial', accent: '#111111', radius: 0 },
    strings: {},
    preview: true,
  };
}

const UNSAFE_IN_SCRIPT = new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

/** JSON that is safe as the text of a <script> element: < > & and the JS line separators become unicode escapes. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, (c) => {
    const hex = c.charCodeAt(0).toString(16).padStart(4, '0');
    return String.fromCharCode(92) + 'u' + hex;
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BOOT = `
(function () {
  var finder = null;
  function open(trigger) {
    if (!finder) {
      finder = document.createElement('true-size-finder');
      document.body.appendChild(finder);
    } else if (!finder.isConnected) {
      document.body.appendChild(finder);
    }
    finder.open({ trigger: trigger || null });
  }
  var btn = document.querySelector('[data-tsc-open]');
  function ready() {
    open(btn);
    btn.addEventListener('click', function () { open(btn); });
  }
  if (window.customElements) customElements.whenDefined('true-size-finder').then(ready);
})();
`;

export function previewDocument(config: FinderConfig): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; background: #fff; color: #111; }
  body { display: flex; align-items: center; justify-content: center; }
  button { font: inherit; padding: 12px 24px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }
</style>
</head>
<body>
<button type="button" data-tsc-open>Find my size</button>
<script type="application/json" id="tsc-config">${safeJson(config)}</script>
<script src="${escapeAttr(config.assets.js)}"></script>
<script>${BOOT}</script>
</body>
</html>`;
}
