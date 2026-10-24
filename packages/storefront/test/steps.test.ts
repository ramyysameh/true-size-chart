import { ftInToCm, type ShapeStep } from '@true-size-chart/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toChartInput, type FinderConfig } from '../src/config';
import { createTracker } from '../src/events';
import type { FinderContext, ScreenRenderer, TrueSizeFinder } from '../src/finder/element';
import { renderBody } from '../src/finder/screens/body';
import { renderFit } from '../src/finder/screens/fit';
import { renderShape } from '../src/finder/screens/shape';
import '../src/index';
import { defaultDraft, liveEstimate, type Draft } from '../src/model';
import { STRINGS } from '../src/strings';
import { CONFIG, mountConfig } from './fixtures/config';

const CHART = toChartInput(CONFIG.chart);

/** Renders one screen into the document with a context that merges drafts like the shell does. */
function mount(render: ScreenRenderer, patch: Partial<Draft> = {}) {
  const ctx: FinderContext = {
    config: CONFIG,
    strings: { ...STRINGS },
    draft: { ...defaultDraft(CONFIG, null, 'en-GB'), sex: 'male', heightCm: 180, weightKg: 89, ...patch },
    setDraft(p) {
      ctx.draft = { ...ctx.draft, ...p };
    },
    go: vi.fn(),
    close() {},
    track: createTracker(CONFIG),
  };
  const root = render(ctx);
  document.body.replaceChildren(root);
  return { ctx, root };
}

const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const byText = (root: ParentNode, sel: string, text: string) =>
  [...root.querySelectorAll<HTMLElement>(sel)].find((n) => n.textContent === text)!;
const slider = (root: ParentNode, label: string) => root.querySelector<HTMLElement>(`[role="slider"][aria-label="${label}"]`)!;
const measure = (root: ParentNode, label: string) => slider(root, label).closest<HTMLElement>('.tsc-measure')!;
const shown = (root: ParentNode, label: string) => measure(root, label).querySelector('.tsc-val')!.textContent;

beforeEach(() => localStorage.clear());

describe('step 1: body', () => {
  it('shows the title, the sizing toggle and the privacy line', () => {
    const { root } = mount(renderBody);
    expect(root.querySelector('h3')?.textContent).toBe("Let's find your fit");
    expect(byText(root, 'button', 'Male').getAttribute('aria-pressed')).toBe('true');
    expect(byText(root, 'button', 'Female').getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('.tsc-privacy')?.textContent).toBe(STRINGS.privacy);
    expect(root.querySelector('.tsc-privacy svg')).not.toBeNull();
    expect(shown(root, 'Height')).toBe('180 cm');
    expect(shown(root, 'Weight')).toBe('89 kg');
  });

  it('updates the live estimate on every input, without re-rendering', () => {
    const { ctx, root } = mount(renderBody);
    const height = slider(root, 'Height');
    height.focus();
    for (let i = 0; i < 5; i++) key(height, 'ArrowRight');

    expect(ctx.draft.heightCm).toBe(185);
    const expected = liveEstimate({ ...ctx.draft, heightCm: 185 }, CHART);
    expect(expected).not.toBeNull();
    expect(root.querySelector('.tsc-est')?.textContent).toBe(expected);
    expect(document.activeElement).toBe(height);
    expect(height.isConnected).toBe(true);
    expect(shown(root, 'Height')).toBe('185 cm');
  });

  it('switches sex and re-estimates', () => {
    const { ctx, root } = mount(renderBody);
    byText(root, 'button', 'Female').click();
    expect(ctx.draft.sex).toBe('female');
    expect(byText(root, 'button', 'Female').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.tsc-est')?.textContent).toBe(liveEstimate(ctx.draft, CHART));
  });

  it('scales the silhouette with height and BMI', () => {
    const { root } = mount(renderBody);
    const sx = Math.min(1.3, Math.max(0.8, Math.sqrt(89 / 1.8 ** 2 / 22)));
    const figure = root.querySelector('.tsc-fig g')!;
    expect(figure.getAttribute('transform')).toContain(`scale(${sx.toFixed(3)} ${(180 / 210).toFixed(3)})`);
    expect(root.querySelector('.tsc-fig line')?.getAttribute('y1')).toBe('30');
  });

  it('moves in whole inches in ft/in and keeps the draft in cm', () => {
    const { ctx, root } = mount(renderBody);
    byText(measure(root, 'Height'), 'button', 'ft/in').click();
    expect(ctx.draft.units.height).toBe('ftin');
    expect(shown(root, 'Height')).toBe('5 ft 11 in');
    expect(slider(root, 'Height').getAttribute('aria-valuetext')).toBe('5 ft 11 in');

    key(slider(root, 'Height'), 'ArrowRight');
    expect(ctx.draft.heightCm).toBe(ftInToCm(6, 0));
    expect(shown(root, 'Height')).toBe('6 ft 0 in');

    byText(measure(root, 'Height'), 'button', 'cm').click();
    expect(ctx.draft.units.height).toBe('cm');
    expect(slider(root, 'Height').getAttribute('aria-valuenow')).toBe('183');
    expect(shown(root, 'Height')).toBe('183 cm');
  });

  it('keeps the weight when switching to lbs and back', () => {
    const { ctx, root } = mount(renderBody);
    byText(measure(root, 'Weight'), 'button', 'lbs').click();
    expect(ctx.draft.units.weight).toBe('lbs');
    expect(shown(root, 'Weight')).toBe('196 lbs');

    key(slider(root, 'Weight'), 'ArrowRight');
    key(slider(root, 'Weight'), 'ArrowLeft');
    byText(measure(root, 'Weight'), 'button', 'kg').click();
    expect(Math.abs(ctx.draft.weightKg - 89)).toBeLessThanOrEqual(0.5);
    expect(shown(root, 'Weight')).toBe('89 kg');
  });
});

describe('step 2: shape', () => {
  const group = (root: ParentNode, label: string) => {
    const id = byText(root, 'p', label).id;
    return root.querySelector<HTMLElement>(`[role="radiogroup"][aria-labelledby="${id}"]`)!;
  };
  const checked = (g: HTMLElement) => g.querySelector('[aria-checked="true"]')?.textContent;

  it('renders three radiogroups of three icon tiles, all Average', () => {
    const { root } = mount(renderShape);
    const groups = root.querySelectorAll('[role="radiogroup"]');
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      expect(g.querySelectorAll('[role="radio"]')).toHaveLength(3);
      expect(g.querySelectorAll('[role="radio"] svg')).toHaveLength(3);
      expect(checked(g as HTMLElement)).toBe('Average');
    }
    expect([...group(root, 'Hips').querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual(['Narrower', 'Average', 'Fuller']);
  });

  it('moves the selection with the arrow keys and roves the tab stop', () => {
    const { ctx, root } = mount(renderShape);
    const chest = group(root, 'Chest');
    const average = byText(chest, '[role="radio"]', 'Average');
    average.focus();
    key(average, 'ArrowRight');
    expect(checked(chest)).toBe('Broader');
    expect(ctx.draft.shape.chest).toBe(1);
    const broader = byText(chest, '[role="radio"]', 'Broader');
    expect(document.activeElement).toBe(broader);
    expect(broader.tabIndex).toBe(0);
    expect(average.tabIndex).toBe(-1);

    key(broader, 'ArrowRight');
    expect(checked(chest)).toBe('Slimmer');
    expect(ctx.draft.shape.chest).toBe(-1);
    key(document.activeElement!, 'ArrowUp');
    expect(ctx.draft.shape.chest).toBe(1);
    expect(ctx.draft.shape.stomach).toBe(0);
  });

  it('selects on click and shows the stored shape', () => {
    const shape = { chest: 0, stomach: 1, hips: -1 } satisfies Record<string, ShapeStep>;
    const { ctx, root } = mount(renderShape, { shape });
    expect(checked(group(root, 'Stomach'))).toBe('Rounder');
    expect(checked(group(root, 'Hips'))).toBe('Narrower');
    byText(group(root, 'Hips'), '[role="radio"]', 'Fuller').click();
    expect(ctx.draft.shape).toEqual({ chest: 0, stomach: 1, hips: 1 });
  });
});

describe('step 3: fit', () => {
  it('lists slim, regular and relaxed with descriptions, defaulting to regular', () => {
    const { root } = mount(renderFit);
    const group = root.querySelector('[role="radiogroup"]')!;
    expect(root.querySelector(`#${group.getAttribute('aria-labelledby')}`)?.textContent).toBe('How do you like it to fit?');
    const rows = [...group.querySelectorAll('[role="radio"]')];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('Slim');
    expect(rows[0]!.textContent).toContain(STRINGS.slimDesc);
    expect(rows.every((r) => r.querySelector('svg') && r.querySelector('.tsc-dot'))).toBe(true);
    expect(rows[1]!.getAttribute('aria-checked')).toBe('true');
  });

  it('stores the choice', () => {
    const { ctx, root } = mount(renderFit);
    const relaxed = root.querySelectorAll<HTMLElement>('[role="radio"]')[2]!;
    relaxed.click();
    expect(relaxed.getAttribute('aria-checked')).toBe('true');
    expect(ctx.draft.fitPref).toBe('relaxed');
  });
});

describe('the steps in the finder', () => {
  const BASE: FinderConfig = { ...CONFIG, assets: { ...CONFIG.assets, css: 'data:text/css,' } };

  async function open() {
    mountConfig(document, BASE);
    const el = document.createElement('true-size-finder') as TrueSizeFinder;
    document.body.append(el);
    const result = vi.fn((_ctx: FinderContext) => document.createElement('div'));
    el.registerScreen('result', result);
    const opening = el.open();
    el.shadowRoot!.querySelector('link')!.dispatchEvent(new Event('load'));
    await opening;
    return { el, root: el.shadowRoot!, result };
  }
  const count = (root: ShadowRoot) => root.querySelector('.tsc-count')?.textContent;
  const primary = (root: ShadowRoot) => root.querySelector<HTMLElement>('.tsc-primary')!;

  it('walks body → shape → fit → result through the footer, keeping the draft', async () => {
    const { root, result } = await open();
    expect(count(root)).toBe('01 / 03');
    expect(root.querySelector('.tsc-back')!.closest('[hidden]')).not.toBeNull();
    key(slider(root, 'Height'), 'ArrowRight');
    const height = slider(root, 'Height').getAttribute('aria-valuenow');

    primary(root).click();
    expect(count(root)).toBe('02 / 03');
    expect(root.querySelectorAll('[role="radiogroup"]')).toHaveLength(3);
    byText(root, '[role="radio"]', 'Broader').click();

    root.querySelector<HTMLElement>('.tsc-back')!.click();
    expect(count(root)).toBe('01 / 03');
    expect(slider(root, 'Height').getAttribute('aria-valuenow')).toBe(height);

    primary(root).click();
    expect(byText(root, '[role="radio"]', 'Broader').getAttribute('aria-checked')).toBe('true');
    primary(root).click();
    expect(count(root)).toBe('03 / 03');
    expect(primary(root).firstChild?.textContent).toBe('Find my size');

    byText(root, '[role="radio"] .tsc-label', 'Relaxed').closest<HTMLElement>('[role="radio"]')!.click();
    primary(root).click();
    expect(result).toHaveBeenCalledTimes(1);
    const ctx = result.mock.calls[0]![0];
    expect(ctx.draft.fitPref).toBe('relaxed');
    expect(ctx.draft.shape.chest).toBe(1);
  });
});
