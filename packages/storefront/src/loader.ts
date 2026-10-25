/**
 * Inline loader: the only storefront code that runs before the shopper shows intent.
 * Every byte ships in the page (budget in scripts/size-budget.mjs), so keep it terse and free of engine imports.
 */
import type { FinderConfig } from './config';
import { PROFILE_KEY } from './profile-store';
import { paintRemembered } from './remembered';

interface Finder extends HTMLElement {
  open(opts: { tab: 'finder' | 'chart'; trigger: HTMLElement }): Promise<void>;
}

const TAG = 'true-size-finder';
const OPENER = '[data-tsc-open]';
const BUSY = 'aria-busy';

export function boot(doc: Document, win: Window & typeof globalThis): void {
  let config: FinderConfig;
  try {
    config = JSON.parse(doc.getElementById('tsc-config')!.textContent!);
  } catch {
    return;
  }
  // The block hides openers until this class is on <html>, so buttons the theme re-renders later show too.
  doc.documentElement.classList.add('tsc-on');

  const paint = () => {
    let size: string | undefined;
    try {
      size = JSON.parse(win.localStorage.getItem(PROFILE_KEY)!).sizes[config.chart.key];
    } catch {
      /* no storage, no profile or a different shape: keep the default label */
    }
    paintRemembered(doc, size);
  };
  paint();
  // The theme editor (and some themes on variant change) re-render the section with the default label.
  doc.addEventListener('shopify:section:load', paint);
  // Section Rendering API re-renders (e.g. a variant change) replace the button with its default label.
  new win.MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => (n as Element).matches?.(OPENER) || (n as Element).querySelector?.(OPENER)))) paint();
  }).observe(doc.body, { childList: true, subtree: true });

  const add = (tag: string, props: object) => doc.head.appendChild(Object.assign(doc.createElement(tag), props));
  let loading = false;
  /** The trigger of the click waiting for the script; only it may open the finder. */
  let busy: Element | undefined;

  const handle = async (e: Event) => {
    const btn = (e.target as Element).closest<HTMLElement>(OPENER);
    if (!btn) return;

    if (!loading) {
      loading = true;
      const link = add('link', { rel: 'preload', as: 'style', href: config.assets.css });
      const script = add('script', {
        async: true,
        src: config.assets.js,
        onerror() {
          link.remove();
          script.remove();
          loading = false;
          busy?.removeAttribute(BUSY);
          busy = undefined;
        },
      });
    }
    if (e.type != 'click') return;

    busy?.removeAttribute(BUSY);
    (busy = btn).setAttribute(BUSY, 'true');
    try {
      await win.customElements.whenDefined(TAG);
      // A later click took over, or this load failed and a later one succeeded: not this click's drawer.
      if (busy != btn) return;
      const finder = (doc.querySelector(TAG) ?? doc.body.appendChild(doc.createElement(TAG))) as Finder;
      await finder.open({ tab: btn.dataset.tscOpen == 'chart' ? 'chart' : 'finder', trigger: btn });
    } catch {
      console.warn('TSC: open failed');
    }
    if (busy == btn) busy = undefined;
    btn.removeAttribute(BUSY);
  };

  for (const type of ['pointerover', 'focusin', 'click']) doc.addEventListener(type, handle);
}
