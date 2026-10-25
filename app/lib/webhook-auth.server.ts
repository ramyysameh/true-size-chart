import { createHmac, timingSafeEqual } from 'node:crypto';
import { authenticate } from '../shopify.server';

export interface WebhookContext {
  shop: string;
  topic: string; // uppercase enum form, e.g. SHOP_REDACT
}

const LIBRARY_ANSWERS = new Set([400, 401, 405]);

/**
 * `authenticate.webhook`, minus one failure mode. After a valid HMAC the library refreshes the shop's
 * expiring offline token, and after an uninstall that refresh fails (500) before our handler runs, so
 * app/uninstalled and shop/redact would never delete anything. Data-deleting routes need only the shop
 * and topic, so when the library fails for any reason other than its own 4xx answers, the HMAC is
 * checked here with the app secret and the shop and topic come from Shopify's headers.
 */
export async function authenticateWebhook(request: Request): Promise<WebhookContext> {
  const copy = request.clone();
  try {
    const { shop, topic } = await authenticate.webhook(request);
    return { shop, topic };
  } catch (error) {
    if (error instanceof Response && LIBRARY_ANSWERS.has(error.status)) throw error;
    return verifyByHand(copy);
  }
}

async function verifyByHand(request: Request): Promise<WebhookContext> {
  const unauthorized = () => new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  const secret = process.env.SHOPIFY_API_SECRET;
  const given = request.headers.get('x-shopify-hmac-sha256');
  const shop = request.headers.get('x-shopify-shop-domain');
  const topic = request.headers.get('x-shopify-topic');
  if (!secret || !given || !shop || !topic) throw unauthorized();

  const expected = createHmac('sha256', secret).update(await request.text(), 'utf8').digest();
  const received = Buffer.from(given, 'base64');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw unauthorized();

  return { shop, topic: topic.toUpperCase().replace(/[/.]/g, '_') };
}
