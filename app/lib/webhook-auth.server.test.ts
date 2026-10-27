import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webhook: vi.fn() }));
vi.mock('../shopify.server', () => ({ authenticate: { webhook: mocks.webhook } }));

const { authenticateWebhook } = await import('./webhook-auth.server');

const SECRET = 'shh-test-secret';
const SHOP = 's.myshopify.com';
const BODY = JSON.stringify({ shop_id: 1, shop_domain: SHOP });

function delivery(opts: { hmac?: string; topic?: string; body?: string } = {}) {
  const body = opts.body ?? BODY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Shop-Domain': SHOP,
    'X-Shopify-Topic': opts.topic ?? 'shop/redact',
  };
  const hmac = opts.hmac ?? createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
  if (hmac) headers['X-Shopify-Hmac-Sha256'] = hmac;
  return new Request('https://app.test/webhooks/compliance', { method: 'POST', headers, body });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('authenticateWebhook', () => {
  it('returns the library context when the library succeeds', async () => {
    mocks.webhook.mockResolvedValue({ shop: SHOP, topic: 'SHOP_REDACT', session: { id: 'x' } });
    expect(await authenticateWebhook(delivery())).toEqual({ shop: SHOP, topic: 'SHOP_REDACT' });
  });

  it.each([400, 401, 405])('lets the library’s own %i answer through', async (status) => {
    const res = new Response(null, { status });
    mocks.webhook.mockRejectedValue(res);
    await expect(authenticateWebhook(delivery())).rejects.toBe(res);
  });

  it('carries on with the headers when the offline token refresh fails after a valid HMAC', async () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET);
    mocks.webhook.mockRejectedValue(new Response(null, { status: 500 }));
    expect(await authenticateWebhook(delivery({ topic: 'app/uninstalled' }))).toEqual({
      shop: SHOP,
      topic: 'APP_UNINSTALLED',
    });
  });

  it('carries on when the refresh throws a non-Response error', async () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET);
    mocks.webhook.mockRejectedValue(new Error('invalid_subject_token'));
    expect(await authenticateWebhook(delivery())).toEqual({ shop: SHOP, topic: 'SHOP_REDACT' });
  });

  it('answers 401 in the fallback when the HMAC does not match', async () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET);
    mocks.webhook.mockRejectedValue(new Response(null, { status: 500 }));
    const err = await authenticateWebhook(delivery({ hmac: 'bm90LXRoZS1yaWdodC1obWFj' })).catch((e) => e);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(401);
  });

  it('answers 401 in the fallback when no secret is configured', async () => {
    vi.stubEnv('SHOPIFY_API_SECRET', '');
    mocks.webhook.mockRejectedValue(new Response(null, { status: 500 }));
    const err = await authenticateWebhook(delivery()).catch((e) => e);
    expect((err as Response).status).toBe(401);
  });
});
