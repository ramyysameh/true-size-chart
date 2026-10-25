import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminError, type AdminClient } from './admin.server';
import type { Subscription } from './entitlement';
import {
  checkEntitlement,
  LEASE_MS,
  REFRESH_LEASE,
  refreshEntitlements,
  refreshShopContext,
  runRefresh,
  startEntitlementRefresher,
  type EntitlementDeps,
} from './entitlement.server';
import { acquireLease } from './lease.server';
import { fakeLeaseDb } from './lease.testing';
import { PartnerError } from './partner.server';

const SHOP = 'cool-shop.myshopify.com';
const SHOP_GID = 'gid://shopify/Shop/42';
const INSTALL = 'gid://shopify/AppInstallation/7';
const NOW = new Date('2026-10-24T12:00:00Z');
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const SUB: Subscription = {
  billingPeriod: 'EVERY_30_DAYS',
  cancelAtEndOfCycle: false,
  trialEndsAt: '2026-11-07T00:00:00.000Z',
  currentBillingCycle: { startTime: '2026-10-24T00:00:00Z', endTime: '2026-11-23T00:00:00Z' },
  items: [{ handle: 'pro' }],
};

type Row = Record<string, unknown> & { shop: string };

/** In-memory stand-in for the `shopState` delegate, enough for entitlement.server. */
function fakeDb(rows: Row[] = []) {
  const table = new Map<string, Row>(rows.map((r) => [r.shop, { ...r }]));
  const defaults = (shop: string): Row => ({
    shop,
    timezone: null,
    shopGid: null,
    installationId: null,
    planHandle: null,
    billingPeriod: null,
    trialEndsAt: null,
    entitled: false,
    entitlementCheckedAt: null,
    entitlementWritten: null,
  });
  const shopState = {
    async findUnique({ where }: { where: { shop: string } }) {
      const row = table.get(where.shop);
      return row ? { ...row } : null;
    },
    async upsert({ where, create, update }: { where: { shop: string }; create: Row; update: Partial<Row> }) {
      const existing = table.get(where.shop);
      const next = existing ? { ...existing, ...update } : { ...defaults(where.shop), ...create };
      table.set(where.shop, next);
      return { ...next };
    },
    async update({ where, data }: { where: { shop: string }; data: Partial<Row> }) {
      const existing = table.get(where.shop);
      if (!existing) throw new Error('Record not found');
      const next = { ...existing, ...data };
      table.set(where.shop, next);
      return { ...next };
    },
    async findMany({
      where,
    }: {
      where: { entitled: boolean; entitlementCheckedAt: { lt: Date } };
      select?: unknown;
    }) {
      return [...table.values()]
        .filter(
          (r) =>
            r.entitled === where.entitled &&
            r.entitlementCheckedAt instanceof Date &&
            r.entitlementCheckedAt < where.entitlementCheckedAt.lt,
        )
        .map((r) => ({ shop: r.shop }));
    },
  };
  return { db: { shopState } as unknown as EntitlementDeps['db'], table };
}

interface Call {
  query: string;
  variables?: Record<string, unknown>;
}

function fakeAdmin(
  opts: { userErrors?: { field: string[]; message: string }[]; installation?: string } = {},
) {
  const calls: Call[] = [];
  const admin: AdminClient = {
    async graphql(query, options) {
      calls.push({ query, variables: options?.variables });
      if (query.includes('ShopContext')) {
        return new Response(
          JSON.stringify({
            data: {
              shop: { id: SHOP_GID, myshopifyDomain: SHOP, ianaTimezone: 'America/Los_Angeles' },
              currentAppInstallation: { id: opts.installation ?? INSTALL },
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: { metafieldsSet: { metafields: [], userErrors: opts.userErrors ?? [] } },
        }),
      );
    },
  };
  const writes = () => calls.filter((c) => c.query.includes('SetEntitlement'));
  return { admin, calls, writes };
}

function known(extra: Partial<Row> = {}): Row {
  return {
    shop: SHOP,
    timezone: 'America/Los_Angeles',
    shopGid: SHOP_GID,
    installationId: INSTALL,
    planHandle: null,
    billingPeriod: null,
    trialEndsAt: null,
    entitled: false,
    entitlementCheckedAt: null,
    entitlementWritten: null,
    ...extra,
  };
}

function deps(db: EntitlementDeps['db'], fetchSubscription: EntitlementDeps['fetchSubscription']) {
  return { db, fetchSubscription, now: () => NOW };
}

beforeEach(() => {
  vi.stubEnv('ENTITLEMENT_OVERRIDE', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('checkEntitlement', () => {
  it('answers from the cache for an active shop checked under 5 min ago, with no calls', async () => {
    const { db } = fakeDb([known({ entitled: true, entitlementCheckedAt: ago(60_000), entitlementWritten: true })]);
    const { admin, calls } = fakeAdmin();
    const fetchSubscription = vi.fn();

    const result = await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) });

    expect(result).toEqual({ active: true, source: 'cache' });
    expect(calls).toHaveLength(0);
    expect(fetchSubscription).not.toHaveBeenCalled();
  });

  it('asks the Partner API on every call for an inactive shop', async () => {
    const { db } = fakeDb([known({ entitled: false, entitlementCheckedAt: ago(60_000), entitlementWritten: false })]);
    const { admin } = fakeAdmin();
    const fetchSubscription = vi.fn().mockResolvedValue(null);

    expect(await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).toEqual({ active: false });
    expect(await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).toEqual({ active: false });
    expect(fetchSubscription).toHaveBeenCalledTimes(2);
    expect(fetchSubscription).toHaveBeenCalledWith(SHOP_GID);
  });

  it('writes tsc.active = "true" once on false -> true, and nothing on a second fresh check', async () => {
    const { db, table } = fakeDb([known({ entitled: false, entitlementWritten: false })]);
    const { admin, writes } = fakeAdmin();
    const fetchSubscription = vi.fn().mockResolvedValue(SUB);

    const first = await checkEntitlement(admin, SHOP, { fresh: true, deps: deps(db, fetchSubscription) });
    expect(first).toEqual({ active: true, source: 'partner' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].variables).toEqual({
      metafields: [{ ownerId: INSTALL, namespace: 'tsc', key: 'active', type: 'boolean', value: 'true' }],
    });

    const row = table.get(SHOP)!;
    expect(row.entitled).toBe(true);
    expect(row.entitlementWritten).toBe(true);
    expect(row.planHandle).toBe('pro');
    expect(row.billingPeriod).toBe('EVERY_30_DAYS');
    expect(row.trialEndsAt).toEqual(new Date('2026-11-07T00:00:00.000Z'));
    expect(row.entitlementCheckedAt).toEqual(NOW);

    await checkEntitlement(admin, SHOP, { fresh: true, deps: deps(db, fetchSubscription) });
    expect(fetchSubscription).toHaveBeenCalledTimes(2);
    expect(writes()).toHaveLength(1);
  });

  it('writes an explicit "false" for a new shop with no subscription', async () => {
    const { db, table } = fakeDb([known()]);
    const { admin, writes } = fakeAdmin();

    expect(await checkEntitlement(admin, SHOP, { deps: deps(db, vi.fn().mockResolvedValue(null)) })).toEqual({
      active: false,
    });
    expect(writes()).toHaveLength(1);
    expect((writes()[0].variables as { metafields: { value: string }[] }).metafields[0].value).toBe('false');
    expect(table.get(SHOP)!.entitlementWritten).toBe(false);
    expect(table.get(SHOP)!.entitlementCheckedAt).toEqual(NOW);
  });

  it('runs ShopContext when the shop row is missing and stores gid, installation and timezone', async () => {
    const { db, table } = fakeDb();
    const { admin, calls } = fakeAdmin();
    const fetchSubscription = vi.fn().mockResolvedValue(SUB);

    await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) });

    expect(calls[0].query).toContain('query ShopContext');
    expect(fetchSubscription).toHaveBeenCalledWith(SHOP_GID);
    const row = table.get(SHOP)!;
    expect(row.shopGid).toBe(SHOP_GID);
    expect(row.installationId).toBe(INSTALL);
    expect(row.timezone).toBe('America/Los_Angeles');
  });

  it('skips ShopContext when gid, installation and timezone are known', async () => {
    const { db } = fakeDb([known({ entitlementWritten: true })]);
    const { admin, calls } = fakeAdmin();
    await checkEntitlement(admin, SHOP, { deps: deps(db, vi.fn().mockResolvedValue(SUB)) });
    expect(calls.some((c) => c.query.includes('ShopContext'))).toBe(false);
  });

  it('lets a failing ShopContext propagate when the installation is unknown', async () => {
    const { db } = fakeDb();
    const admin: AdminClient = {
      async graphql() {
        return new Response(JSON.stringify({ errors: [{ message: 'Access denied' }] }));
      },
    };
    const fetchSubscription = vi.fn();
    await expect(checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).rejects.toBeInstanceOf(
      AdminError,
    );
    expect(fetchSubscription).not.toHaveBeenCalled();
  });

  it('returns grace on a PartnerError when the last confirmation was 2 h ago', async () => {
    const { db, table } = fakeDb([known({ entitled: true, entitlementCheckedAt: ago(2 * HOUR), entitlementWritten: true })]);
    const { admin, writes } = fakeAdmin();
    const fetchSubscription = vi.fn().mockRejectedValue(new PartnerError('Partner API throttled (HTTP 429)'));

    expect(await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).toEqual({
      active: true,
      source: 'grace',
    });
    expect(writes()).toHaveLength(0);
    expect(table.get(SHOP)!.entitlementCheckedAt).toEqual(ago(2 * HOUR));
    expect(table.get(SHOP)!.entitled).toBe(true);
  });

  it('throws a PartnerError for a shop never confirmed, writing nothing', async () => {
    const { db, table } = fakeDb([known()]);
    const { admin, writes } = fakeAdmin();
    const fetchSubscription = vi.fn().mockRejectedValue(new PartnerError('Partner API returned HTTP 503'));

    await expect(checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).rejects.toBeInstanceOf(
      PartnerError,
    );
    expect(writes()).toHaveLength(0);
    expect(table.get(SHOP)!.entitlementWritten).toBeNull();
  });

  it('throws past the 24 h grace window', async () => {
    const { db } = fakeDb([known({ entitled: true, entitlementCheckedAt: ago(25 * HOUR), entitlementWritten: true })]);
    const { admin } = fakeAdmin();
    const fetchSubscription = vi.fn().mockRejectedValue(new PartnerError('down'));
    await expect(checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).rejects.toBeInstanceOf(
      PartnerError,
    );
  });

  it('throws AdminError when SetEntitlement returns userErrors, leaving entitlementWritten unchanged', async () => {
    const { db, table } = fakeDb([known()]);
    const { admin } = fakeAdmin({ userErrors: [{ field: ['metafields', '0'], message: 'Owner not found' }] });
    await expect(
      checkEntitlement(admin, SHOP, { deps: deps(db, vi.fn().mockResolvedValue(SUB)) }),
    ).rejects.toBeInstanceOf(AdminError);
    expect(table.get(SHOP)!.entitlementWritten).toBeNull();
  });

  it('gives active from the override outside production, with no calls and no writes', async () => {
    vi.stubEnv('ENTITLEMENT_OVERRIDE', 'active');
    vi.stubEnv('NODE_ENV', 'test');
    const { db, table } = fakeDb();
    const { admin, calls } = fakeAdmin();
    const fetchSubscription = vi.fn();

    expect(await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).toEqual({
      active: true,
      source: 'override',
    });
    expect(calls).toHaveLength(0);
    expect(fetchSubscription).not.toHaveBeenCalled();
    expect(table.size).toBe(0);
  });

  it('ignores the override in production', async () => {
    vi.stubEnv('ENTITLEMENT_OVERRIDE', 'active');
    vi.stubEnv('NODE_ENV', 'production');
    const { db } = fakeDb([known({ entitlementWritten: false })]);
    const { admin } = fakeAdmin();
    const fetchSubscription = vi.fn().mockResolvedValue(null);

    expect(await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) })).toEqual({ active: false });
    expect(fetchSubscription).toHaveBeenCalledTimes(1);
  });
});

describe('refreshEntitlements', () => {
  it('turns off a shop checked 7 h ago whose subscription is gone, and skips one checked 1 h ago', async () => {
    const STALE = 'stale.myshopify.com';
    const FRESH = 'fresh.myshopify.com';
    const { db, table } = fakeDb([
      known({ shop: STALE, entitled: true, entitlementCheckedAt: ago(7 * HOUR), entitlementWritten: true }),
      known({
        shop: FRESH,
        shopGid: 'gid://shopify/Shop/43',
        entitled: true,
        entitlementCheckedAt: ago(1 * HOUR),
        entitlementWritten: true,
      }),
    ]);
    const { admin, writes } = fakeAdmin();
    const fetchSubscription = vi.fn().mockResolvedValue(null);
    const adminFor = vi.fn().mockResolvedValue(admin);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await refreshEntitlements({ db, fetchSubscription, now: () => NOW, adminFor, sleep });

    expect(result).toEqual({ checked: 1, changed: 1 });
    expect(adminFor).toHaveBeenCalledTimes(1);
    expect(adminFor).toHaveBeenCalledWith(STALE);
    expect(fetchSubscription).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(1);
    expect((writes()[0].variables as { metafields: { value: string }[] }).metafields[0].value).toBe('false');
    expect(table.get(STALE)!.entitled).toBe(false);
    expect(table.get(STALE)!.entitlementWritten).toBe(false);
    expect(table.get(FRESH)!.entitled).toBe(true);
  });

  it('spaces shops at least 300 ms apart and keeps going after one shop fails', async () => {
    const shops = ['a', 'b', 'c'].map((s, i) =>
      known({
        shop: `${s}.myshopify.com`,
        shopGid: `gid://shopify/Shop/${i}`,
        entitled: true,
        entitlementCheckedAt: ago(7 * HOUR),
        entitlementWritten: true,
      }),
    );
    const { db } = fakeDb(shops);
    const { admin } = fakeAdmin();
    const fetchSubscription = vi.fn().mockResolvedValue(SUB);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adminFor = vi
      .fn()
      .mockRejectedValueOnce(new Error('No offline session'))
      .mockResolvedValue(admin);

    const result = await refreshEntitlements({ db, fetchSubscription, now: () => NOW, adminFor, sleep });

    expect(result).toEqual({ checked: 3, changed: 0 });
    expect(sleep).toHaveBeenCalledTimes(2);
    for (const call of sleep.mock.calls) expect(call[0]).toBeGreaterThanOrEqual(300);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0].join(' '))).toContain('a.myshopify.com');
  });
});

describe('runRefresh', () => {
  function staleShop() {
    return fakeDb([
      known({ shop: SHOP, entitled: true, entitlementCheckedAt: ago(7 * HOUR), entitlementWritten: true }),
    ]);
  }

  it('lets only one of two concurrent holders refresh', async () => {
    const { db } = staleShop();
    const { admin } = fakeAdmin();
    const { db: lease } = fakeLeaseDb();
    const fetchSubscription = vi.fn().mockResolvedValue(SUB);
    const adminFor = vi.fn().mockResolvedValue(admin);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const base = { db, fetchSubscription, now: () => NOW, adminFor, sleep, lease };

    await Promise.all([runRefresh({ ...base, holder: 'a' }), runRefresh({ ...base, holder: 'b' })]);

    expect(fetchSubscription).toHaveBeenCalledTimes(1);
  });

  it('releases the lease after a run, and also after a failed one', async () => {
    const { db } = staleShop();
    const { admin } = fakeAdmin();
    const { db: lease, rows } = fakeLeaseDb();
    const fetchSubscription = vi.fn().mockRejectedValue(new Error('partner down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = {
      db,
      fetchSubscription,
      now: () => NOW,
      adminFor: vi.fn().mockResolvedValue(admin),
      sleep: vi.fn().mockResolvedValue(undefined),
      lease,
    };

    await runRefresh({ ...base, holder: 'a' });

    expect(rows.get(REFRESH_LEASE)).toMatchObject({ holder: 'a', lockedUntil: NOW });
    expect(await acquireLease(lease, REFRESH_LEASE, 'b', LEASE_MS, new Date(NOW.getTime() + 1))).toBe(true);
  });

  it('resolves, logs once and refreshes nothing when the lease query rejects', async () => {
    const { db } = staleShop();
    const fetchSubscription = vi.fn().mockResolvedValue(SUB);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lease = {
      jobLease: {
        updateMany: vi.fn().mockRejectedValue(new Error('db down')),
        create: vi.fn(),
      },
    } as unknown as Parameters<typeof runRefresh>[0]['lease'];

    await expect(
      runRefresh({ db, fetchSubscription, now: () => NOW, lease, holder: 'a' }),
    ).resolves.toBeUndefined();

    expect(fetchSubscription).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0].join(' '))).toContain('db down');
  });
});

describe('startEntitlementRefresher', () => {
  it('is a no-op under Vitest', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    startEntitlementRefresher();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect((globalThis as { __tscRefresher?: unknown }).__tscRefresher).toBeUndefined();
  });
});

describe('refreshShopContext', () => {
  const INSTALL_2 = 'gid://shopify/AppInstallation/2';

  it('stores a new installation id and clears both the written flag and the check time', async () => {
    const { db, table } = fakeDb([
      known({ installationId: 'gid://shopify/AppInstallation/1', entitled: true, entitlementWritten: true, entitlementCheckedAt: ago(60_000) }),
    ]);
    const { admin } = fakeAdmin({ installation: INSTALL_2 });

    await refreshShopContext(admin, SHOP, { db });

    const row = table.get(SHOP)!;
    expect(row.installationId).toBe(INSTALL_2);
    expect(row.shopGid).toBe(SHOP_GID);
    expect(row.timezone).toBe('America/Los_Angeles');
    expect(row.entitlementWritten).toBeNull();
    expect(row.entitlementCheckedAt).toBeNull();
  });

  it('keeps the check time when the installation id is unchanged, but still clears the written flag', async () => {
    const checked = ago(60_000);
    const { db, table } = fakeDb([known({ entitled: true, entitlementWritten: true, entitlementCheckedAt: checked })]);
    const { admin } = fakeAdmin();

    await refreshShopContext(admin, SHOP, { db });

    const row = table.get(SHOP)!;
    expect(row.installationId).toBe(INSTALL);
    expect(row.entitlementWritten).toBeNull();
    expect(row.entitlementCheckedAt).toEqual(checked);
  });

  it('creates the row when the shop has none', async () => {
    const { db, table } = fakeDb();
    const { admin } = fakeAdmin();

    await refreshShopContext(admin, SHOP, { db });

    expect(table.get(SHOP)).toMatchObject({
      shop: SHOP,
      shopGid: SHOP_GID,
      installationId: INSTALL,
      timezone: 'America/Los_Angeles',
      entitlementWritten: null,
      entitlementCheckedAt: null,
    });
  });

  it('resolves and logs once, without a response body, when the query fails', async () => {
    const { db, table } = fakeDb([known()]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin: AdminClient = {
      async graphql() {
        return new Response(JSON.stringify({ errors: [{ message: 'Access denied' }], secret: 'tok_123' }));
      },
    };

    await expect(refreshShopContext(admin, SHOP, { db })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0].join(' '));
    expect(line).toContain(`Shop context refresh for ${SHOP} failed (`);
    expect(line).not.toContain('tok_123');
    expect(table.get(SHOP)).toEqual(known());
  });

  it('resolves and logs once when the database write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = {
      shopState: {
        findUnique: vi.fn().mockRejectedValue(new Error('db down')),
      },
    } as unknown as EntitlementDeps['db'];

    await expect(refreshShopContext(fakeAdmin().admin, SHOP, { db })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('after a reinstall the next check writes tsc.active once to the new installation (Review Focus 1)', async () => {
    const { db } = fakeDb([
      known({
        installationId: 'gid://shopify/AppInstallation/1',
        entitled: true,
        entitlementWritten: true,
        entitlementCheckedAt: ago(60_000),
      }),
    ]);
    const { admin, writes } = fakeAdmin({ installation: INSTALL_2 });
    const fetchSubscription = vi.fn().mockResolvedValue(SUB);

    await refreshShopContext(admin, SHOP, { db });
    const result = await checkEntitlement(admin, SHOP, { deps: deps(db, fetchSubscription) });

    expect(result).toEqual({ active: true, source: 'partner' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].variables).toEqual({
      metafields: [{ ownerId: INSTALL_2, namespace: 'tsc', key: 'active', type: 'boolean', value: 'true' }],
    });
  });
});
