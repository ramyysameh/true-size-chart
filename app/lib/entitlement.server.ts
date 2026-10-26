import type prisma from '../db.server';
import { AdminError, gql, type AdminClient } from './admin.server';
import {
  REFRESH_MS,
  cachedActive,
  withinGrace,
  type Entitlement,
  type Subscription,
} from './entitlement';
import { acquireLease, releaseLease, type LeaseDb } from './lease.server';
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

/**
 * Re-reads the shop's identity after every OAuth / token exchange and stores it, so a reinstall
 * (whose uninstall webhook may never have run) points `tsc.active` at the new installation.
 * `entitlementWritten` is always cleared so the next real check rewrites the metafield; a changed
 * installation id also clears `entitlementCheckedAt`, because a reinstall can mean another subscription.
 * Never throws: an auth must not fail because of this.
 */
export async function refreshShopContext(
  admin: AdminClient,
  shop: string,
  deps: Partial<Pick<EntitlementDeps, 'db'>> = {},
): Promise<void> {
  try {
    const { db } = await resolveDeps(deps);
    const ctx = await gql<ShopContextData>(admin, SHOP_CONTEXT);
    const known = {
      shopGid: ctx.shop.id,
      installationId: ctx.currentAppInstallation.id,
      timezone: ctx.shop.ianaTimezone ?? null,
    };
    const previous = await db.shopState.findUnique({ where: { shop } });
    const reset =
      previous?.installationId === known.installationId
        ? { entitlementWritten: null }
        : { entitlementWritten: null, entitlementCheckedAt: null };
    await db.shopState.upsert({
      where: { shop },
      create: { shop, ...known, ...reset },
      update: { ...known, ...reset },
    });
  } catch (error) {
    console.error(`Shop context refresh for ${shop} failed (${describeError(error)})`);
  }
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
  const adminFor = deps.adminFor ?? offlineAdmin;

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

async function offlineAdmin(shop: string): Promise<AdminClient> {
  const { unauthenticated } = await import('../shopify.server');
  return (await unauthenticated.admin(shop)).admin;
}

const SHOP_LEASE_MS = 60_000;

/**
 * Re-checks one entitled shop whose last confirmation is older than REFRESH_MS. Called in the
 * background after storefront events, so on serverless hosting a cancellation still turns the
 * storefront off within hours of the next shopper visit (the daily cron covers quiet shops).
 * A per-shop lease keeps concurrent events from asking the Partner API twice. Never rejects.
 */
export async function refreshShopIfDue(
  shop: string,
  deps: Partial<EntitlementDeps> & {
    adminFor?: (shop: string) => Promise<AdminClient>;
    lease?: LeaseDb;
    holder?: string;
  } = {},
): Promise<void> {
  try {
    const resolved = await resolveDeps(deps);
    const state = await resolved.db.shopState.findUnique({
      where: { shop },
      select: { entitled: true, entitlementCheckedAt: true },
    });
    const age = state?.entitlementCheckedAt ? resolved.now().getTime() - state.entitlementCheckedAt.getTime() : null;
    if (!state?.entitled || age === null || age < REFRESH_MS) return;

    const lease = deps.lease ?? resolved.db;
    const holder = deps.holder ?? crypto.randomUUID();
    const name = `refresh:${shop}`;
    if (!(await acquireLease(lease, name, holder, SHOP_LEASE_MS, resolved.now()))) return;
    try {
      await checkEntitlement(await (deps.adminFor ?? offlineAdmin)(shop), shop, { fresh: true, deps: resolved });
    } finally {
      await releaseLease(lease, name, holder, resolved.now());
    }
  } catch (error) {
    console.error(`Entitlement refresh for ${shop} failed (${describeError(error)})`);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __tscRefresher: boolean | undefined;
}

const REFRESH_INTERVAL_MS = 30 * 60_000;
const FIRST_RUN_MS = 60_000;

export const REFRESH_LEASE = 'entitlement-refresh';
/** Shorter than the 30 min interval; a crashed holder's lease frees itself by the next tick. */
export const LEASE_MS = 25 * 60_000;

/** One timer tick: lease, refreshEntitlements, release. Never rejects. */
export async function runRefresh(
  deps: Parameters<typeof refreshEntitlements>[0] & { lease: LeaseDb; holder: string },
): Promise<void> {
  const { lease, holder, ...rest } = deps;
  const now = rest.now ?? (() => new Date());
  try {
    if (!(await acquireLease(lease, REFRESH_LEASE, holder, LEASE_MS, now()))) return;
    try {
      await refreshEntitlements(rest);
    } finally {
      await releaseLease(lease, REFRESH_LEASE, holder, now());
    }
  } catch (error) {
    console.error(`Entitlement refresh failed (${describeError(error)})`);
  }
}

/**
 * Starts the background refresher once per process. Never runs under tests, nor on Vercel, where
 * functions don't stay alive between requests: there the daily cron (/jobs/refresh-entitlements)
 * and refreshShopIfDue after storefront events do the same work.
 */
export function startEntitlementRefresher(): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  if (process.env.VERCEL) return;
  if (globalThis.__tscRefresher) return;
  globalThis.__tscRefresher = true;

  const holder = crypto.randomUUID();
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    import('../db.server')
      .then(({ default: db }) => runRefresh({ lease: db, holder, db }))
      .catch((error) => console.error(`Entitlement refresh failed (${describeError(error)})`))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(run, FIRST_RUN_MS).unref?.();
  setInterval(run, REFRESH_INTERVAL_MS).unref?.();
}
