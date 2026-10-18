import { h } from './dom';

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText(v: number): string;
  onInput(v: number): void;
}

/** Steps per key; Home and End jump to the ends. */
const KEYS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };

/** A hollow circular thumb on a thin track between − and + steppers. `set()` moves it without calling `onInput`. */
export function createSlider(o: SliderOptions): { el: HTMLElement; set(v: number): void } {
  const { min, max, step } = o;
  let value = min;
  let dragging = false;

  const thumb = h('span', {
    class: 'tsc-thumb',
    role: 'slider',
    tabindex: 0,
    'aria-label': o.label,
    'aria-valuemin': min,
    'aria-valuemax': max,
    onkeydown: (e: KeyboardEvent) => {
      const delta = KEYS[e.key];
      const next = e.key === 'Home' ? min : e.key === 'End' ? max : delta === undefined ? null : value + delta * step;
      if (next === null) return;
      e.preventDefault();
      input(next);
    },
  });

  const fromX = (e: PointerEvent) => {
    const { left, width } = track.getBoundingClientRect();
    if (width > 0) input(min + ((e.clientX - left) / width) * (max - min));
  };
  const track = h(
    'div',
    {
      class: 'tsc-track',
      onpointerdown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        track.setPointerCapture(e.pointerId);
        dragging = true;
        thumb.focus();
        fromX(e);
      },
      onpointermove: (e: PointerEvent) => dragging && fromX(e),
      onlostpointercapture: () => (dragging = false),
    },
    thumb,
  );

  const stepper = (dir: 1 | -1, text: string) =>
    h(
      'button',
      // Out of the tab order: the slider itself takes the arrow keys.
      { type: 'button', tabindex: -1, 'aria-label': `${dir > 0 ? 'Increase' : 'Decrease'} ${o.label.toLowerCase()}`, onclick: () => input(value + dir * step) },
      text,
    );

  const set = (v: number) => {
    value = Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));
    thumb.setAttribute('aria-valuenow', String(value));
    thumb.setAttribute('aria-valuetext', o.valueText(value));
    thumb.style.left = `${((value - min) / (max - min)) * 100}%`;
  };
  const input = (v: number) => {
    const before = value;
    set(v);
    if (value !== before) o.onInput(value);
  };
  set(o.value);

  return { el: h('div', { class: 'tsc-slider' }, stepper(-1, '−'), track, stepper(1, '+')), set };
}
