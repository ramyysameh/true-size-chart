import type { LoaderFunctionArgs } from "react-router";
import { readPreviewAsset } from "../lib/preview-assets.server";

// Public on purpose: the same files ship to every storefront from Shopify's CDN.
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const asset = await readPreviewAsset(params.name ?? "");
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(asset.body, {
    headers: {
      "Content-Type": asset.type,
      "Cache-Control": "public, max-age=300",
      // The preview iframe is sandboxed (opaque origin); scripts and stylesheets load without CORS.
    },
  });
};
