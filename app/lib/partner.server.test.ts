import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerError, fetchActiveSubscription } from './partner.server';

const TOKEN = 'prtapi_secret_token_value';
const SHOP_GID = 'gid://shopify/Shop/42';

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(body: unknown, status = 200) {
  const calls: Captured[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const sub = {
  billingPeriod: 'EVERY_30_DAYS',
  cancelAtEndOfCycle: false,
  trialEndsAt: '2026-11-07T00:00:00Z',
  currentBillingCycle: { startTime: '2026-10-24T00:00:00Z', endTime: '2026-11-23T00:00:00Z' },
  items: [{ handle: 'pro' }],
};

beforeEach(() => {
  vi.stubEnv('SHOPIFY_PARTNER_ORG_ID', '123');
  vi.stubEnv('SHOPIFY_PARTNER_API_ACCESS_TOKEN', TOKEN);
  vi.stubEnv('SHOPIFY_APP_GID', 'gid://shopify/App/9');
});

afterEach(() => vi.unstubAllEnvs());

describe('fetchActiveSubscription', () => {
  it('posts the ActiveSubscription query to the Partner API with the token header', async () => {
    const { impl, calls } = fakeFetch({ data: { activeSubscription: sub } });
    const result = await fetchActiveSubscription(SHOP_GID, impl);

    expect(result).toEqual(sub);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://partners.shopify.com/123/api/2026-07/graphql.json');
    expect(calls[0].init.method).toBe('POST');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('X-Shopify-Access-Token')).toBe(TOKEN);
    expect(headers.get('Content-Type')).toBe('application/json');
    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload.variables).toEqual({ appId: 'gid://shopify/App/9', shopId: SHOP_GID });
    expect(payload.query).toContain('activeSubscription(appId: $appId, shopId: $shopId)');
  });

  it('passes a null subscription through', async () => {
    const { impl } = fakeFetch({ data: { activeSubscription: null } });
    expect(await fetchActiveSubscription(SHOP_GID, impl)).toBeNull();
  });

  it('throws PartnerError on a top-level errors array', async () => {
    const { impl } = fakeFetch({ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] });
    await expect(fetchActiveSubscription(SHOP_GID, impl)).rejects.toBeInstanceOf(PartnerError);
  });

  it('throws PartnerError on HTTP 429', async () => {
    const { impl } = fakeFetch({ errors: [{ message: 'Too many requests' }] }, 429);
    await expect(fetchActiveSubscription(SHOP_GID, impl)).rejects.toBeInstanceOf(PartnerError);
  });

  it('throws PartnerError on another non-2xx status, a non-JSON body or a network failure', async () => {
    await expect(fetchActiveSubscription(SHOP_GID, fakeFetch({}, 500).impl)).rejects.toBeInstanceOf(PartnerError);
    await expect(fetchActiveSubscription(SHOP_GID, fakeFetch('<html>', 200).impl)).rejects.toBeInstanceOf(
      PartnerError,
    );
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(fetchActiveSubscription(SHOP_GID, failing)).rejects.toBeInstanceOf(PartnerError);
  });

  it('throws PartnerError when data has no activeSubscription field', async () => {
    await expect(fetchActiveSubscription(SHOP_GID, fakeFetch({ data: null }).impl)).rejects.toBeInstanceOf(
      PartnerError,
    );
  });

  it('throws PartnerError without calling fetch when env is missing', async () => {
    vi.stubEnv('SHOPIFY_PARTNER_API_ACCESS_TOKEN', '');
    const { impl, calls } = fakeFetch({ data: { activeSubscription: sub } });
    await expect(fetchActiveSubscription(SHOP_GID, impl)).rejects.toThrow('Partner API is not configured');
    expect(calls).toHaveLength(0);
  });

  it('never puts the token or the response body in the error message', async () => {
    const { impl } = fakeFetch({ errors: [{ message: `bad ${SHOP_GID} secret-detail` }] }, 400);
    const err = (await fetchActiveSubscription(SHOP_GID, impl).catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(PartnerError);
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain('secret-detail');
  });
});
