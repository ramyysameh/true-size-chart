import { ChartError, ProfileError, fitMatchFromError, type Recommendation } from '@true-size-chart/engine';
import { addToCart } from '../../cart';
import { toChartInput } from '../../config';
import { resultCopy } from '../../copy';
import { defaultDraft, finalRecommendation, toProfile } from '../../model';
import { clearProfile, saveProfile } from '../../profile-store';
import { paintRemembered } from '../../remembered';
import { fmt, type Strings } from '../../strings';
import { currentVariantId, inStockPick, isOffered } from '../../variants';
import { h } from '../dom';
import type { FinderContext, ScreenRenderer } from '../element';
import { svg } from '../icons';

const COUNT_MS = 600;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `Add {size} to bag` with the size in bold. */
function ctaLabel(size: string, s: Strings): (Node | string)[] {
  return s.addToBag.split('{size}').flatMap((part, i) => (i ? [h('b', null, size), part] : [part]));
}

/** The result: best-match ring, size switcher, fit breakdown, fit note and add to bag. */
export const renderResult: ScreenRenderer = (ctx) => {
  const { config, strings: s, draft } = ctx;
  let rec: Recommendation;
  try {
    rec = finalRecommendation(draft, toChartInput(config.chart), config.chart.audience);
  } catch (error) {
    // No size the engine can score: the size chart. A profile it rejects: forget it and ask again.
    if (error instanceof ChartError) ctx.go('chart');
    else if (error instanceof ProfileError) {
      clearProfile();
      ctx.go('body');
    } else throw error;
    return h('div');
  }
  saveProfile(toProfile(draft), draft.units, config.chart.key, rec.size);
  paintRemembered(document, rec.size);

  const sizes = config.chart.table.sizes;
  const copy = resultCopy(rec, sizes, draft.fitPref, s);
  let shown = rec.size;
  let raf = 0;

  const arc = svg('circle', { class: 'tsc-arc', cx: 60, cy: 60, r: 57, pathLength: 100, transform: 'rotate(-90 60 60)' });
  const ringSize = h('span', { class: 'tsc-num' });
  const pct = h('p', { class: 'tsc-label tsc-pct' });
  const conf = h('p', { class: 'tsc-mute tsc-conf' }, copy.confidence);
  const breakdown = h('div', { class: 'tsc-breakdown' });
  const ctaBox = h('div', { class: 'tsc-cta' });

  /** Ring and % at `n` (0-100). */
  const paintFit = (n: number) => {
    arc.setAttribute('stroke-dasharray', `${n} 100`);
    pct.textContent = fmt(s.fitMatch, { n: Math.round(n) });
  };
  const showFit = (fit: number | null, animate: boolean) => {
    cancelAnimationFrame(raf);
    pct.hidden = fit === null;
    if (fit === null) {
      arc.setAttribute('stroke-dasharray', '0 100');
      pct.textContent = '';
      return;
    }
    if (!animate || reducedMotion()) return paintFit(fit);
    paintFit(0);
    let start: number | null = null;
    const tick = (t: number) => {
      start ??= t;
      const k = Math.min(1, (t - start) / COUNT_MS);
      paintFit(fit * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const sizeButtons = sizes.map((size) =>
    h(
      'button',
      { type: 'button', onclick: () => select(size) },
      size === rec.size ? h('span', { class: 'tsc-you tsc-label' }, s.you) : null,
      h('span', { class: 'tsc-size' }, size),
    ),
  );

  const paintBreakdown = (areas: Recommendation['areas'], judged: boolean) => {
    if (!judged) return breakdown.replaceChildren(h('p', { class: 'tsc-mute' }, s.noData));
    breakdown.replaceChildren(
      h('div', { class: 'tsc-scale tsc-label', 'aria-hidden': 'true' }, h('span', null, s.snug), h('span', null, s.ideal), h('span', null, s.roomy)),
      ...areas.map((a) => {
        const dot = h('i', { class: 'tsc-pin' });
        dot.style.left = `${+((a.position + 1) * 50).toFixed(2)}%`;
        return h(
          'div',
          { class: 'tsc-area', role: 'img', 'aria-label': `${s[a.dim]}: ${s[a.label]}` },
          h('span', { class: 'tsc-label', 'aria-hidden': 'true' }, s[a.dim]),
          h('span', { class: 'tsc-line' }, dot),
        );
      }),
    );
  };

  // No size option, or one whose labels match none of the chart's sizes: the shopper picks on the page.
  const sizeMatched = sizes.some((size) => isOffered(config, size));

  const paintCta = () => {
    const mute = (t: string) => ctaBox.replaceChildren(h('p', { class: 'tsc-mute' }, t));
    if (!sizeMatched) return mute(fmt(s.noSizeOption, { size: shown }));
    const offered = isOffered(config, shown);
    const pick = inStockPick(rec, shown, config, currentVariantId(document, config));
    if (!pick && !offered) return mute(fmt(s.notOffered, { size: shown }));
    if (!pick) return ctaBox.replaceChildren(h('button', { type: 'button', class: 'tsc-primary', disabled: true }, s.soldOut));

    let busy = false;
    const statusEl = h('p', { class: 'tsc-status', role: 'status' });
    const button = h('button', { type: 'button', class: 'tsc-primary' }, ...ctaLabel(pick.size, s));
    button.addEventListener('click', async () => {
      if (busy) return;
      // Re-read the variant: the shopper may have changed colour on the page since this rendered.
      const now = inStockPick(rec, shown, config, currentVariantId(document, config));
      if (!now || now.size !== pick.size) return paintCta();
      if (config.preview) {
        statusEl.textContent = s.previewAdded;
        return;
      }
      busy = true;
      // A size tapped mid-add would repaint the CTA and lose the confirmation.
      sizeButtons.forEach((b) => b.toggleAttribute('disabled', true));
      button.setAttribute('aria-busy', 'true');
      button.textContent = s.adding;
      const result = await addToCart(config, now.variant.id, document);
      sizeButtons.forEach((b) => b.removeAttribute('disabled'));
      if (result.ok) {
        const link = h('a', { href: config.routes.cart, class: 'tsc-label' }, s.viewBag);
        button.remove();
        statusEl.textContent = s.added;
        statusEl.after(link);
        link.focus();
      } else {
        busy = false;
        button.removeAttribute('aria-busy');
        button.replaceChildren(...ctaLabel(pick.size, s));
        statusEl.textContent = result.message ?? s.addError;
      }
    });
    const note = pick.substituted
      ? [h('p', { class: 'tsc-mute tsc-sub-note' }, fmt(offered ? s.substituted : s.notOfferedAlt, { size: shown, alt: pick.size }))]
      : [];
    ctaBox.replaceChildren(...note, button, statusEl);
  };

  const select = (size: string, animate = false) => {
    shown = size;
    sizeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(sizes[i] === size)));
    const score = rec.scores.find((sc) => sc.size === size);
    const fit = score ? fitMatchFromError(score.error) : null;
    ringSize.textContent = size;
    conf.hidden = size !== rec.size;
    showFit(fit, animate);
    paintBreakdown(score?.areas ?? [], fit !== null);
    paintCta();
  };
  select(rec.size, true);

  return h(
    'div',
    { class: 'tsc-step tsc-result' },
    h('p', { class: 'tsc-label' }, s.bestMatch),
    h('div', { class: 'tsc-ring' }, svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' }, svg('circle', { cx: 60, cy: 60, r: 57 }), arc), ringSize),
    pct,
    conf,
    h('div', { class: 'tsc-sizes' }, ...sizeButtons),
    h('p', { class: 'tsc-mute tsc-hint' }, s.tapHint),
    breakdown,
    h('div', { class: 'tsc-note' }, h('p', { class: 'tsc-label' }, s.fitNoteTitle), h('p', null, copy.fitNote)),
    h('p', { class: 'tsc-mute tsc-disc' }, s.disclaimer),
    ctaBox,
    h(
      'div',
      { class: 'tsc-links' },
      h('button', { type: 'button', onclick: () => ctx.go('body') }, s.editDetails),
      h('button', { type: 'button', onclick: () => clearAndRestart(ctx) }, s.clearData),
    ),
  );
};

function clearAndRestart(ctx: FinderContext): void {
  clearProfile();
  paintRemembered(document, null);
  ctx.setDraft(defaultDraft(ctx.config, null));
  ctx.go('body');
}
