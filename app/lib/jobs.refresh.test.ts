// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runRefresh: vi.fn(), prune: vi.fn() }));

vi.mock('../db.server', () => ({ default: { tag: 'db' } }));
vi.mock('./entitlement.server', () => ({ runRefresh: mocks.runRefresh }));
vi.mock('./rate.server', () => ({ pruneEventRates: mocks.prune }));

const { loader } = await import('../routes/jobs.refresh-entitlements');

const SECRET = 'cron-secret-for-tests';
const call = (auth?: string) =>
  loader({
    request: new Request('https://app.test/jobs/refresh-entitlements', auth ? { headers: { Authorization: auth } } : {}),
  } as never);

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('/jobs/refresh-entitlements (Vercel cron)', () => {
  it('runs the leased refresh and prunes rate windows for the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    mocks.runRefresh.mockResolvedValue(undefined);
    mocks.prune.mockResolvedValue(3);

    const res = await call(`Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pruned: 3 });
    const [deps] = mocks.runRefresh.mock.calls[0];
    expect(deps.lease).toEqual({ tag: 'db' });
    expect(deps.db).toEqual({ tag: 'db' });
    expect(typeof deps.holder).toBe('string');
    expect(mocks.prune).toHaveBeenCalledWith({ tag: 'db' }, expect.any(Date));
  });

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer nope'],
    ['the secret without Bearer', SECRET],
  ])('answers 401 to %s and runs nothing', async (_, auth) => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const res = await call(auth);
    expect(res.status).toBe(401);
    expect(mocks.runRefresh).not.toHaveBeenCalled();
    expect(mocks.prune).not.toHaveBeenCalled();
  });

  it('answers 401 when CRON_SECRET is not configured, even to "Bearer "', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(mocks.runRefresh).not.toHaveBeenCalled();
  });
});
