// Liveness answer for the app proxy at /apps/tsc/ping. The admin probes it to notice a renamed proxy path.
// Privacy: reads nothing beyond what authenticate.public.appProxy needs, stores and logs nothing.
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  return new Response("tsc-ok", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
};
