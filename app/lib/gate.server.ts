import { authenticate } from "../shopify.server";
import { appHandle, planPageUrl } from "./entitlement";
import { checkEntitlement } from "./entitlement.server";

export type AdminContext = Awaited<ReturnType<typeof authenticate.admin>>;

/**
 * Authenticates the admin request and requires an active Pro subscription.
 * React Router runs only the action of the route that receives a POST, so the
 * layout loader's paywall never sees it: every admin action must call this.
 * A lapsed shop gets a thrown redirect to the plan page, out of the iframe.
 */
export async function authenticatePro(
  request: Request,
  opts?: { fresh?: boolean },
): Promise<AdminContext> {
  const ctx = await authenticate.admin(request);
  const entitlement = await checkEntitlement(ctx.admin, ctx.session.shop, {
    fresh: opts?.fresh ?? false,
  });
  if (!entitlement.active) {
    throw ctx.redirect(planPageUrl(ctx.session.shop, appHandle()), { target: "_top" });
  }
  return ctx;
}
