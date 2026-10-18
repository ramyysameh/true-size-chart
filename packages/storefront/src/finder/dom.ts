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
