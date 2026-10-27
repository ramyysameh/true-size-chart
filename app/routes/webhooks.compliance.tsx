// Mandatory privacy compliance webhooks (customers/data_request, customers/redact, shop/redact).
// Payloads can hold customer emails and phones: log the topic and shop only, never the payload.
import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhook } from "../lib/webhook-auth.server";
import db from "../db.server";
import { deleteShopData } from "../lib/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // An invalid HMAC throws the library's 401 Response, which Shopify requires; let it through.
  const { shop, topic } = await authenticateWebhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "SHOP_REDACT": {
      // Sent 48 h after an uninstall. Uninstall already deleted the old rows, so an offline
      // session now means the merchant reinstalled and the data belongs to the new install.
      const installed = await db.session.count({ where: { shop, isOnline: false } });
      if (installed > 0) {
        console.log(`shop/redact for ${shop} skipped: the app is installed again`);
      } else {
        await deleteShopData(db, shop);
      }
      break;
    }
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // The app stores no customer data (no customer scopes, anonymous counters only),
      // so there is nothing to export or delete.
      break;
  }

  return new Response(null, { status: 200 });
};
