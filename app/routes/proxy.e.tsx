// Storefront finder events, reached through the app proxy at /apps/tsc/e.
// Privacy: reads only the body, the content-length header (to refuse oversized bodies) and what
// authenticate.public.appProxy needs. No IP, other headers, customer id or other query params are
// read, stored or logged here.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { localDate, MAX_EVENT_BYTES, parseEvent, RateLimiter, readCapped } from "../lib/events";
import { recordEvent } from "../lib/events.server";

const limiter = new RateLimiter();
const noContent = () => new Response(null, { status: 204 });

export const loader = () => new Response(null, { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) => {
  // A bad signature throws the library's Response; it propagates so its status is kept.
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return noContent(); // app uninstalled

  try {
    const shop = session.shop;
    const body = await readCapped(request, MAX_EVENT_BYTES);
    const ev = body === null ? null : parseEvent(body);
    if (!ev || !limiter.allow(shop)) return noContent();
    const state = await db.shopState.findUnique({ where: { shop }, select: { timezone: true } });
    await recordEvent(db, shop, ev, localDate(new Date(), state?.timezone));
  } catch (err) {
    if (err instanceof Response) throw err;
    // Beacons can't retry and a failure must never surface on the storefront.
  }
  return noContent();
};
