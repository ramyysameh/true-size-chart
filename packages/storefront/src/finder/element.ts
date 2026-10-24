import { ChartError, recommend } from '@true-size-chart/engine';
import { readConfig, toChartInput, type FinderConfig } from '../config';
import { createTracker, type Tracker } from '../events';
import { defaultDraft, toProfile, type Draft } from '../model';
import { loadProfile } from '../profile-store';
import { STRINGS, type Strings } from '../strings';
import { h } from './dom';
import { applyTheme } from './theme';

export type Screen = 'body' | 'shape' | 'fit' | 'result' | 'chart';

export interface FinderContext {
  config: FinderConfig;
  strings: Strings;
  draft: Draft;
  /** Never re-renders; screens patch their own nodes. */
  setDraft(patch: Partial<Draft>): void;
  /** Re-renders the panel body. */
  go(screen: Screen): void;
  close(): void;
  /** One per element: open and complete send at most once per page view. */
  track: Tracker;
}

export type ScreenRenderer = (ctx: FinderContext) => HTMLElement;

/** The three question steps; the shell owns their progress bar and footer. */
const STEPS: readonly Screen[] = ['body', 'shape', 'fit'];
const FOCUSABLE =
  'button:not([disabled]),[href]:not(link),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let warned = false;

interface Ui {
  root: HTMLElement;
  panel: HTMLElement;
  tabs: { finder: HTMLElement | null; chart: HTMLElement };
  segments: HTMLElement[];
  progress: HTMLElement;
  count: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  back: HTMLElement;
  primaryLabel: Text;
}

export class TrueSizeFinder extends HTMLElement {
  /** Renderers every instance falls back to; index.ts registers the built-in screens here. */
  static readonly defaultScreens = new Map<Screen, ScreenRenderer>();

  private readonly renderers = new Map<Screen, ScreenRenderer>();
  private ctx: FinderContext | null = null;
  private ui: Ui | null = null;
  private ready: Promise<void> = Promise.resolve();
  private finderOk = true;
  private isOpen = false;
  private trigger: HTMLElement | null = null;
  private prevOverflow = '';
  private screen: Screen = 'body';
  /** Where the Find my size tab returns to. */
  private lastFinder: Screen = 'body';

  registerScreen(screen: Screen, render: ScreenRenderer): void {
    this.renderers.set(screen, render);
  }

  async open(opts: { tab?: 'finder' | 'chart'; trigger?: HTMLElement | null } = {}): Promise<void> {
    if (this.isOpen) return;
    if (!this.ctx && !this.setup()) return;
    const ui = this.ui!;

    const stored = loadProfile();
    this.lastFinder = stored ? 'result' : 'body';
    const trigger = opts.trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    // Render before locking anything, so a throwing screen leaves the page as it was and a later open() retries.
    this.go(opts.tab === 'chart' ? 'chart' : this.lastFinder);
    this.ctx!.track.open();
    this.isOpen = true;
    this.trigger = trigger;
    this.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    // On the document, not the shadow root: a click on plain text drops focus to <body>, and Escape and Tab must still work.
    document.addEventListener('keydown', this.onKey);

    await this.ready;
    if (!this.isOpen) return;
    ui.root.hidden = false;
    // The admin preview reopens on every edit; taking focus there would pull the merchant out of the field they are typing in.
    if (!this.ctx!.config.preview) this.focusables()[0]?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.ui!.root.hidden = true;
    document.removeEventListener('keydown', this.onKey);
    // documentElement is null while a document is being torn down.
    const html = document.documentElement as HTMLElement | null;
    if (html) html.style.overflow = this.prevOverflow;
    const trigger = this.trigger;
    this.trigger = null;
    if (trigger?.isConnected) trigger.focus();
  }

  disconnectedCallback(): void {
    this.close();
  }

  /** Reads the config and builds the shadow DOM once; false when there is nothing to show. */
  private setup(): boolean {
    const config = readConfig(document);
    if (!config) return this.disable('no #tsc-config on the page');
    this.finderOk = true;
    try {
      // A dry run, not just normalizeChart: a valid chart can still have no dimension the category is scored on.
      recommend(toProfile(defaultDraft(config, null)), toChartInput(config.chart));
    } catch (error) {
      if (!(error instanceof ChartError)) throw error;
      // The engine cannot use this chart: the size chart tab only.
      this.finderOk = false;
      if (!config.chart.table.sizes?.length) return this.disable('the size chart has no sizes');
    }

    // Session-replay tools record open shadow roots, which would capture height and weight.
    this.setAttribute('data-clarity-mask', 'true');
    this.setAttribute('data-hj-suppress', '');
    this.classList.add('ph-no-capture', 'lo-ignore');

    const strings: Strings = { ...STRINGS, ...config.strings };
    const ctx: FinderContext = {
      config,
      strings,
      draft: defaultDraft(config, loadProfile()),
      setDraft: (patch) => {
        ctx.draft = { ...ctx.draft, ...patch };
      },
      go: (screen) => this.go(screen),
      close: () => this.close(),
      track: createTracker(config),
    };
    applyTheme(this, config.settings);
    this.ui = this.build(config, strings);
    // Last, so a build that throws is retried on the next open().
    this.ctx = ctx;
    return true;
  }

  private disable(reason: string): false {
    for (const opener of document.querySelectorAll<HTMLElement>('[data-tsc-open]')) opener.hidden = true;
    if (!warned) {
      warned = true;
      console.warn(`[true-size-chart] ${reason}; the size finder is disabled.`);
    }
    return false;
  }

  private build(config: FinderConfig, s: Strings): Ui {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.textContent = '';
    const link = h('link', { rel: 'stylesheet', href: config.assets.css });
    // A stylesheet that fails to load must never block the finder.
    this.ready = new Promise((resolve) => {
      link.addEventListener('load', () => resolve(), { once: true });
      link.addEventListener('error', () => resolve(), { once: true });
    });

    const tab = (id: 'finder' | 'chart', label: string) =>
      h('button', { type: 'button', role: 'tab', class: 'tsc-label', id: `tsc-tab-${id}`, 'aria-controls': 'tsc-tabpanel', onclick: () => this.go(id === 'chart' ? 'chart' : this.lastFinder) }, label);
    const tabs = { finder: this.finderOk ? tab('finder', s.tabFinder) : null, chart: tab('chart', s.tabChart) };

    const { product } = config;
    const segments = STEPS.map(() => h('i'));
    const count = h('span', { class: 'tsc-count tsc-label' });
    const progress = h('div', { class: 'tsc-progress' }, ...segments, count);
    const body = h('div', { class: 'tsc-body', role: 'tabpanel', id: 'tsc-tabpanel' });
    const back = h('button', { type: 'button', class: 'tsc-back', 'aria-label': s.back, onclick: () => this.step(-1) }, '←');
    const primaryLabel = document.createTextNode('');
    const primary = h('button', { type: 'button', class: 'tsc-primary', onclick: () => this.step(1) }, primaryLabel, h('span', { 'aria-hidden': 'true' }, '→'));
    const foot = h('div', { class: 'tsc-foot' }, back, primary);

    const panel = h(
      'div',
      // tabindex -1: a click on non-focusable content keeps focus in the dialog.
      { class: 'tsc-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tsc-title', tabindex: '-1' },
      h(
        'div',
        { class: 'tsc-head' },
        h('h2', { id: 'tsc-title', class: 'tsc-label' }, s.header),
        h('button', { type: 'button', class: 'tsc-close', 'aria-label': s.close, onclick: () => this.close() }, '×'),
      ),
      h(
        'div',
        { class: 'tsc-product' },
        product.image ? h('img', { src: product.image, alt: '', width: 48, height: 60 }) : null,
        h('div', null, h('p', { class: 'tsc-label' }, product.title), h('p', null, product.price)),
      ),
      h('div', { class: 'tsc-tabs', role: 'tablist', onkeydown: (e: KeyboardEvent) => this.onTabKey(e) }, tabs.finder, tabs.chart),
      progress,
      body,
      foot,
    );
    const root = h(
      'div',
      { class: 'tsc-root', hidden: true },
      h('div', { class: 'tsc-backdrop', onclick: () => this.close() }),
      panel,
    );
    shadow.append(link, root);
    return { root, panel, tabs, segments, progress, count, body, foot, back, primaryLabel };
  }

  private go(screen: Screen): void {
    const ui = this.ui;
    if (!ui || !this.ctx) return;
    if (!this.finderOk) screen = 'chart';
    const hadFocus = this.shadowRoot!.activeElement !== null;
    this.screen = screen;
    if (screen !== 'chart') this.lastFinder = screen;

    const chart = screen === 'chart';
    for (const [t, selected] of [[ui.tabs.finder, !chart], [ui.tabs.chart, chart]] as const) {
      if (!t) continue;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
    }
    ui.body.setAttribute('aria-labelledby', chart ? 'tsc-tab-chart' : 'tsc-tab-finder');

    const step = STEPS.indexOf(screen);
    ui.progress.hidden = ui.foot.hidden = step < 0;
    ui.back.hidden = step < 1;
    ui.segments.forEach((seg, i) => seg.toggleAttribute('data-on', i <= step));
    ui.count.textContent = `0${step + 1} / 0${STEPS.length}`;
    ui.primaryLabel.data = step === STEPS.length - 1 ? this.ctx.strings.findMySize : this.ctx.strings.continue;

    const render = this.renderers.get(screen) ?? TrueSizeFinder.defaultScreens.get(screen);
    ui.body.textContent = '';
    const node = render?.(this.ctx);
    // The renderer went elsewhere (ctx.go) while rendering: that screen is already painted.
    if (this.screen !== screen) return;
    if (node) ui.body.append(node);
    ui.body.scrollTop = 0;

    // A control that vanished with the old screen (e.g. Back on step 2) must not drop focus out of the dialog.
    const active = this.shadowRoot!.activeElement;
    if (hadFocus && (active === null || active.closest('[hidden]'))) {
      (this.focusables(ui.body)[0] ?? this.focusables()[0])?.focus();
    }
  }

  /** Back / Continue / Find my size on the three steps. */
  private step(delta: 1 | -1): void {
    const i = STEPS.indexOf(this.screen);
    if (i < 0) return;
    this.go(STEPS[i + delta] ?? (delta > 0 ? 'result' : 'body'));
  }

  private focusables(within: HTMLElement = this.ui!.panel): HTMLElement[] {
    return [...within.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]'));
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = this.focusables();
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const active = this.shadowRoot!.activeElement as HTMLElement | null;
    const outside = active === null || !list.includes(active);
    if (e.shiftKey ? outside || active === first : outside || active === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  /** Arrow keys move between the tabs (automatic activation). */
  private onTabKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const { finder, chart } = this.ui!.tabs;
    if (!finder) return;
    e.preventDefault();
    const next = this.screen === 'chart' ? finder : chart;
    next.click();
    next.focus();
  }
}
