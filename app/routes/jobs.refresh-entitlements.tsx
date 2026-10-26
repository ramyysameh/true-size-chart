// Daily Vercel cron (vercel.json): re-checks App Pricing subscriptions for shops nobody has visited
// lately and prunes old rate-limit windows. Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
import { timingSafeEqual } from "node:crypto";
import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { runRefresh } from "../lib/entitlement.server";
import { pruneEventRates } from "../lib/rate.server";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  await runRefresh({ lease: db, holder: crypto.randomUUID(), db });
  const pruned = await pruneEventRates(db, new Date());
  return Response.json({ ok: true, pruned });
};
