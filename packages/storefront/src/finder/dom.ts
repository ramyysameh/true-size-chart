/**
 * Builds an element. `on*` function attrs become listeners; `true` sets an empty attribute; `false`, `null` and
 * `undefined` attrs and `null` children are skipped. Pass ARIA booleans as the strings 'true' / 'false'.
 */
export function h(
  tag: string,
  attrs?: Record<string, unknown> | null,
  ...children: (Node | string | null)[]
): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (name.startsWith('on') && typeof value === 'function') {
        el.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
      } else {
        el.setAttribute(name, value === true ? '' : String(value));
      }
    }
  }
  for (const child of children) if (child !== null && child !== undefined) el.append(child);
  return el;
}

/**
 * A roving-tabindex radiogroup of buttons: arrow keys move the selection (wrapping) and focus with it.
 * `onChange` runs on every pick by the shopper, never for the initial `value`.
 */
export function radioGroup<T>(
  labelledBy: string,
  cls: string,
  values: readonly T[],
  content: (v: T, i: number) => (Node | string | null)[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const radios = values.map((v, i) => h('button', { type: 'button', role: 'radio', class: cls, onclick: () => pick(i) }, ...content(v, i)));
  const mark = (i: number) =>
    radios.forEach((r, j) => {
      r.setAttribute('aria-checked', String(i === j));
      r.tabIndex = i === j ? 0 : -1;
    });
  const pick = (i: number) => {
    mark(i);
    onChange(values[i]!);
  };
  mark(Math.max(0, values.indexOf(value)));

  const onkeydown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = radios.length;
    const i = (radios.findIndex((r) => r.tabIndex === 0) + d + n) % n;
    pick(i);
    radios[i]!.focus();
  };
  return h('div', { role: 'radiogroup', 'aria-labelledby': labelledBy, onkeydown }, ...radios);
}
