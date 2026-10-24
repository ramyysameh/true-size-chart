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

/** The app's handle in its Shopify admin URLs. */
export function appHandle(): string {
  // eslint-disable-next-line no-undef
  return process.env.SHOPIFY_APP_HANDLE ?? 'true-size-chart';
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

const TRIAL_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** One line for the Home plan card. */
export function planSummary(
  state: { planHandle: string | null; billingPeriod: string | null; trialEndsAt: Date | null },
  now: Date,
): string {
  if (state.trialEndsAt && state.trialEndsAt.getTime() > now.getTime()) {
    return `Pro · free trial until ${TRIAL_DATE.format(state.trialEndsAt)}`;
  }
  if (state.billingPeriod === 'EVERY_30_DAYS') return 'Pro · monthly';
  if (state.billingPeriod === 'ANNUAL') return 'Pro · yearly';
  return 'Pro';
}
