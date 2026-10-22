import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { loadRules, syncProducts } from "../lib/assign.server";

/** products/create and products/update: re-resolve this one product's size chart. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, admin, payload } = await authenticate.webhook(request);

  try {
    const productId = (payload as { admin_graphql_api_id?: unknown })?.admin_graphql_api_id;
    if (admin && typeof productId === "string") {
      const rules = await loadRules(db, shop);
      if (rules.length > 0) {
        await syncProducts(admin, rules, { productId });
      }
    }
  } catch (error) {
    // Always acknowledge: the next full sync repairs anything missed here, and retries would only repeat the failure.
    console.error(`${topic} webhook for ${shop} failed`, error);
  }

  return new Response();
};
