// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  transaction: vi.fn(),
  sessionCount: vi.fn(),
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
    session: { count: mocks.sessionCount, deleteMany: mocks.sessions },
    assignmentRule: { deleteMany: mocks.rules },
    shopState: { deleteMany: mocks.states },
    eventDaily: { deleteMany: mocks.eventDays },
    eventSizeDaily: { deleteMany: mocks.eventSizes },
  },
}));

const { action } = await import('../routes/webhooks.compliance');

const SHOP = 's.myshopify.com';
const EMAIL = 'john@example.com';
const run = () =>
  action({ request: new Request('https://app.test/webhooks/compliance', { method: 'POST' }) } as never);

function deliver(topic: string) {
  mocks.webhook.mockResolvedValue({
    shop: SHOP,
    topic,
    payload: { shop_domain: SHOP, customer: { id: 1, email: EMAIL, phone: '555-625-1199' } },
  });
  // Each deleteMany returns a marker so the transaction's contents can be checked.
  mocks.sessions.mockReturnValue('sessions');
  mocks.rules.mockReturnValue('rules');
  mocks.states.mockReturnValue('states');
  mocks.eventDays.mockReturnValue('eventDays');
  mocks.eventSizes.mockReturnValue('eventSizes');
  mocks.transaction.mockResolvedValue([]);
}

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('compliance webhooks', () => {
  it('shop/redact deletes every row for the shop in one transaction', async () => {
    deliver('SHOP_REDACT');
    mocks.sessionCount.mockResolvedValue(0);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await run();

    expect(res.status).toBe(200);
    expect(mocks.sessionCount).toHaveBeenCalledWith({ where: { shop: SHOP, isOnline: false } });
    for (const del of [mocks.rules, mocks.states, mocks.eventDays, mocks.eventSizes, mocks.sessions]) {
      expect(del).toHaveBeenCalledWith({ where: { shop: SHOP } });
    }
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect([...mocks.transaction.mock.calls[0][0]].sort()).toEqual(
      ['eventDays', 'eventSizes', 'rules', 'sessions', 'states'],
    );
  });

  it('shop/redact keeps the data of a shop that installed the app again', async () => {
    deliver('SHOP_REDACT');
    mocks.sessionCount.mockResolvedValue(1);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await run();

    expect(res.status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.rules).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toContain(`shop/redact for ${SHOP} skipped: the app is installed again`);
  });

  it.each(['CUSTOMERS_REDACT', 'CUSTOMERS_DATA_REQUEST'])(
    '%s touches no data and never logs the payload',
    async (topic) => {
      deliver(topic);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});

      const res = await run();

      expect(res.status).toBe(200);
      expect(mocks.sessionCount).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain(EMAIL);
    },
  );

  it('lets the 401 from a bad HMAC through', async () => {
    const unauthorized = new Response(null, { status: 401 });
    mocks.webhook.mockRejectedValue(unauthorized);

    await expect(run()).rejects.toBe(unauthorized);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
