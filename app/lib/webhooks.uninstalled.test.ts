// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  sessions: vi.fn(),
  rules: vi.fn(),
  states: vi.fn(),
}));

vi.mock('../shopify.server', () => ({ authenticate: { webhook: mocks.webhook } }));
vi.mock('../db.server', () => ({
  default: {
    session: { deleteMany: mocks.sessions },
    assignmentRule: { deleteMany: mocks.rules },
    shopState: { deleteMany: mocks.states },
  },
}));

const { action } = await import('../routes/webhooks.app.uninstalled');

const SHOP = 's.myshopify.com';
const run = () =>
  action({ request: new Request('https://app.test/webhooks/app/uninstalled', { method: 'POST' }) } as never);

afterEach(() => vi.resetAllMocks());

describe('app/uninstalled webhook', () => {
  it('deletes the shop rules and state even when no session is left', async () => {
    mocks.webhook.mockResolvedValue({ shop: SHOP, session: undefined, topic: 'APP_UNINSTALLED' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.rules).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(mocks.states).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(mocks.sessions).not.toHaveBeenCalled();
  });

  it('also deletes the sessions when one exists', async () => {
    mocks.webhook.mockResolvedValue({ shop: SHOP, session: { id: 'x' }, topic: 'APP_UNINSTALLED' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await run();
    expect(mocks.sessions).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(mocks.rules).toHaveBeenCalled();
    expect(mocks.states).toHaveBeenCalled();
  });
});
