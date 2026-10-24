import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { appHandle, planPageUrl } from "../lib/entitlement";
import { checkEntitlement } from "../lib/entitlement.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, redirect, session } = await authenticate.admin(request);

  // The welcome link from the plan page adds plan_handle: skip the cache so the new plan shows at once.
  const fresh = new URL(request.url).searchParams.has("plan_handle");
  const entitlement = await checkEntitlement(admin, session.shop, { fresh });
  if (!entitlement.active) {
    return redirect(planPageUrl(session.shop, appHandle()), { target: "_top" });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/charts">Charts</s-link>
        <s-link href="/app/rules">Assignments</s-link>
        <s-link href="/app/mapping">Size mapping</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
