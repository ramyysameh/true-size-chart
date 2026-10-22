import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { liveRules, loadAssignment, syncProducts } from "../lib/assign.server";

/** products/create and products/update: re-resolve this one product's size chart. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, admin, payload } = await authenticate.webhook(request);

  try {
    const productId = (payload as { admin_graphql_api_id?: unknown })?.admin_graphql_api_id;
    if (admin && typeof productId === "string") {
      const { rules, managed } = await loadAssignment(db, shop);
      // A shop that never had rules: assignment is not set up, so leave the product alone.
      if (rules.length > 0 || managed) {
        await syncProducts(admin, await liveRules(admin, rules), { productId, managed });
      }
    }
  } catch (error) {
    // Always acknowledge: the next full sync repairs anything missed here, and retries would only repeat the failure.
    console.error(`${topic} webhook for ${shop} failed`, error);
  }

  return new Response();
};
