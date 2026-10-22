// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  listCharts: vi.fn(),
  syncProducts: vi.fn(),
}));

vi.mock('../shopify.server', () => ({ authenticate: { webhook: mocks.webhook } }));
vi.mock('../db.server', () => ({
  default: { assignmentRule: { findMany: mocks.findMany }, shopState: { findUnique: mocks.findUnique } },
}));
vi.mock('./charts.server', () => ({ listCharts: mocks.listCharts }));
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

const charts = (...ids: string[]) => ids.map((id) => ({ id }));

afterEach(() => vi.resetAllMocks());

describe('products webhook', () => {
  it('makes no Admin call when the shop has no rules, and returns 200', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.syncProducts).not.toHaveBeenCalled();
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it('syncs just the webhook product with the shop rules', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([ruleRow]);
    mocks.findUnique.mockResolvedValue({ shop: 's.myshopify.com', rulesManaged: true });
    mocks.listCharts.mockResolvedValue(charts('chart-tee'));
    mocks.syncProducts.mockResolvedValue({ checked: 1, set: 1, unset: 0 });
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.syncProducts).toHaveBeenCalledWith(
      admin,
      [{ id: 'r1', chartId: 'chart-tee', type: 'product_type', value: 'tees', priority: 0 }],
      { productId: PRODUCT, managed: true },
    );
  });

  it('unsets the product when a managed shop has no rules left', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue({ shop: 's.myshopify.com', rulesManaged: true });
    mocks.syncProducts.mockResolvedValue({ checked: 1, set: 0, unset: 1 });
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.syncProducts).toHaveBeenCalledWith(admin, [], { productId: PRODUCT, managed: true });
  });

  it('drops a rule whose chart no longer exists', async () => {
    webhookFor();
    const gone = { ...ruleRow, id: 'r0', chartId: 'chart-gone', priority: -1 };
    mocks.findMany.mockResolvedValue([gone, ruleRow]);
    mocks.findUnique.mockResolvedValue({ shop: 's.myshopify.com', rulesManaged: true });
    mocks.listCharts.mockResolvedValue(charts('chart-tee'));
    mocks.syncProducts.mockResolvedValue({ checked: 1, set: 1, unset: 0 });
    await run();
    expect(mocks.syncProducts).toHaveBeenCalledWith(
      admin,
      [{ id: 'r1', chartId: 'chart-tee', type: 'product_type', value: 'tees', priority: 0 }],
      { productId: PRODUCT, managed: true },
    );
  });

  it('still returns 200 when the sync throws', async () => {
    webhookFor();
    mocks.findMany.mockResolvedValue([ruleRow]);
    mocks.findUnique.mockResolvedValue({ shop: 's.myshopify.com', rulesManaged: true });
    mocks.listCharts.mockResolvedValue(charts('chart-tee'));
    mocks.syncProducts.mockRejectedValue(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run();
    expect(res.status).toBe(200);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
