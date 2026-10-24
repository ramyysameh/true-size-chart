/** Partner API `activeSubscription` (Shopify App Pricing). */
export interface Subscription {
  billingPeriod: string;
  cancelAtEndOfCycle: boolean;
  trialEndsAt: string | null;
  currentBillingCycle: { startTime: string; endTime: string } | null;
  items: { handle: string }[];
}

export type Entitlement =
  | { active: true; source: 'partner' | 'cache' | 'grace' | 'override' }
  | { active: false };

/** An active answer is reused for this long without asking the Partner API. Inactive answers are never cached. */
export const CACHE_MS = 5 * 60_000;
/** While the Partner API fails, a shop confirmed active within this window stays active. */
export const GRACE_MS = 24 * 3_600_000;
/** The background refresher re-checks entitled shops whose last confirmation is older than this. */
export const REFRESH_MS = 6 * 3_600_000;

interface EntitlementState {
  entitled: boolean;
  entitlementCheckedAt: Date | null;
}

/** The hosted Shopify App Pricing plan page for a shop. */
export function planPageUrl(shopDomain: string, appHandle: string): string {
  const store = shopDomain.replace(/\.myshopify\.com$/i, '');
  return `https://admin.shopify.com/store/${store}/charges/${appHandle}/pricing_plans`;
}

function confirmedWithin(state: EntitlementState, now: Date, windowMs: number): boolean {
  if (!state.entitled || !state.entitlementCheckedAt) return false;
  return now.getTime() - state.entitlementCheckedAt.getTime() < windowMs;
}

export function cachedActive(state: EntitlementState, now: Date): boolean {
  return confirmedWithin(state, now, CACHE_MS);
}

export function withinGrace(state: EntitlementState, now: Date): boolean {
  return confirmedWithin(state, now, GRACE_MS);
}
