/** Paints the remembered size on every opener (except the plain size chart link), or restores its default label. */
export function paintRemembered(doc: Document, size: string | null): void {
  const openers = doc.querySelectorAll<HTMLElement>('[data-tsc-open]:not([data-tsc-open="chart"])');
  for (const opener of openers) {
    const label = opener.querySelector('[data-tsc-label]');
    if (!label) continue;
    const template = opener.getAttribute('data-tsc-remembered');
    const text =
      size !== null && template ? template.replace('{size}', size) : opener.getAttribute('data-tsc-default');
    if (text !== null) label.textContent = text;
  }
}
