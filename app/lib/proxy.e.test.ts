// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appProxy: vi.fn(),
  findShopState: vi.fn(),
  recordEvent: vi.fn(),
}));

vi.mock('../shopify.server', () => ({ authenticate: { public: { appProxy: mocks.appProxy } } }));
vi.mock('../db.server', () => ({
  default: {
    shopState: { findUnique: mocks.findShopState },
    eventDaily: {},
    eventSizeDaily: {},
  },
}));
vi.mock('./events.server', () => ({ recordEvent: mocks.recordEvent, MAX_SIZES_PER_DAY: 30 }));

const { action, loader } = await import('../routes/proxy.e');
const db = (await import('../db.server')).default;

const SHOP = 's.myshopify.com';
const post = (body: string) =>
  action({
    request: new Request('https://app.test/proxy/e?shop=s.myshopify.com&signature=x', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
    }),
  } as never);

afterEach(() => vi.resetAllMocks());

describe('app proxy event route', () => {
  it('records a valid event under the session shop and answers 204', async () => {
    mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
    mocks.findShopState.mockResolvedValue({ shop: SHOP, timezone: null });
    mocks.recordEvent.mockResolvedValue(undefined);
    const res = await post('{"e":"complete","c":"tee","s":"M","height":180}');
    expect(res.status).toBe(204);
    expect(mocks.recordEvent).toHaveBeenCalledTimes(1);
    const [passedDb, shop, ev, date] = mocks.recordEvent.mock.calls[0];
    expect(passedDb).toBe(db);
    expect(shop).toBe(SHOP);
    expect(ev).toEqual({ e: 'complete', c: 'tee', s: 'M' });
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the shop time zone for the day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T06:30:00Z'));
    try {
      mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
      mocks.findShopState.mockResolvedValue({ shop: SHOP, timezone: 'America/Los_Angeles' });
      mocks.recordEvent.mockResolvedValue(undefined);
      await post('{"e":"open","c":"tee"}');
      expect(mocks.findShopState).toHaveBeenCalledWith({ where: { shop: SHOP }, select: { timezone: true } });
      expect(mocks.recordEvent.mock.calls[0][3]).toBe('2026-10-23');
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts in UTC when the shop has no state row yet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T06:30:00Z'));
    try {
      mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
      mocks.findShopState.mockResolvedValue(null);
      mocks.recordEvent.mockResolvedValue(undefined);
      await post('{"e":"open","c":"tee"}');
      expect(mocks.recordEvent.mock.calls[0][3]).toBe('2026-10-24');
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers 204 to junk without writing', async () => {
    mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
    for (const body of ['', '{', '[]', '{"e":"view","c":"tee"}', 'x'.repeat(50_000)]) {
      const res = await post(body);
      expect(res.status).toBe(204);
    }
    expect(mocks.recordEvent).not.toHaveBeenCalled();
    expect(mocks.findShopState).not.toHaveBeenCalled();
  });

  it('answers 204 to a 50 KB body without recording', async () => {
    mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
    const res = await post(JSON.stringify({ e: 'open', c: 'tee', pad: 'x'.repeat(50_000) }));
    expect(res.status).toBe(204);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
    expect(mocks.findShopState).not.toHaveBeenCalled();
  });

  it('answers 204 when the db throws', async () => {
    mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
    mocks.findShopState.mockResolvedValue(null);
    mocks.recordEvent.mockRejectedValue(new Error('db down'));
    const res = await post('{"e":"open","c":"tee"}');
    expect(res.status).toBe(204);
  });

  it('answers 204 when the shop state lookup throws', async () => {
    mocks.appProxy.mockResolvedValue({ session: { shop: SHOP } });
    mocks.findShopState.mockRejectedValue(new Error('db down'));
    const res = await post('{"e":"open","c":"tee"}');
    expect(res.status).toBe(204);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it('answers 204 without writing when there is no session (app uninstalled)', async () => {
    mocks.appProxy.mockResolvedValue({ session: undefined });
    const res = await post('{"e":"open","c":"tee"}');
    expect(res.status).toBe(204);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
    expect(mocks.findShopState).not.toHaveBeenCalled();
  });

  it("keeps the library's response on a bad signature", async () => {
    const refused = new Response('Unauthorized', { status: 400 });
    mocks.appProxy.mockRejectedValue(refused);
    await expect(post('{"e":"open","c":"tee"}')).rejects.toBe(refused);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it('drops events over the per-shop rate cap', async () => {
    const shop = 'flood.myshopify.com';
    mocks.appProxy.mockResolvedValue({ session: { shop } });
    mocks.findShopState.mockResolvedValue(null);
    mocks.recordEvent.mockResolvedValue(undefined);
    const results = [];
    for (let i = 0; i < 100; i++) results.push((await post('{"e":"open","c":"tee"}')).status);
    expect(new Set(results)).toEqual(new Set([204]));
    // Burst of 60; a few tokens may refill while the loop runs.
    expect(mocks.recordEvent.mock.calls.length).toBeGreaterThanOrEqual(60);
    expect(mocks.recordEvent.mock.calls.length).toBeLessThan(70);
  });

  it('answers 405 to GET', async () => {
    const res = await loader();
    expect(res.status).toBe(405);
  });
});
