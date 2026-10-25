// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  transaction: vi.fn(),
  sessions: vi.fn(),
  rules: vi.fn(),
  states: vi.fn(),
  eventDays: vi.fn(),
  eventSizes: vi.fn(),
}));

vi.mock('../shopify.server', () => ({ authenticate: { webhook: mocks.webhook } }));
vi.mock('../db.server', () => ({
  default: {
    $transaction: mocks.transaction,
    session: { deleteMany: mocks.sessions },
    assignmentRule: { deleteMany: mocks.rules },
    shopState: { deleteMany: mocks.states },
    eventDaily: { deleteMany: mocks.eventDays },
    eventSizeDaily: { deleteMany: mocks.eventSizes },
  },
}));

const { action } = await import('../routes/webhooks.app.uninstalled');

const SHOP = 's.myshopify.com';
const run = () =>
  action({ request: new Request('https://app.test/webhooks/app/uninstalled', { method: 'POST' }) } as never);

afterEach(() => vi.resetAllMocks());

const deletes = () => [mocks.rules, mocks.states, mocks.eventDays, mocks.eventSizes, mocks.sessions];

describe('app/uninstalled webhook', () => {
  it.each([
    ['no session is left', undefined],
    ['a session exists', { id: 'x' }],
  ])('deletes all five tables for the shop in one transaction when %s', async (_, session) => {
    mocks.webhook.mockResolvedValue({ shop: SHOP, session, topic: 'APP_UNINSTALLED' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    deletes().forEach((del, i) => del.mockReturnValue(`delete-${i}`));
    mocks.transaction.mockResolvedValue([]);

    const res = await run();

    expect(res.status).toBe(200);
    for (const del of deletes()) expect(del).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(5);
  });

  it('still deletes everything when the offline token refresh fails after a valid HMAC', async () => {
    const { createHmac } = await import('node:crypto');
    vi.stubEnv('SHOPIFY_API_SECRET', 'test-secret');
    mocks.webhook.mockRejectedValue(new Response(null, { status: 500 }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.transaction.mockResolvedValue([]);
    const body = JSON.stringify({ id: 1 });
    const hmac = createHmac('sha256', 'test-secret').update(body).digest('base64');
    const request = new Request('https://app.test/webhooks/app/uninstalled', {
      method: 'POST',
      body,
      headers: { 'X-Shopify-Hmac-Sha256': hmac, 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Topic': 'app/uninstalled' },
    });

    const res = await action({ request } as never);

    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.rules).toHaveBeenCalledWith({ where: { shop: SHOP } });
    vi.unstubAllEnvs();
  });
});
