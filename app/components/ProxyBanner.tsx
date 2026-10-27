import type { ProxyStatus } from "../lib/proxy-check.server";

/** Warns when the merchant renamed the app proxy, which silently stops finder analytics. */
export function ProxyBanner({ status }: { status: ProxyStatus }) {
  if (status !== "moved") return null;
  return (
    <s-banner tone="warning" heading="Finder analytics can't reach the app">
      <s-paragraph>
        The app proxy URL for True: Size Chart was changed in your store settings, so finder activity isn&apos;t
        counted. Go to Settings → Apps → True: Size Chart → App proxy and set it back to apps / tsc.
      </s-paragraph>
      <s-link href="?proxy=recheck">Check again</s-link>
    </s-banner>
  );
}
