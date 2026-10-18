import { normalizeChart } from '@true-size-chart/engine';
import { readConfig, toChartInput, type FinderConfig } from '../config';
import { defaultDraft, type Draft } from '../model';
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
    this.isOpen = true;
    this.trigger = opts.trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    this.go(opts.tab === 'chart' ? 'chart' : this.lastFinder);

    await this.ready;
    if (!this.isOpen) return;
    ui.root.hidden = false;
    this.focusables()[0]?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.ui!.root.hidden = true;
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
    try {
      normalizeChart(toChartInput(config.chart));
    } catch {
      // ChartError (or a config too malformed to reach the engine): the size chart tab only.
      this.finderOk = false;
      if (!config.chart?.table?.sizes?.length) return this.disable('the size chart has no sizes');
    }

    const strings: Strings = { ...STRINGS, ...config.strings };
    this.ctx = {
      config,
      strings,
      draft: defaultDraft(config, loadProfile()),
      setDraft: (patch) => {
        this.ctx!.draft = { ...this.ctx!.draft, ...patch };
      },
      go: (screen) => this.go(screen),
      close: () => this.close(),
    };
    applyTheme(this, config.settings);
    this.ui = this.build(config, strings);
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
    const shadow = this.attachShadow({ mode: 'open' });
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
      { class: 'tsc-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tsc-title' },
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
      { class: 'tsc-root', hidden: true, onkeydown: (e: KeyboardEvent) => this.onKey(e) },
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
    if (render) ui.body.append(render(this.ctx));
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

  private onKey(e: KeyboardEvent): void {
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
  }

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
