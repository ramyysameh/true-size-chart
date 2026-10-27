import { describe, expect, it, vi } from 'vitest';
import { PROXY_PATH, PROXY_TTL_MS, probeProxy, proxyStatus, type ProxyStatus } from './proxy-check.server';

const SHOP = 's.myshopify.com';

function fakeFetch(res: { status: number; url?: string; body?: string }) {
  return vi.fn(async () => ({
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    url: res.url ?? `https://${SHOP}${PROXY_PATH}/ping`,
    text: async () => res.body ?? '',
  })) as unknown as typeof fetch;
}

describe('probeProxy', () => {
  it('asks the shop domain for the ping path, following redirects, with a timeout', async () => {
    const f = fakeFetch({ status: 200, body: 'tsc-ok' });
    await probeProxy(SHOP, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://s.myshopify.com/apps/tsc/ping');
    expect(init).toMatchObject({ redirect: 'follow' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each<[string, { status: number; url?: string; body?: string }, ProxyStatus]>([
    ['our answer', { status: 200, body: 'tsc-ok\n' }, 'ok'],
    ['some other page', { status: 200, body: '<html>' }, 'unknown'],
    ['a 404 from the proxy', { status: 404 }, 'moved'],
    ['the storefront password page', { status: 200, url: `https://${SHOP}/password`, body: '<html>' }, 'unknown'],
    ['a 500', { status: 500 }, 'unknown'],
  ])('reads %s', async (_, res, expected) => {
    expect(await probeProxy(SHOP, fakeFetch(res))).toBe(expected);
  });

  it('reads a network error as unknown', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await probeProxy(SHOP, f)).toBe('unknown');
  });
});

describe('proxyStatus', () => {
  const NOW = new Date('2026-10-25T12:00:00Z');

  function setup(stored: { proxyStatus: string | null; proxyCheckedAt: Date | null } | null, probed: ProxyStatus = 'moved') {
    const rows = new Map(stored ? [[SHOP, { shop: SHOP, ...stored }]] : []);
    const db = {
      shopState: {
        findUnique: vi.fn(async ({ where }: { where: { shop: string } }) => rows.get(where.shop) ?? null),
        upsert: vi.fn(async ({ where, create, update }: { where: { shop: string }; create: object; update: object }) => {
          const row = { ...(rows.get(where.shop) ?? create), ...update };
          rows.set(where.shop, row as never);
          return row;
        }),
      },
    };
    const probe = vi.fn(async () => probed);
    const opts = { db: db as never, now: () => NOW, probe };
    return { rows, db, probe, opts };
  }

  it('returns a fresh stored status without probing', async () => {
    const { probe, opts } = setup({ proxyStatus: 'ok', proxyCheckedAt: new Date(NOW.getTime() - 60_000) });
    expect(await proxyStatus(SHOP, opts)).toBe('ok');
    expect(probe).not.toHaveBeenCalled();
  });

  it('probes and stores when the stored status is stale', async () => {
    const { probe, rows, opts } = setup({ proxyStatus: 'ok', proxyCheckedAt: new Date(NOW.getTime() - PROXY_TTL_MS - 1) });
    expect(await proxyStatus(SHOP, opts)).toBe('moved');
    expect(probe).toHaveBeenCalledWith(SHOP);
    expect(rows.get(SHOP)).toMatchObject({ proxyStatus: 'moved', proxyCheckedAt: NOW });
  });

  it('probes a shop that was never checked', async () => {
    const { probe, rows, opts } = setup(null, 'ok');
    expect(await proxyStatus(SHOP, opts)).toBe('ok');
    expect(probe).toHaveBeenCalledOnce();
    expect(rows.get(SHOP)).toMatchObject({ proxyStatus: 'ok', proxyCheckedAt: NOW });
  });

  it('probes on recheck even when the stored status is fresh', async () => {
    const { probe, opts } = setup({ proxyStatus: 'moved', proxyCheckedAt: new Date(NOW.getTime() - 60_000) }, 'ok');
    expect(await proxyStatus(SHOP, { ...opts, recheck: true })).toBe('ok');
    expect(probe).toHaveBeenCalledOnce();
  });
});
