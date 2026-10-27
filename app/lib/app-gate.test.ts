// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), check: vi.fn(), redirect: vi.fn() }));

vi.mock('../shopify.server', () => ({ authenticate: { admin: mocks.admin } }));
vi.mock('../lib/entitlement.server', () => ({ checkEntitlement: mocks.check }));

const { loader } = await import('../routes/app');

const SHOP = 'cool-shop.myshopify.com';
const run = (url = 'https://app.test/app') => loader({ request: new Request(url) } as never);

function setup() {
  mocks.redirect.mockImplementation(
    (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
  );
  mocks.admin.mockResolvedValue({ admin: {}, session: { shop: SHOP }, redirect: mocks.redirect });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('the app paywall gate', () => {
  it('redirects an inactive shop to the plan page, out of the iframe', async () => {
    vi.stubEnv('SHOPIFY_APP_HANDLE', '');
    delete process.env.SHOPIFY_APP_HANDLE;
    setup();
    mocks.check.mockResolvedValue({ active: false });
    const res = await run().catch((e: unknown) => e);
    expect(mocks.redirect).toHaveBeenCalledWith(
      'https://admin.shopify.com/store/cool-shop/charges/true-size-chart/pricing_plans',
      { target: '_top' },
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).headers.get('Location')).toContain('/charges/true-size-chart/pricing_plans');
  });

  it('skips the cache only when plan_handle is present', async () => {
    setup();
    mocks.check.mockResolvedValue({ active: true });
    await run('https://app.test/app?plan_handle=pro');
    expect(mocks.check).toHaveBeenLastCalledWith({}, SHOP, { fresh: true });
    await run('https://app.test/app');
    expect(mocks.check).toHaveBeenLastCalledWith({}, SHOP, { fresh: false });
  });

  it('returns the api key for an active shop without redirecting', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'key-123');
    setup();
    mocks.check.mockResolvedValue({ active: true });
    expect(await run()).toEqual({ apiKey: 'key-123' });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('rejects when the entitlement check fails, without redirecting', async () => {
    setup();
    const err = new Error('partner down');
    mocks.check.mockRejectedValue(err);
    await expect(run()).rejects.toBe(err);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
