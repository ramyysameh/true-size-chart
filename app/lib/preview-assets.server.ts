import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The storefront finder bundle, served to the admin's live preview.
 * The committed theme-extension files are read directly: in `shopify app dev`
 * the CLI proxy owns every `/extensions/...` URL, so they can't be imported as Vite assets.
 */
const FILES: Record<string, string> = {
  "tsc-finder.js": "text/javascript; charset=utf-8",
  "tsc-finder.css": "text/css; charset=utf-8",
};

export const PREVIEW_ASSET_DIR = join("extensions", "true-size-chart", "assets");

/** Content type for an allowed asset name, or null for anything else (no path traversal). */
export function previewAssetType(name: string): string | null {
  return Object.prototype.hasOwnProperty.call(FILES, name) ? FILES[name] : null;
}

/** Reads an allowed asset; null when the name is not allowed or the file is missing. */
export async function readPreviewAsset(
  name: string,
  root: string = process.cwd(),
): Promise<{ body: string; type: string } | null> {
  const type = previewAssetType(name);
  if (!type) return null;
  try {
    return { body: await readFile(join(root, PREVIEW_ASSET_DIR, name), "utf8"), type };
  } catch {
    return null;
  }
}
