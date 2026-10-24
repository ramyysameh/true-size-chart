import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // The shop's app data goes whether or not a session is left (a redelivered webhook may find none).
  await db.assignmentRule.deleteMany({ where: { shop } });
  await db.shopState.deleteMany({ where: { shop } });
  await db.eventDaily.deleteMany({ where: { shop } });
  await db.eventSizeDaily.deleteMany({ where: { shop } });

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
