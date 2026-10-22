export function themeEditorLinks(shopDomain: string, apiKey: string): { embed: string; block: string } {
  const base = `https://${shopDomain}/admin/themes/current/editor`;
  return {
    embed: `${base}?context=apps&activateAppId=${apiKey}/tsc-embed`,
    block: `${base}?template=product&addAppBlockId=${apiKey}/tsc-button&target=mainSection`,
  };
}

export type ActivationState = 'active' | 'available' | 'unknown';
export type ExtensionStatus = { embed: ActivationState; block: ActivationState };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function statusOf(extensions: unknown, handle: string): ActivationState {
  if (!Array.isArray(extensions)) return 'unknown';
  for (const ext of extensions) {
    if (!isRecord(ext) || ext.type !== 'theme_app_extension' || !Array.isArray(ext.activations)) continue;
    for (const a of ext.activations) {
      if (!isRecord(a) || a.handle !== handle) continue;
      return a.status === 'active' || a.status === 'available' ? a.status : 'unknown';
    }
  }
  return 'unknown';
}

/** Reads `shopify.app.extensions()`: the app embed and the product block of our theme app extension. */
export function extensionStatus(extensions: unknown): ExtensionStatus {
  return { embed: statusOf(extensions, 'tsc-embed'), block: statusOf(extensions, 'tsc-button') };
}
