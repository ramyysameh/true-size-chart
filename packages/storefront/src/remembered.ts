/** Paints the remembered size on every opener (except the plain size chart link), or restores its default label. */
export function paintRemembered(doc: Document, size: string | null | undefined): void {
  for (const opener of doc.querySelectorAll<HTMLElement>('[data-tsc-open]:not([data-tsc-open="chart"])')) {
    const { tscRemembered: template, tscDefault: fallback } = opener.dataset;
    const label = opener.querySelector('[data-tsc-label]');
    const text = size && template ? template.replace('{size}', size) : fallback;
    if (label && text !== undefined) label.textContent = text;
  }
}
