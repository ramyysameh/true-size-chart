import type prisma from '../db.server';
import { AdminError, gql, type AdminClient } from './admin.server';
import {
  REFRESH_MS,
  cachedActive,
  withinGrace,
  type Entitlement,
  type Subscription,
} from './entitlement';
import { PartnerError, fetchActiveSubscription } from './partner.server';

export interface EntitlementDeps {
  fetchSubscription: (shopGid: string) => Promise<Subscription | null>;
  db: typeof prisma;
  now: () => Date;
}

const SHOP_CONTEXT = `#graphql
query ShopContext {
  shop { id myshopifyDomain ianaTimezone }
  currentAppInstallation { id }
}`;

const SET_ENTITLEMENT = `#graphql
mutation SetEntitlement($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { namespace key value } userErrors { field message code } }
}`;

interface ShopContextData {
  shop: { id: string; myshopifyDomain: string; ianaTimezone: string | null };
  currentAppInstallation: { id: string };
}

interface SetEntitlementData {
  metafieldsSet: {
    metafields: { namespace: string; key: string; value: string }[] | null;
    userErrors: { field?: string[] | null; message: string; code?: string | null }[];
  } | null;
}

/** Error name and message for log lines; our messages never carry response bodies or tokens. */
function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

async function resolveDeps(partial: Partial<EntitlementDeps> = {}): Promise<EntitlementDeps> {
  const db = partial.db ?? (await import('../db.server')).default;
  return {
    db,
    fetchSubscription: partial.fetchSubscription ?? ((shopGid) => fetchActiveSubscription(shopGid)),
    now: partial.now ?? (() => new Date()),
  };
}

function overrideActive(): boolean {
  return process.env.ENTITLEMENT_OVERRIDE === 'active' && process.env.NODE_ENV !== 'production';
}

/**
 * Whether the shop has an active Shopify App Pricing subscription, mirrored into the
 * app-data metafield `tsc.active` whenever the answer differs from the last value written.
 * Partner failures fall back to the 24 h grace window and otherwise throw; they never mean "inactive".
 */
export async function checkEntitlement(
  admin: AdminClient,
  shop: string,
  opts: { fresh?: boolean; deps?: Partial<EntitlementDeps> } = {},
): Promise<Entitlement> {
  if (overrideActive()) return { active: true, source: 'override' };

  const { db, fetchSubscription, now } = await resolveDeps(opts.deps);
  let state = await db.shopState.findUnique({ where: { shop } });

  if (!opts.fresh && state && cachedActive(state, now())) return { active: true, source: 'cache' };

  if (!state?.shopGid || !state.installationId || !state.timezone) {
    const ctx = await gql<ShopContextData>(admin, SHOP_CONTEXT);
    const known = {
      shopGid: ctx.shop.id,
      installationId: ctx.currentAppInstallation.id,
      timezone: ctx.shop.ianaTimezone ?? null,
    };
    state = await db.shopState.upsert({
      where: { shop },
      create: { shop, ...known },
      update: known,
    });
  }
  const { shopGid, installationId } = state;
  if (!shopGid || !installationId) throw new AdminError('Shop context is incomplete');

  let subscription: Subscription | null;
  try {
    subscription = await fetchSubscription(shopGid);
  } catch (error) {
    if (error instanceof PartnerError && withinGrace(state, now())) return { active: true, source: 'grace' };
    throw error;
  }

  const active = subscription !== null;
  state = await db.shopState.update({
    where: { shop },
    data: {
      entitled: active,
      planHandle: subscription?.items?.[0]?.handle ?? null,
      billingPeriod: subscription?.billingPeriod ?? null,
      trialEndsAt: subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null,
      entitlementCheckedAt: now(),
    },
  });

  if (state.entitlementWritten !== active) {
    const data = await gql<SetEntitlementData>(admin, SET_ENTITLEMENT, {
      metafields: [
        {
          ownerId: installationId,
          namespace: 'tsc',
          key: 'active',
          type: 'boolean',
          value: active ? 'true' : 'false',
        },
      ],
    });
    const userErrors = data.metafieldsSet?.userErrors ?? [];
    if (userErrors.length) {
      throw new AdminError(userErrors.map((e) => e.message).join('; '), userErrors);
    }
    await db.shopState.update({ where: { shop }, data: { entitlementWritten: active } });
  }

  return active ? { active: true, source: 'partner' } : { active: false };
}

const SPACING_MS = 300; // Partner API allows 4 requests/s per client, shared with admin loads.
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Re-checks every entitled shop whose last confirmation is older than REFRESH_MS, one at a time.
 * App Pricing sends no billing webhooks, so this is how a cancellation turns the storefront off.
 */
export async function refreshEntitlements(
  deps: Partial<EntitlementDeps> & {
    adminFor?: (shop: string) => Promise<AdminClient>;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ checked: number; changed: number }> {
  const resolved = await resolveDeps(deps);
  const sleep = deps.sleep ?? realSleep;
  const adminFor =
    deps.adminFor ??
    (async (shop: string) => {
      const { unauthenticated } = await import('../shopify.server');
      return (await unauthenticated.admin(shop)).admin;
    });

  const due = await resolved.db.shopState.findMany({
    where: { entitled: true, entitlementCheckedAt: { lt: new Date(resolved.now().getTime() - REFRESH_MS) } },
    select: { shop: true },
  });

  let checked = 0;
  let changed = 0;
  for (const [i, { shop }] of due.entries()) {
    if (i > 0) await sleep(SPACING_MS);
    checked++;
    try {
      const result = await checkEntitlement(await adminFor(shop), shop, { fresh: true, deps: resolved });
      if (!result.active) changed++;
    } catch (error) {
      console.error(`Entitlement refresh for ${shop} failed (${describeError(error)})`);
    }
  }
  return { checked, changed };
}

declare global {
  // eslint-disable-next-line no-var
  var __tscRefresher: boolean | undefined;
}

const REFRESH_INTERVAL_MS = 30 * 60_000;
const FIRST_RUN_MS = 60_000;

/** Starts the background refresher once per process. Never runs under tests. */
export function startEntitlementRefresher(): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  if (globalThis.__tscRefresher) return;
  globalThis.__tscRefresher = true;

  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    refreshEntitlements()
      .catch((error) => console.error(`Entitlement refresh failed (${describeError(error)})`))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(run, FIRST_RUN_MS).unref?.();
  setInterval(run, REFRESH_INTERVAL_MS).unref?.();
}
