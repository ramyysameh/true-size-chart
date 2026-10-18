import type { Recommendation } from '@true-size-chart/engine';
import type { FinderConfig, VariantInfo } from './config';

export interface StockPick {
  size: string;
  variant: VariantInfo;
  substituted: boolean;
}

const norm = (label: string): string => label.trim().toLowerCase();

const known = (config: FinderConfig, id: number): boolean => config.variants.some((v) => v.id === id);

function parseId(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** The variant the shopper is on: ?variant=, else the product form, else the block's selected variant. */
export function currentVariantId(doc: Document, config: FinderConfig, location: Location = doc.location): number {
  const fromUrl = parseId(new URLSearchParams(location.search).get('variant'));
  if (fromUrl !== null && known(config, fromUrl)) return fromUrl;

  const input = doc.querySelector<HTMLInputElement>('form[action*="/cart/add"] [name="id"]');
  const fromForm = parseId(input?.value);
  if (fromForm !== null && known(config, fromForm)) return fromForm;

  return config.selectedVariantId;
}

/** The variant for a size label, preferring the current variant with only its size option swapped. */
export function variantForSize(config: FinderConfig, size: string, currentId: number): VariantInfo | null {
  const index = config.sizeOptionIndex;
  if (index === null) return null;

  const wanted = norm(size);
  const matches = config.variants.filter((v) => norm(v.options[index] ?? '') === wanted);
  if (matches.length === 0) return null;

  const current = config.variants.find((v) => v.id === currentId);
  if (current) {
    const swapped = matches.find((v) => v.options.every((option, i) => i === index || option === current.options[i]));
    if (swapped) return swapped;
  }
  return matches.find((v) => v.available) ?? matches[0] ?? null;
}

/** The size the shopper is looking at if it is in stock, else the next-closest size that is. */
export function inStockPick(
  rec: Recommendation,
  size: string,
  config: FinderConfig,
  currentId: number,
): StockPick | null {
  const own = variantForSize(config, size, currentId);
  if (own?.available) return { size, variant: own, substituted: false };

  const skip = norm(size);
  const candidates = rec.scores
    .filter((s) => Number.isFinite(s.error) && norm(s.size) !== skip)
    .sort((a, b) => a.error - b.error);
  for (const candidate of candidates) {
    const variant = variantForSize(config, candidate.size, currentId);
    if (variant?.available) return { size: candidate.size, variant, substituted: true };
  }
  return null;
}
