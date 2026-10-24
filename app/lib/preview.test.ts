// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { blankDraft, type ChartDraft } from './chart-model';
import { previewConfig, previewDocument } from './preview';

const ASSETS = { js: 'http://x.test/a.js', css: 'http://x.test/a.css' };

/** Parse into an inert template so happy-dom never tries to fetch the scripts. */
function parse(html: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
}

function draft(over: Partial<ChartDraft> = {}): ChartDraft {
  return { ...blankDraft(), name: 'Tee', ...over };
}

describe('previewConfig', () => {
  it('builds one available variant per size and flags preview mode', () => {
    const d = draft({ handle: 'tee', table: { sizes: ['S', 'M', 'L'], measurements: { chest: [50, 52, 54] } } });
    const c = previewConfig(d, ASSETS);
    expect(c.preview).toBe(true);
    expect(c.chart.key).toBe('tee');
    expect(c.variants).toEqual([
      { id: 1, available: true, options: ['S'] },
      { id: 2, available: true, options: ['M'] },
      { id: 3, available: true, options: ['L'] },
    ]);
    expect(c.sizeOptionIndex).toBe(0);
    expect(c.selectedVariantId).toBe(1);
    expect(c.assets).toEqual(ASSETS);
    expect(c.strings).toEqual({});
    expect(c.settings).toEqual({ font: 'editorial', accent: '#111111', radius: 0 });
  });

  it('falls back to the preview key and follows size edits', () => {
    const c = previewConfig(draft({ table: { sizes: ['XS', 'S'], measurements: { chest: [48, 50] } } }), ASSETS);
    expect(c.chart.key).toBe('preview');
    expect(c.variants.map((v) => v.options[0])).toEqual(['XS', 'S']);
  });
});

describe('previewDocument', () => {
  it('round-trips a hostile name through the config element', () => {
    const name = '</script><b>"x" & y</b>\u2028\u2029';
    const html = previewDocument(previewConfig(draft({ name }), ASSETS));
    expect(html).not.toContain('</script><b>');
    const el = parse(html).querySelector('#tsc-config');
    expect(el?.getAttribute('type')).toBe('application/json');
    expect(JSON.parse(el!.textContent!).chart.name).toBe(name);
  });

  it('loads the finder script and has an open button', () => {
    const doc = parse(previewDocument(previewConfig(draft(), ASSETS)));
    expect(doc.querySelector('script[src="http://x.test/a.js"]')).not.toBeNull();
    expect(doc.querySelector('button[data-tsc-open]')?.textContent).toBe('Find my size');
  });

  it('escapes asset URLs placed in attributes', () => {
    const html = previewDocument(previewConfig(draft(), { js: 'http://x.test/a.js?"><i>', css: 'c' }));
    expect(html).not.toContain('"><i>');
  });
});
