import { useCallback, useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { extensionStatus, type ExtensionStatus } from "../lib/theme-links";

const UNKNOWN: ExtensionStatus = { embed: "unknown", block: "unknown" };

/**
 * Reads the theme app extension's activation state from App Bridge, client-side only.
 * Re-checks when the window regains focus (after the merchant returns from the theme editor).
 */
export function useExtensionStatus(): { status: ExtensionStatus; checked: boolean; refresh: () => void } {
  const shopify = useAppBridge();
  const [status, setStatus] = useState<ExtensionStatus>(UNKNOWN);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(() => {
    const app = (shopify as { app?: { extensions?: () => Promise<unknown> } }).app;
    if (typeof app?.extensions !== "function") {
      setChecked(true);
      return;
    }
    app
      .extensions()
      .then((ext) => setStatus(extensionStatus(ext)))
      .catch(() => setStatus(UNKNOWN))
      .finally(() => setChecked(true));
  }, [shopify]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { status, checked, refresh };
}
