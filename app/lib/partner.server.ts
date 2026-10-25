import type { Subscription } from './entitlement';

/**
 * Any Partner API failure: not configured, network, throttling, non-2xx or GraphQL errors.
 * Callers must never read it as "no subscription". Messages never carry the token or response bodies.
 */
export class PartnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerError';
  }
}

const API_VERSION = '2026-07';

const ACTIVE_SUBSCRIPTION = `#graphql
query ActiveSubscription($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    billingPeriod cancelAtEndOfCycle trialEndsAt
    currentBillingCycle { startTime endTime }
    items { handle }
  }
}`;

interface PartnerBody {
  data?: { activeSubscription?: Subscription | null } | null;
  errors?: { extensions?: { code?: unknown } }[];
}

/** The shop's active App Pricing subscription, or null when it has none. Throws PartnerError otherwise. */
export async function fetchActiveSubscription(
  shopGid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Subscription | null> {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const token = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  const appId = process.env.SHOPIFY_APP_GID;
  if (!orgId || !token || !appId) throw new PartnerError('Partner API is not configured');

  const url = `https://partners.shopify.com/${encodeURIComponent(orgId)}/api/${API_VERSION}/graphql.json`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: ACTIVE_SUBSCRIPTION, variables: { appId, shopId: shopGid } }),
    });
  } catch {
    throw new PartnerError('Partner API request failed');
  }

  if (response.status === 429) throw new PartnerError('Partner API throttled (HTTP 429)');
  if (!response.ok) throw new PartnerError(`Partner API returned HTTP ${response.status}`);

  let body: PartnerBody;
  try {
    body = (await response.json()) as PartnerBody;
  } catch {
    throw new PartnerError(`Partner API returned a non-JSON response (HTTP ${response.status})`);
  }

  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    // Only error codes are surfaced; messages can echo request data.
    const codes = body.errors
      .map((e) => e?.extensions?.code)
      .filter((c): c is string => typeof c === 'string');
    const detail = codes.length ? ` (${[...new Set(codes)].join(', ')})` : '';
    throw new PartnerError(`Partner API returned errors${detail}`);
  }
  if (!body?.data || !('activeSubscription' in body.data)) {
    throw new PartnerError('Partner API returned no activeSubscription');
  }
  return body.data.activeSubscription ?? null;
}
