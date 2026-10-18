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

export function boot(doc: Document, win: Window): void {
  let config: FinderConfig;
  try {
    config = JSON.parse(doc.getElementById('tsc-config')!.textContent!);
  } catch {
    return;
  }
  for (const el of doc.querySelectorAll(OPENER)) el.removeAttribute('data-tsc-pending');

  let size: string | undefined;
  try {
    size = JSON.parse(win.localStorage.getItem(PROFILE_KEY)!).sizes[config.chart.key];
  } catch {
    /* no storage, no profile or a different shape: keep the default label */
  }
  paintRemembered(doc, size);

  const add = (tag: string, props: object) => doc.head.appendChild(Object.assign(doc.createElement(tag), props));
  let loading = false;
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
        },
      });
    }
    if (e.type != 'click') return;

    (busy = btn).setAttribute(BUSY, 'true');
    try {
      await win.customElements.whenDefined(TAG);
      const finder = (doc.querySelector(TAG) ?? doc.body.appendChild(doc.createElement(TAG))) as Finder;
      await finder.open({ tab: btn.dataset.tscOpen == 'chart' ? 'chart' : 'finder', trigger: btn });
    } catch {
      console.warn('TSC: open failed');
    }
    btn.removeAttribute(BUSY);
  };

  for (const type of ['pointerover', 'focusin', 'click']) doc.addEventListener(type, handle);
}
