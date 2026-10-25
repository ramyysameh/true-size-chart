// Render's health check. Public and unauthenticated, so it says nothing beyond up or down.
import db from "../db.server";

export const loader = async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response("ok", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  } catch {
    return new Response("db", { status: 503, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
};
