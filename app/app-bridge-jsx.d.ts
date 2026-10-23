// @shopify/app-bridge-types declares its elements (s-app-nav, ui-save-bar, …) on the global JSX
// namespace, which React 19's types no longer read. Carry them over to React.JSX.
import "react";

declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IntrinsicElements extends globalThis.JSX.IntrinsicElements {}
  }
}
