import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlider, type SliderOptions } from '../src/finder/slider';

function make(o: Partial<SliderOptions> = {}) {
  const onInput = vi.fn();
  const slider = createSlider({
    label: 'Height',
    min: 140,
    max: 210,
    step: 1,
    value: 180,
    valueText: (v) => `${v} cm`,
    onInput,
    ...o,
  });
  document.body.replaceChildren(slider.el);
  const thumb = slider.el.querySelector<HTMLElement>('[role="slider"]')!;
  return { slider, thumb, onInput };
}

const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const now = (thumb: HTMLElement) => thumb.getAttribute('aria-valuenow');
const button = (el: HTMLElement, label: string) => el.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;

afterEach(() => document.body.replaceChildren());

describe('createSlider', () => {
  it('exposes the slider to assistive tech', () => {
    const { thumb } = make();
    expect(thumb.getAttribute('tabindex')).toBe('0');
    expect(thumb.getAttribute('aria-label')).toBe('Height');
    expect(thumb.getAttribute('aria-valuemin')).toBe('140');
    expect(thumb.getAttribute('aria-valuemax')).toBe('210');
    expect(now(thumb)).toBe('180');
    expect(thumb.getAttribute('aria-valuetext')).toBe('180 cm');
  });

  it('moves by step, ten steps and to the ends with the keyboard, clamped to min and max', () => {
    const { thumb, onInput } = make();
    key(thumb, 'ArrowRight');
    expect(now(thumb)).toBe('181');
    expect(onInput).toHaveBeenLastCalledWith(181);
    expect(thumb.getAttribute('aria-valuetext')).toBe('181 cm');

    key(thumb, 'PageDown');
    expect(now(thumb)).toBe('171');
    key(thumb, 'ArrowUp');
    key(thumb, 'ArrowDown');
    key(thumb, 'ArrowLeft');
    expect(now(thumb)).toBe('170');
    key(thumb, 'PageUp');
    expect(now(thumb)).toBe('180');

    key(thumb, 'End');
    expect(now(thumb)).toBe('210');
    key(thumb, 'Home');
    expect(now(thumb)).toBe('140');
    expect(onInput).toHaveBeenLastCalledWith(140);

    key(thumb, 'End');
    onInput.mockClear();
    key(thumb, 'ArrowRight');
    expect(now(thumb)).toBe('210');
    expect(onInput).not.toHaveBeenCalled();
  });

  it('prevents the page from scrolling on handled keys only', () => {
    const { thumb } = make();
    const handled = new KeyboardEvent('keydown', { key: 'PageUp', cancelable: true });
    const other = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    thumb.dispatchEvent(handled);
    thumb.dispatchEvent(other);
    expect(handled.defaultPrevented).toBe(true);
    expect(other.defaultPrevented).toBe(false);
  });

  it('steps with the − and + buttons', () => {
    const { slider, thumb, onInput } = make();
    button(slider.el, 'Increase height').click();
    expect(now(thumb)).toBe('181');
    button(slider.el, 'Decrease height').click();
    button(slider.el, 'Decrease height').click();
    expect(now(thumb)).toBe('179');
    expect(onInput).toHaveBeenLastCalledWith(179);
  });

  it('set() moves the thumb without reporting input, clamped', () => {
    const { slider, thumb, onInput } = make();
    slider.set(300);
    expect(now(thumb)).toBe('210');
    slider.set(150);
    expect(now(thumb)).toBe('150');
    expect(onInput).not.toHaveBeenCalled();
  });

  it('starts clamped when the value is out of range', () => {
    const { thumb } = make({ value: 120 });
    expect(now(thumb)).toBe('140');
  });

  it('drags along the track with pointer capture', () => {
    const { slider, thumb, onInput } = make();
    const track = thumb.parentElement!;
    track.getBoundingClientRect = () => ({ left: 100, width: 700, top: 0, height: 20, right: 800, bottom: 20, x: 100, y: 0, toJSON() {} });
    const capture = vi.fn();
    track.setPointerCapture = capture;
    const pointer = (type: string, clientX: number) =>
      track.dispatchEvent(new PointerEvent(type, { clientX, pointerId: 7, button: 0, bubbles: true }));

    pointer('pointerdown', 450);
    expect(capture).toHaveBeenCalledWith(7);
    expect(now(thumb)).toBe('175');
    expect(slider.el.ownerDocument.activeElement).toBe(thumb);

    pointer('pointermove', 1000);
    expect(now(thumb)).toBe('210');
    expect(onInput).toHaveBeenLastCalledWith(210);

    track.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 7 }));
    pointer('pointermove', 100);
    expect(now(thumb)).toBe('210');
  });
});
