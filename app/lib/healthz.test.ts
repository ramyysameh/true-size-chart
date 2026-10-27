// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock('../db.server', () => ({ default: { $queryRaw: mocks.queryRaw } }));

const { loader } = await import('../routes/healthz');

afterEach(() => vi.resetAllMocks());

describe('/healthz', () => {
  it('answers ok when the database answers', async () => {
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await loader();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('answers 503 without details when the database is down', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const res = await loader();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('db');
  });
});
