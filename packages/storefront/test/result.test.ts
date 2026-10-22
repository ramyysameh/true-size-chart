import { fitMatchFromError } from '@true-size-chart/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinderConfig } from '../src/config';
import { cta } from '../src/copy';
import type { FinderContext, TrueSizeFinder } from '../src/finder/element';
import { renderResult } from '../src/finder/screens/result';
import '../src/index';
import { defaultDraft, finalRecommendation, toProfile, type Draft } from '../src/model';
import { PROFILE_KEY } from '../src/profile-store';
import { STRINGS, fmt } from '../src/strings';
import { inStockPick } from '../src/variants';
import { CONFIG, DEV_CHART, mountConfig } from './fixtures/config';

/** A data: stylesheet, so happy-dom's own fetch of it succeeds offline. */
const BASE: FinderConfig = { ...CONFIG, assets: { ...CONFIG.assets, css: 'data:text/css,' } };
const DRAFT: Draft = { ...defaultDraft(CONFIG, null, 'en-GB'), sex: 'male', heightCm: 186, weightKg: 92 };
const BLACK_M = 1001;
const WHITE_M = 1011;
const WHITE_XL = 1013;

let reduced = true;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  reduced = true;
  vi.stubGlobal('matchMedia', (media: string) => ({ media, matches: reduced && media === '(prefers-reduced-motion: reduce)' }));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The theme's product form, which currentVariantId reads. */
function selectVariant(id: number) {
  const form = document.createElement('form');
  form.setAttribute('action', '/cart/add');
  const input = document.createElement('input');
  input.name = 'id';
  input.value = String(id);
  form.append(input);
  document.body.append(form);
}

/** Stores the draft as the shopper's profile and opens the finder, which then lands on the result. */
async function openResult(opts: { draft?: Draft; config?: FinderConfig; variant?: number } = {}) {
  const draft = opts.draft ?? DRAFT;
  mountConfig(document, opts.config ?? BASE);
  selectVariant(opts.variant ?? WHITE_M);
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, profile: toProfile(draft), units: draft.units, sizes: {} }));
  const el = document.createElement('true-size-finder') as TrueSizeFinder;
  document.body.append(el);
  const opening = el.open();
  el.shadowRoot!.querySelector('link')!.dispatchEvent(new Event('load'));
  await opening;
  return el.shadowRoot!;
}

const sizeButton = (root: ParentNode, size: string) =>
  [...root.querySelectorAll<HTMLElement>('.tsc-sizes button')].find((b) => b.querySelector('.tsc-size')?.textContent === size)!;
const ctaButton = (root: ParentNode) => root.querySelector<HTMLButtonElement>('.tsc-cta .tsc-primary');
const text = (root: ParentNode, sel: string) => root.querySelector(sel)?.textContent ?? null;
const byText = (root: ParentNode, sel: string, t: string) =>
  [...root.querySelectorAll<HTMLElement>(sel)].find((n) => n.textContent === t) ?? null;

describe('result screen', () => {
  it('recommends XL for the reference shopper (precondition)', () => {
    expect(finalRecommendation(DRAFT, DEV_CHART).size).toBe('XL');
  });

  it('with reduced motion shows the ring and the final % on first render', async () => {
    const rec = finalRecommendation(DRAFT, DEV_CHART);
    const root = await openResult();
    expect(text(root, '.tsc-result > .tsc-label')).toBe('Best match');
    expect(text(root, '.tsc-ring .tsc-num')).toBe('XL');
    expect(text(root, '.tsc-pct')).toBe(fmt(STRINGS.fitMatch, { n: rec.fitMatch }));
    expect(root.querySelector('.tsc-arc')?.getAttribute('stroke-dasharray')).toBe(`${rec.fitMatch} 100`);
    expect(text(root, '.tsc-conf')).toBe(STRINGS.confident);
  });

  it('counts the % up from 0 over 600 ms', async () => {
    reduced = false;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const rec = finalRecommendation(DRAFT, DEV_CHART);
    const root = await openResult();
    expect(text(root, '.tsc-pct')).toBe(fmt(STRINGS.fitMatch, { n: 0 }));

    frames.shift()!(1000);
    frames.shift()!(1300);
    const mid = Number(text(root, '.tsc-pct')!.match(/\d+/)![0]);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(rec.fitMatch);

    frames.shift()!(1600);
    expect(text(root, '.tsc-pct')).toBe(fmt(STRINGS.fitMatch, { n: rec.fitMatch }));
    expect(frames).toHaveLength(0);
  });

  it('marks the recommended size with You and aria-pressed', async () => {
    const root = await openResult();
    const xl = sizeButton(root, 'XL');
    expect(xl.querySelector('.tsc-you')?.textContent).toBe('You');
    expect(xl.getAttribute('aria-pressed')).toBe('true');
    expect(sizeButton(root, 'L').getAttribute('aria-pressed')).toBe('false');
    expect(sizeButton(root, 'L').querySelector('.tsc-you')).toBeNull();
    expect(text(root, '.tsc-hint')).toBe(STRINGS.tapHint);
  });

  it('shows the fit breakdown, the fit note and the disclaimer', async () => {
    const rec = finalRecommendation(DRAFT, DEV_CHART);
    const root = await openResult();
    expect([...root.querySelectorAll('.tsc-scale span')].map((n) => n.textContent)).toEqual(['Snug', 'Ideal', 'Roomy']);
    const rows = [...root.querySelectorAll<HTMLElement>('.tsc-area')];
    expect(rows).toHaveLength(rec.areas.length);
    const chest = rec.areas.find((a) => a.dim === 'chest')!;
    const row = rows.find((r) => r.getAttribute('aria-label')?.startsWith('Chest'))!;
    expect(row.getAttribute('aria-label')).toBe(`Chest: ${STRINGS[chest.label]}`);
    expect(row.querySelector<HTMLElement>('.tsc-pin')!.style.left).toBe(`${+((chest.position + 1) * 50).toFixed(2)}%`);
    expect(text(root, '.tsc-note p:last-child')).toBe(STRINGS.trueToSize);
    expect(text(root, '.tsc-disc')).toBe(STRINGS.disclaimer);
  });

  it('substitutes the next best in-stock size when XL is sold out in the current colour', async () => {
    const rec = finalRecommendation(DRAFT, DEV_CHART);
    const alt = inStockPick(rec, 'XL', CONFIG, BLACK_M)!.size;
    expect(alt).not.toBe('XL');
    const root = await openResult({ variant: BLACK_M });
    expect(ctaButton(root)?.textContent).toBe(cta(alt, STRINGS));
    expect(text(root, '.tsc-sub-note')).toBe(fmt(STRINGS.substituted, { size: 'XL', alt }));
  });

  it('offers XL in the current colour when it is in stock', async () => {
    const root = await openResult({ variant: WHITE_M });
    expect(ctaButton(root)?.textContent).toBe('Add XL to bag');
    expect(root.querySelector('.tsc-sub-note')).toBeNull();
  });

  it('preview mode never touches the cart and says so', async () => {
    const root = await openResult({ config: { ...BASE, preview: true } });
    ctaButton(root)!.click();
    await vi.waitFor(() => expect(text(root, '.tsc-status')).toBe('Preview only \u2014 nothing was added to a cart.'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the White/XL variant and links to the bag', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const root = await openResult();
    ctaButton(root)!.click();
    expect(ctaButton(root)?.textContent).toBe(STRINGS.adding);
    expect(ctaButton(root)?.getAttribute('aria-busy')).toBe('true');

    await vi.waitFor(() => expect(text(root, '.tsc-status')).toBe('Added to bag'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.items).toEqual([{ id: WHITE_XL, quantity: 1 }]);
    const link = byText(root, 'a', 'View bag');
    expect(link?.getAttribute('href')).toBe('/cart');
  });

  it('closes the finder before the theme cart drawer opens, and keeps it open without a drawer', async () => {
    const state = { hiddenWhenDrawerOpened: false, overflowWhenDrawerOpened: 'hidden' };
    const root = await openResult();
    const panelRoot = root.querySelector<HTMLElement>('.tsc-root')!;
    document.body.insertAdjacentHTML('beforeend', '<cart-drawer class="drawer"><div id="CartDrawer"></div></cart-drawer>');
    // Dawn's renderContents opens the drawer from a timer; record what the finder looked like at that moment.
    (document.querySelector('cart-drawer') as unknown as { renderContents: unknown }).renderContents = () =>
      void setTimeout(() => {
        state.hiddenWhenDrawerOpened = panelRoot.hidden;
        state.overflowWhenDrawerOpened = document.documentElement.style.overflow;
      }, 0);
    expect(panelRoot.hidden).toBe(false);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ sections: {} }) });
    ctaButton(root)!.click();
    await vi.waitFor(() => expect(panelRoot.hidden).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(state).toEqual({ hiddenWhenDrawerOpened: true, overflowWhenDrawerOpened: '' });

    const again = await openResult();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    ctaButton(again)!.click();
    await vi.waitFor(() => expect(text(again, '.tsc-status')).toBe('Added to bag'));
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('disables the size buttons while the add is in flight, then enables them again', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const root = await openResult();
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.tsc-sizes button')];
    ctaButton(root)!.click();
    expect(buttons().every((b) => b.disabled)).toBe(true);
    // A tap during the add can't swap the CTA out from under the confirmation.
    sizeButton(root, 'L').click();
    finish({ ok: true, status: 200, json: async () => ({}) });
    await vi.waitFor(() => expect(text(root, '.tsc-status')).toBe('Added to bag'));
    expect(buttons().every((b) => !b.disabled)).toBe(true);

    fetchMock.mockRejectedValue(new TypeError('offline'));
    sizeButton(root, 'L').click();
    ctaButton(root)!.click();
    expect(buttons().every((b) => b.disabled)).toBe(true);
    await vi.waitFor(() => expect(text(root, '.tsc-status')).toBe(STRINGS.addError));
    expect(buttons().every((b) => !b.disabled)).toBe(true);
  });

  it('shows the add error and lets the shopper try again', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const root = await openResult();
    ctaButton(root)!.click();
    await vi.waitFor(() => expect(text(root, '.tsc-status')).toBe("Couldn't add to bag. Please try again."));
    const button = ctaButton(root)!;
    expect(button.textContent).toBe('Add XL to bag');
    expect(button.hasAttribute('aria-busy')).toBe(false);
    button.click();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a disabled Sold out when no size is in stock', async () => {
    const config = { ...BASE, variants: BASE.variants.map((v) => ({ ...v, available: false })) };
    const root = await openResult({ config });
    expect(ctaButton(root)?.textContent).toBe(STRINGS.soldOut);
    expect(ctaButton(root)?.disabled).toBe(true);
  });

  it('asks the shopper to pick the size on the page when no size option matched', async () => {
    const root = await openResult({ config: { ...BASE, sizeOptionIndex: null } });
    expect(ctaButton(root)).toBeNull();
    expect(text(root, '.tsc-cta')).toBe(fmt(STRINGS.noSizeOption, { size: 'XL' }));
  });

  it('says a size the product does not carry is not available, then offers the next best in stock', async () => {
    const config: FinderConfig = { ...BASE, variants: BASE.variants.filter((v) => v.options[1] !== 'XL') };
    const rec = finalRecommendation(DRAFT, DEV_CHART);
    const alt = inStockPick(rec, 'XL', config, WHITE_M)!.size;
    const root = await openResult({ config });
    expect(text(root, '.tsc-sub-note')).toBe(fmt(STRINGS.notOfferedAlt, { size: 'XL', alt }));
    expect(ctaButton(root)?.textContent).toBe(cta(alt, STRINGS));
    expect(root.textContent).not.toContain('sold out');
  });

  it('says a size the product does not carry is not available when nothing else is in stock', async () => {
    const config: FinderConfig = {
      ...BASE,
      variants: BASE.variants.filter((v) => v.options[1] !== 'XL').map((v) => ({ ...v, available: false })),
    };
    const root = await openResult({ config });
    expect(ctaButton(root)).toBeNull();
    expect(text(root, '.tsc-cta')).toBe(fmt(STRINGS.notOffered, { size: 'XL' }));
    // A size the product does carry, sold out everywhere, is still sold out.
    sizeButton(root, 'L').click();
    expect(ctaButton(root)?.textContent).toBe(STRINGS.soldOut);
  });

  it('asks the shopper to pick on the page when no chart size matches a variant', async () => {
    const config: FinderConfig = {
      ...BASE,
      variants: BASE.variants.map((v) => ({ ...v, options: [v.options[0]!, `Size ${v.options[1]}`] })),
    };
    const root = await openResult({ config });
    expect(ctaButton(root)).toBeNull();
    expect(text(root, '.tsc-cta')).toBe(fmt(STRINGS.noSizeOption, { size: 'XL' }));
  });

  it('re-renders the breakdown, % and CTA for a tapped size', async () => {
    const rec = finalRecommendation(DRAFT, DEV_CHART);
    const root = await openResult();
    const l = sizeButton(root, 'L');
    l.click();
    const score = rec.scores.find((sc) => sc.size === 'L')!;
    expect(l.getAttribute('aria-pressed')).toBe('true');
    expect(sizeButton(root, 'XL').getAttribute('aria-pressed')).toBe('false');
    expect(text(root, '.tsc-ring .tsc-num')).toBe('L');
    expect(text(root, '.tsc-pct')).toBe(fmt(STRINGS.fitMatch, { n: fitMatchFromError(score.error)! }));
    expect(root.querySelectorAll('.tsc-area')).toHaveLength(score.areas.length);
    expect(ctaButton(root)?.textContent).toBe('Add L to bag');
  });

  it('shows no data and no % for a size the engine could not judge', async () => {
    const config: FinderConfig = {
      ...BASE,
      chart: { ...BASE.chart, table: { ...BASE.chart.table, measurements: { ...BASE.chart.table.measurements, chest: [null, 52, 55, 58] } } },
    };
    const root = await openResult({ config });
    sizeButton(root, 'S').click();
    expect(text(root, '.tsc-breakdown')).toBe('No measurements for this size.');
    expect(root.querySelector('.tsc-pct')?.closest('[hidden]')).not.toBeNull();
    expect(root.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('says when the shopper is past the largest size', async () => {
    const root = await openResult({ draft: { ...DRAFT, weightKg: 150 } });
    expect(text(root, '.tsc-conf')).toBe('XL is our largest size, so it may fit snug.');
    expect(root.textContent).not.toContain('Between');
  });

  it('saves the profile and the size, and paints the page button', async () => {
    await openResult();
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY)!);
    expect(stored.profile).toEqual(toProfile(DRAFT));
    expect(stored.sizes['dev-tshirt-unisex']).toBe('XL');
    expect(document.querySelector('[data-tsc-label]')?.textContent).toBe('Your size: XL');
  });

  it('Edit details goes back to step 1 with the draft', async () => {
    const root = await openResult();
    byText(root, '.tsc-links button', 'Edit details')!.click();
    expect(text(root, '.tsc-count')).toBe('01 / 03');
    expect(root.querySelector('[role="slider"][aria-label="Height"]')?.getAttribute('aria-valuenow')).toBe('186');
  });

  it('Clear my data forgets the shopper and starts over', async () => {
    const root = await openResult();
    byText(root, '.tsc-links button', 'Clear my data')!.click();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(document.querySelector('[data-tsc-label]')?.textContent).toBe('Find my size');
    expect(text(root, 'h3')).toBe("Let's find your fit");
    // The draft is reset too: the unisex chart's default is Female, the stored shopper was Male.
    expect(byText(root, '.tsc-toggle button', 'Female')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('a stored profile out of range opens on step 1 and is removed', async () => {
    mountConfig(document, BASE);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, profile: { ...toProfile(DRAFT), heightCm: 999 }, units: DRAFT.units, sizes: {} }));
    const el = document.createElement('true-size-finder') as TrueSizeFinder;
    document.body.append(el);
    const opening = el.open();
    el.shadowRoot!.querySelector('link')!.dispatchEvent(new Event('load'));
    await opening;
    expect(text(el.shadowRoot!, 'h3')).toBe("Let's find your fit");
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it('an invalid draft clears the profile and goes back to step 1', async () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, profile: toProfile(DRAFT), units: DRAFT.units, sizes: {} }));
    const go = vi.fn();
    const ctx: FinderContext = {
      config: CONFIG,
      strings: { ...STRINGS },
      draft: { ...DRAFT, heightCm: 999 },
      setDraft() {},
      go,
      close() {},
    };
    renderResult(ctx);
    expect(go).toHaveBeenCalledWith('body');
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it('goes to the size chart when the engine can score no size', () => {
    const go = vi.fn();
    const config: FinderConfig = {
      ...CONFIG,
      chart: { ...CONFIG.chart, table: { sizes: ['S', 'M'], measurements: { hip: [96, 100] } } },
    };
    const ctx: FinderContext = { config, strings: { ...STRINGS }, draft: DRAFT, setDraft() {}, go, close() {} };
    renderResult(ctx);
    expect(go).toHaveBeenCalledWith('chart');
  });
});
