import type { FinderConfig } from '../config';

const EDITORIAL_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const DEFAULT_ACCENT = '#111111';

/** `#abc` / `#aabbcc` → `aabbcc`, anything else → null. */
function parseHex(hex: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const digits = m[1]!;
  return digits.length === 3 ? digits.replace(/./g, '$&$&') : digits;
}

/** WCAG relative luminance of a 6-digit hex. */
function luminance(digits: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Text colour for an accent background: white while it keeps 4.5:1, otherwise black
 * (where white falls below 4.5:1, black is always above it).
 */
export function contrastText(hex: string): '#000000' | '#ffffff' {
  const digits = parseHex(hex);
  if (digits === null) return '#ffffff';
  return 1.05 / (luminance(digits) + 0.05) >= 4.5 ? '#ffffff' : '#000000';
}

/** Merchant settings → CSS custom properties on the host (they inherit into the shadow root). */
export function applyTheme(host: HTMLElement, settings: FinderConfig['settings']): void {
  const accent = parseHex(settings.accent) === null ? DEFAULT_ACCENT : settings.accent;
  const radius = Math.max(0, Number(settings.radius) || 0);
  host.style.setProperty('--tsc-font', settings.font === 'theme' ? 'inherit' : EDITORIAL_FONT);
  host.style.setProperty('--tsc-accent', accent);
  host.style.setProperty('--tsc-on-accent', contrastText(accent));
  host.style.setProperty('--tsc-radius', `${radius}px`);
}
