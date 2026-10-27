// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), check: vi.fn(), redirect: vi.fn() }));

vi.mock('../shopify.server', () => ({ authenticate: { admin: mocks.admin } }));
vi.mock('../lib/entitlement.server', () => ({ checkEntitlement: mocks.check }));

const { authenticatePro } = await import('./gate.server');

const SHOP = 'cool-shop.myshopify.com';
const ADMIN = { graphql: vi.fn() };
const request = () => new Request('https://app.test/app/charts/x', { method: 'POST' });

function setup() {
  mocks.redirect.mockImplementation(
    (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
  );
  mocks.admin.mockResolvedValue({ admin: ADMIN, session: { shop: SHOP }, redirect: mocks.redirect });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('authenticatePro', () => {
  it('throws a redirect to the plan page for an inactive shop', async () => {
    delete process.env.SHOPIFY_APP_HANDLE;
    setup();
    mocks.check.mockResolvedValue({ active: false });
    const err = await authenticatePro(request()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).headers.get('Location')).toBe(
      'https://admin.shopify.com/store/cool-shop/charges/true-size-chart/pricing_plans',
    );
    expect(mocks.redirect).toHaveBeenCalledWith(expect.any(String), { target: '_top' });
    expect(mocks.check).toHaveBeenCalledWith(ADMIN, SHOP, { fresh: false });
  });

  it('passes fresh through to the entitlement check', async () => {
    setup();
    mocks.check.mockResolvedValue({ active: true });
    await authenticatePro(request(), { fresh: true });
    expect(mocks.check).toHaveBeenCalledWith(ADMIN, SHOP, { fresh: true });
  });

  it('resolves with the auth context for an active shop', async () => {
    setup();
    mocks.check.mockResolvedValue({ active: true });
    const ctx = await authenticatePro(request());
    expect(ctx.admin).toBe(ADMIN);
    expect(ctx.session.shop).toBe(SHOP);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('rejects with the same error when the entitlement check fails', async () => {
    setup();
    const err = new Error('partner down');
    mocks.check.mockRejectedValue(err);
    await expect(authenticatePro(request())).rejects.toBe(err);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('admin actions are gated', () => {
  const routesDir = join(__dirname, '..', 'routes');
  const files = readdirSync(routesDir).filter((f) => /^app\..*\.tsx$/.test(f));

  it('finds route files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const src = readFileSync(join(routesDir, file), 'utf8');
    const start = src.search(/export const action\b/);
    if (start === -1) continue;
    it(`${file} authenticates its action with authenticatePro`, () => {
      const rest = src.slice(start + 1);
      const next = rest.search(/\bexport\b/);
      const body = next === -1 ? rest : rest.slice(0, next);
      expect(body).toContain('authenticatePro(request');
      expect(body).not.toContain('authenticate.admin(');
    });
  }
});
