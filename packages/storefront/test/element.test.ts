import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinderConfig } from '../src/config';
import type { TrueSizeFinder } from '../src/finder/element';
import { h } from '../src/finder/dom';
import '../src/index';
import { PROFILE_KEY } from '../src/profile-store';
import { CONFIG, mountConfig } from './fixtures/config';

/** A data: stylesheet, so happy-dom's own fetch of it succeeds offline. */
const BASE: FinderConfig = { ...CONFIG, assets: { ...CONFIG.assets, css: 'data:text/css,' } };

function setup(config: FinderConfig = BASE) {
  mountConfig(document, config);
  const trigger = document.querySelector<HTMLButtonElement>('button[data-tsc-open]')!;
  const el = document.createElement('true-size-finder') as TrueSizeFinder;
  document.body.append(el);
  return { el, trigger };
}

/** Opens and fires the stylesheet's load, as the browser would. */
async function open(el: TrueSizeFinder, opts?: Parameters<TrueSizeFinder['open']>[0]) {
  const opening = el.open(opts);
  el.shadowRoot?.querySelector('link')?.dispatchEvent(new Event('load'));
  await opening;
}

const $ = (el: TrueSizeFinder, sel: string) => el.shadowRoot?.querySelector<HTMLElement>(sel) ?? null;
const dialog = (el: TrueSizeFinder) => $(el, '[role="dialog"]');
const shown = (el: TrueSizeFinder) => !!dialog(el) && !dialog(el)!.closest('[hidden]');
const tabs = (el: TrueSizeFinder) => [...el.shadowRoot!.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
const key = (target: Element, k: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, composed: true }));
const focusables = (el: TrueSizeFinder) =>
  [...el.shadowRoot!.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')].filter(
    (n) => !n.closest('[hidden]') && !n.hasAttribute('disabled') && n.tagName !== 'LINK',
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.overflow = '';
});
afterEach(() => vi.restoreAllMocks());

describe('<true-size-finder>', () => {
  it('renders a modal dialog in the shadow root and locks page scroll until closed', async () => {
    const { el, trigger } = setup();
    await open(el, { trigger });
    const d = dialog(el)!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(el.shadowRoot!.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Find your perfect size');
    expect(shown(el)).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');

    el.close();
    expect(shown(el)).toBe(false);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('shows the panel only after the stylesheet has loaded or failed', async () => {
    const { el } = setup();
    const opening = el.open();
    expect(shown(el)).toBe(false);
    $(el, 'link')!.dispatchEvent(new Event('error'));
    await opening;
    expect(shown(el)).toBe(true);
    expect($(el, 'link')!.getAttribute('href')).toBe(BASE.assets.css);
  });

  it('focuses the first focusable on open, and Escape returns focus to the trigger', async () => {
    const { el, trigger } = setup();
    trigger.focus();
    await open(el, { trigger });
    expect(el.shadowRoot!.activeElement).toBe(focusables(el)[0]);

    key(el.shadowRoot!.activeElement!, 'Escape');
    expect(shown(el)).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a backdrop click', async () => {
    const { el, trigger } = setup();
    await open(el, { trigger });
    $(el, '.tsc-backdrop')!.click();
    expect(shown(el)).toBe(false);
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    const { el } = setup();
    await open(el);
    const list = focusables(el);
    const first = list[0]!;
    const last = list[list.length - 1]!;
    expect(list.length).toBeGreaterThan(2);

    last.focus();
    key(last, 'Tab');
    expect(el.shadowRoot!.activeElement).toBe(first);

    key(first, 'Tab', true);
    expect(el.shadowRoot!.activeElement).toBe(last);
  });

  it('renders the chrome: header, close, product card, tabs, progress and footer', async () => {
    const { el } = setup();
    await open(el);
    expect($(el, '.tsc-close')?.getAttribute('aria-label')).toBe('Close');
    expect($(el, '.tsc-product')?.textContent).toContain('Dev tee');
    expect($(el, '.tsc-product')?.textContent).toContain('$29.00');
    expect(tabs(el)).toEqual(['Find my size', 'Size chart']);
    expect($(el, '[role="tab"][aria-selected="true"]')?.textContent).toBe('Find my size');
    expect($(el, '.tsc-count')?.textContent).toBe('01 / 03');
    expect($(el, '.tsc-back')!.hidden).toBe(true);
    const primary = $(el, '.tsc-primary')!;
    expect(primary.firstChild?.textContent).toBe('Continue');
    expect(primary.querySelector('[aria-hidden="true"]')?.textContent).toBe('→');
  });

  it('opens on body without a stored profile and walks the steps', async () => {
    const { el } = setup();
    for (const s of ['body', 'shape', 'fit', 'result'] as const) el.registerScreen(s, () => h('div', { 'data-testid': s }));
    await open(el);
    expect($(el, '[data-testid="body"]')).not.toBeNull();

    $(el, '.tsc-primary')!.click();
    expect($(el, '[data-testid="shape"]')).not.toBeNull();
    expect($(el, '.tsc-count')?.textContent).toBe('02 / 03');
    expect($(el, '.tsc-back')!.hidden).toBe(false);

    $(el, '.tsc-primary')!.click();
    expect($(el, '.tsc-count')?.textContent).toBe('03 / 03');
    expect($(el, '.tsc-primary')!.firstChild?.textContent).toBe('Find my size');

    $(el, '.tsc-back')!.click();
    expect($(el, '[data-testid="shape"]')).not.toBeNull();
    $(el, '.tsc-primary')!.click();
    $(el, '.tsc-primary')!.click();
    expect($(el, '[data-testid="result"]')).not.toBeNull();
    expect($(el, '.tsc-progress')!.hidden).toBe(true);
    expect($(el, '.tsc-foot')!.hidden).toBe(true);
  });

  it('renders an empty panel body for a screen with no renderer', async () => {
    const { el } = setup();
    await open(el);
    expect($(el, '[role="tabpanel"]')!.childElementCount).toBe(0);
  });

  it('opens a stored profile on result', async () => {
    const profile = { sex: 'male', heightCm: 180, weightKg: 80, shape: { chest: 0, stomach: 0, hips: 0 }, fitPref: 'regular' };
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, profile, units: { height: 'cm', weight: 'kg' }, sizes: {} }));
    const { el } = setup();
    el.registerScreen('result', () => h('div', { 'data-testid': 'result' }));
    await open(el);
    expect($(el, '[data-testid="result"]')).not.toBeNull();
  });

  it('opens the chart tab on request and switches tabs', async () => {
    const { el } = setup();
    el.registerScreen('body', () => h('div', { 'data-testid': 'body' }));
    await open(el, { tab: 'chart' });
    expect($(el, '[role="tab"][aria-selected="true"]')?.textContent).toBe('Size chart');
    expect($(el, 'table')).not.toBeNull();
    expect($(el, '.tsc-progress')!.hidden).toBe(true);

    const finderTab = [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')][0]!;
    finderTab.click();
    expect($(el, '[data-testid="body"]')).not.toBeNull();
    key(finderTab, 'ArrowRight');
    expect($(el, 'table')).not.toBeNull();
    expect(el.shadowRoot!.activeElement?.textContent).toBe('Size chart');
  });

  it('shows only the size chart when the chart is invalid', async () => {
    const config: FinderConfig = {
      ...BASE,
      chart: { ...BASE.chart, table: { sizes: ['S', 'M', 'L', 'XL'], measurements: { chest: [49, 52] } } },
    };
    const { el } = setup(config);
    await open(el);
    expect(tabs(el)).toEqual(['Size chart']);
    expect($(el, 'table')).not.toBeNull();
    expect($(el, '.tsc-foot')!.hidden).toBe(true);
  });

  it('stays closed and hides the page buttons when the chart has no sizes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config: FinderConfig = { ...BASE, chart: { ...BASE.chart, table: { sizes: [], measurements: {} } } };
    const { el, trigger } = setup(config);
    await open(el, { trigger });
    await open(el, { trigger });
    expect(shown(el)).toBe(false);
    expect(trigger.hidden).toBe(true);
    expect(document.documentElement.style.overflow).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sets the theme vars on the host, with readable text on a light accent', async () => {
    const config: FinderConfig = { ...BASE, settings: { font: 'theme', accent: '#ffff00', radius: 4 } };
    const { el } = setup(config);
    await open(el);
    expect(el.style.getPropertyValue('--tsc-on-accent')).toBe('#000000');
    expect(el.style.getPropertyValue('--tsc-radius')).toBe('4px');
  });
});
