import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '../src/loader';
import { PROFILE_KEY } from '../src/profile-store';
import { mountConfig } from './fixtures/config';

const TAG = 'true-size-finder';

/** boot() listens on the document for good, so every test gets a window of its own. */
let win: Window;
let doc: Document;

const scripts = () => doc.querySelectorAll('script[src*="tsc-finder"]');
const preloads = () => doc.querySelectorAll('link[rel="preload"]');
const button = () => doc.querySelector<HTMLElement>('button[data-tsc-open]')!;
const chartLink = () => doc.querySelector<HTMLElement>('[data-tsc-open="chart"]')!;
const label = () => doc.querySelector('[data-tsc-label]')?.textContent;
const fire = (el: Element, type: string) => el.dispatchEvent(new win.Event(type, { bubbles: true }) as unknown as Event);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const on = () => doc.documentElement.classList.contains('tsc-on');
const run = () => boot(doc, win as unknown as globalThis.Window);

/** Defines a stub finder whose `open` is a mock; returns the mock. */
function defineStub(result: Promise<void> = Promise.resolve()) {
  const open = vi.fn<(opts: unknown) => Promise<void>>(() => result);
  win.customElements.define(
    TAG,
    class extends win.HTMLElement {
      open = open;
    },
  );
  return open;
}

beforeEach(() => {
  win = new Window();
  doc = win.document as unknown as Document;
  mountConfig(doc);
  doc.body.insertAdjacentHTML(
    'beforeend',
    '<a data-tsc-open="chart" data-tsc-default="Size chart"><span data-tsc-label>Size chart</span></a>',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  void win.happyDOM.close();
});

describe('boot', () => {
  it('loads nothing on its own and turns the openers on', () => {
    run();
    expect(scripts()).toHaveLength(0);
    expect(preloads()).toHaveLength(0);
    expect(on()).toBe(true);
  });

  it('does nothing without a config block', () => {
    doc.getElementById('tsc-config')!.remove();
    run();
    fire(button(), 'pointerover');
    fire(button(), 'click');
    expect(scripts()).toHaveLength(0);
    expect(on()).toBe(false);
    expect(button().hasAttribute('aria-busy')).toBe(false);
  });

  it('paints the remembered size for this chart', () => {
    win.localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, sizes: { 'dev-tshirt-unisex': 'L' } }));
    run();
    expect(label()).toBe('Your size: L');
  });

  it('repaints openers re-rendered by the theme on shopify:section:load, from storage as it is now', () => {
    run();
    win.localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, sizes: { 'dev-tshirt-unisex': 'M' } }));
    const section = doc.createElement('div');
    section.innerHTML =
      '<button data-tsc-open data-tsc-default="Find my size" data-tsc-remembered="Your size: {size}"><span data-tsc-label>Find my size</span></button>';
    doc.body.append(section);
    fire(section, 'shopify:section:load');
    expect([...doc.querySelectorAll('button [data-tsc-label]')].map((n) => n.textContent)).toEqual(['Your size: M', 'Your size: M']);
  });

  it('repaints a button the theme adds after boot, and ignores unrelated additions', async () => {
    win.localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, sizes: { 'dev-tshirt-unisex': 'XL' } }));
    run();
    const wrap = doc.createElement('div');
    wrap.innerHTML =
      '<button data-tsc-open data-tsc-default="Find my size" data-tsc-remembered="Your size: {size}"><span data-tsc-label>Find my size</span></button>';
    doc.body.append(wrap);
    await settle();
    expect([...doc.querySelectorAll('button [data-tsc-label]')].map((n) => n.textContent)).toEqual(['Your size: XL', 'Your size: XL']);
  });

  it('keeps the default label when storage throws or holds junk', () => {
    const getItem = vi.spyOn(win.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(run).not.toThrow();
    expect(label()).toBe('Find my size');
    getItem.mockRestore();

    win.localStorage.setItem(PROFILE_KEY, '{not json');
    run();
    expect(label()).toBe('Find my size');
  });

  it('prefetches the stylesheet and script once, on pointerover or focusin', () => {
    run();
    fire(button(), 'pointerover');
    expect(scripts()).toHaveLength(1);
    expect(preloads()).toHaveLength(1);
    expect(scripts()[0]!.getAttribute('src')).toBe('/assets/tsc-finder.js');
    expect(preloads()[0]!.getAttribute('href')).toBe('/assets/tsc-finder.css');
    expect(preloads()[0]!.getAttribute('as')).toBe('style');
    fire(button(), 'pointerover');
    fire(button(), 'focusin');
    expect(scripts()).toHaveLength(1);
    expect(preloads()).toHaveLength(1);
  });

  it('ignores events outside an opener', () => {
    run();
    fire(doc.body, 'pointerover');
    fire(doc.body, 'click');
    expect(scripts()).toHaveLength(0);
  });

  it('marks the trigger busy on click, then clears it and allows a retry when the script fails', () => {
    run();
    fire(button(), 'click');
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(scripts()).toHaveLength(1);

    fire(scripts()[0]!, 'error');
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(scripts()).toHaveLength(0);
    expect(preloads()).toHaveLength(0);

    fire(button(), 'click');
    expect(scripts()).toHaveLength(1);
    expect(button().getAttribute('aria-busy')).toBe('true');
  });
});

describe('boot with the finder defined', () => {
  it('opens the finder tab from a button and clears aria-busy afterwards', async () => {
    const open = defineStub();
    run();
    fire(button(), 'click');
    expect(button().getAttribute('aria-busy')).toBe('true');
    await settle();
    expect(open).toHaveBeenCalledWith({ tab: 'finder', trigger: button() });
    expect(button().hasAttribute('aria-busy')).toBe(false);
  });

  it('opens the chart tab from the chart link', async () => {
    const open = defineStub();
    run();
    fire(chartLink(), 'click');
    await settle();
    expect(open).toHaveBeenCalledWith({ tab: 'chart', trigger: chartLink() });
  });

  it('creates one element and reuses it', async () => {
    const open = defineStub();
    run();
    fire(button(), 'click');
    await settle();
    fire(button(), 'click');
    await settle();
    expect(doc.querySelectorAll(TAG)).toHaveLength(1);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('never opens for a click whose script failed, even once a later hover loads it', async () => {
    run();
    fire(button(), 'click');
    fire(scripts()[0]!, 'error');
    fire(button(), 'pointerover');
    const open = defineStub();
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(button().hasAttribute('aria-busy')).toBe(false);
  });

  it('opens only for the last of two openers clicked while loading, and leaves neither busy', async () => {
    run();
    fire(button(), 'click');
    fire(chartLink(), 'click');
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(chartLink().getAttribute('aria-busy')).toBe('true');
    const open = defineStub();
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ tab: 'chart', trigger: chartLink() });
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(chartLink().hasAttribute('aria-busy')).toBe(false);
  });

  it('warns once and clears aria-busy when open rejects, with no unhandled rejection', async () => {
    defineStub(Promise.reject(new Error('bad chart')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    run();
    fire(button(), 'click');
    await settle();
    await settle();
    process.off('unhandledRejection', unhandled);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
