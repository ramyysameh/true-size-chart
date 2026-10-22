// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  findMany: vi.fn(),
  syncProducts: vi.fn(),
}));

vi.mock('../shopify.server', () => ({ authenticate: { webhook: mocks.webhook } }));
vi.mock('../db.server', () => ({ default: { assignmentRule: { findMany: mocks.findMany } } }));
vi.mock('./assign.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assign.server')>()),
  syncProducts: mocks.syncProducts,
}));

const { action } = await import('../routes/webhooks.products');

const PRODUCT = 'gid://shopify/Product/7';
const admin = { graphql: vi.fn() };

function webhookFor(productId: string = PRODUCT) {
  mocks.webhook.mockResolvedValue({
    shop: 's.myshopify.com',
    topic: 'PRODUCTS_UPDATE',
    admin,
    payload: { admin_graphql_api_id: productId },
  });
}

const run = () =>
  action({ request: new Request('https://app.test/webhooks/products', { method: 'POST' }) } as never);

const ruleRow = {
  id: 'r1',
  shop: 's.myshopify.com',
  chartId: 'chart-tee',
  type: 'product_type',
  value: 'tees',
  label: 'tees',
  priority: 0,
  createdAt: new Date(0),
};

afterEach(() => vi.resetAllMocks());

describe('products webhook', () => {
  it('makes no Admin call when the shop has no rules, and returns 200', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([]);
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.syncProducts).not.toHaveBeenCalled();
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it('syncs just the webhook product with the shop rules', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([ruleRow]);
    mocks.syncProducts.mockResolvedValue({ checked: 1, set: 1, unset: 0 });
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.syncProducts).toHaveBeenCalledWith(
      admin,
      [{ id: 'r1', chartId: 'chart-tee', type: 'product_type', value: 'tees', priority: 0 }],
      { productId: PRODUCT },
    );
  });

  it('still returns 200 when the sync throws', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([ruleRow]);
    mocks.syncProducts.mockRejectedValue(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run();
    expect(res.status).toBe(200);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
