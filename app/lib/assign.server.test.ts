import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminError, type AdminClient } from './admin.server';
import {
  claimSync,
  fetchAllFacts,
  markRulesManaged,
  requestSync,
  runSync,
  syncProducts,
  toFacts,
  type SyncDeps,
} from './assign.server';

// requestSync wires the real deps through dynamic imports; these mocks stand in for them.
const real = vi.hoisted(() => ({
  prisma: null as unknown,
  admin: vi.fn<(shop: string) => Promise<{ admin: unknown }>>(),
}));
vi.mock('../db.server', () => ({
  get default() {
    return real.prisma;
  },
}));
vi.mock('../shopify.server', () => ({ unauthenticated: { admin: real.admin } }));
import type { Rule } from './rules';

interface Call {
  query: string;
  variables?: Record<string, unknown>;
}

function node(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `gid://shopify/Product/${i}`,
    title: `P${i}`,
    productType: 'Tees',
    vendor: 'Acme',
    tags: [],
    collections: { nodes: [] },
    options: [{ name: 'Size', optionValues: [{ name: 'S' }, { name: 'M' }] }],
    sizeChart: null,
    ...over,
  };
}

/** Fake Admin API: serves product pages for ProductFacts, one product for OneProductFacts, ok for mutations. */
function fakeAdmin(
  opts: {
    pages?: unknown[][];
    one?: unknown;
    /** userErrors for the n-th mutation call (0-based); an array applies to every mutation. */
    mutationErrors?: unknown[] | ((n: number) => unknown[]);
    chartIds?: string[];
  } = {},
) {
  const calls: Call[] = [];
  let page = 0;
  let mutationNo = 0;
  const errorsFor = () => {
    const n = mutationNo++;
    const e = opts.mutationErrors;
    return typeof e === 'function' ? e(n) : (e ?? []);
  };
  const admin: AdminClient = {
    async graphql(query, options) {
      calls.push({ query, variables: options?.variables });
      let data: unknown;
      if (query.includes('query ProductFacts')) {
        const pages = opts.pages ?? [[]];
        const nodes = pages[page];
        page++;
        data = {
          products: {
            nodes,
            pageInfo: { hasNextPage: page < pages.length, endCursor: `c${page}` },
          },
        };
      } else if (query.includes('query OneProductFacts')) {
        data = { product: opts.one ?? null };
      } else if (query.includes('query Charts')) {
        data = {
          metaobjects: {
            nodes: (opts.chartIds ?? ['chart-tee']).map((id) => ({ id, handle: id, updatedAt: '', fields: [] })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      } else if (query.includes('mutation AssignCharts')) {
        data = { metafieldsSet: { metafields: [], userErrors: errorsFor() } };
      } else if (query.includes('mutation UnassignCharts')) {
        data = { metafieldsDelete: { deletedMetafields: [], userErrors: errorsFor() } };
      } else {
        throw new Error(`unexpected query ${query}`);
      }
      return new Response(JSON.stringify({ data }));
    },
  };
  const mutations = () => calls.filter((c) => c.query.includes('mutation'));
  return { admin, calls, mutations };
}

const teeRule: Rule = { id: 'r1', chartId: 'chart-tee', type: 'product_type', value: 'tees', priority: 0 };

describe('toFacts', () => {
  it('maps a product node and tolerates a missing metafield', () => {
    expect(
      toFacts(node(1, { tags: ['A'], collections: { nodes: [{ id: 'col' }] } })),
    ).toEqual({
      id: 'gid://shopify/Product/1',
      title: 'P1',
      productType: 'Tees',
      vendor: 'Acme',
      tags: ['A'],
      collectionIds: ['col'],
      options: [{ name: 'Size', values: ['S', 'M'] }],
      chartId: null,
    });
    const withoutMetafield: Record<string, unknown> = node(2);
    delete withoutMetafield.sizeChart;
    expect(toFacts(withoutMetafield).chartId).toBeNull();
    expect(toFacts(node(3, { sizeChart: { value: 'chart-x' } })).chartId).toBe('chart-x');
  });
});

describe('fetchAllFacts', () => {
  it('pages until hasNextPage is false', async () => {
    const { admin, calls } = fakeAdmin({ pages: [[node(1), node(2)], [node(3)]] });
    const facts = await fetchAllFacts(admin);
    expect(facts.map((f) => f.title)).toEqual(['P1', 'P2', 'P3']);
    expect(calls.map((c) => c.variables?.after)).toEqual([null, 'c1']);
  });
});

describe('syncProducts', () => {
  it('sends no mutation when the metafield already equals the resolved chart', async () => {
    const { admin, mutations } = fakeAdmin({ one: node(1, { sizeChart: { value: 'chart-tee' } }) });
    const result = await syncProducts(admin, [teeRule], { productId: 'gid://shopify/Product/1' });
    expect(result).toEqual({ checked: 1, set: 0, unset: 0 });
    expect(mutations()).toEqual([]);
  });

  it('fetches only the given product with OneProductFacts', async () => {
    const { admin, calls } = fakeAdmin({ one: node(7) });
    const result = await syncProducts(admin, [teeRule], { productId: 'gid://shopify/Product/7' });
    expect(result).toEqual({ checked: 1, set: 1, unset: 0 });
    expect(calls[0].query).toContain('query OneProductFacts');
    expect(calls[0].variables).toEqual({ id: 'gid://shopify/Product/7' });
    expect(calls[1].variables).toEqual({
      metafields: [
        {
          ownerId: 'gid://shopify/Product/7',
          namespace: '$app',
          key: 'size_chart',
          type: 'metaobject_reference',
          value: 'chart-tee',
        },
      ],
    });
  });

  it('checks nothing when the product no longer exists', async () => {
    const { admin, mutations } = fakeAdmin({ one: null });
    expect(await syncProducts(admin, [teeRule], { productId: 'gid://shopify/Product/404' })).toEqual({
      checked: 0,
      set: 0,
      unset: 0,
    });
    expect(mutations()).toEqual([]);
  });

  it('sends 60 changed products as metafieldsSet batches of 25/25/10', async () => {
    const nodes = Array.from({ length: 60 }, (_, i) => node(i));
    const { admin, mutations } = fakeAdmin({ pages: [nodes.slice(0, 25), nodes.slice(25, 50), nodes.slice(50)] });
    const result = await syncProducts(admin, [teeRule]);
    expect(result).toEqual({ checked: 60, set: 60, unset: 0 });
    const sets = mutations().filter((c) => c.query.includes('metafieldsSet'));
    expect(sets.map((c) => (c.variables?.metafields as unknown[]).length)).toEqual([25, 25, 10]);
  });

  it('unsets products that no rule matches any more', async () => {
    const { admin, mutations } = fakeAdmin({
      pages: [[node(1, { productType: 'Mugs', sizeChart: { value: 'chart-tee' } })]],
    });
    expect(await syncProducts(admin, [teeRule])).toEqual({ checked: 1, set: 0, unset: 1 });
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0].query).toContain('metafieldsDelete');
    expect(mutations()[0].variables).toEqual({
      metafields: [{ ownerId: 'gid://shopify/Product/1', namespace: '$app', key: 'size_chart' }],
    });
  });

  it('throws AdminError carrying userErrors from a mutation', async () => {
    const userErrors = [{ field: ['metafields', '0', 'value'], message: 'Value is invalid', code: 'INVALID' }];
    const { admin } = fakeAdmin({ pages: [[node(1)]], mutationErrors: userErrors });
    const err = (await syncProducts(admin, [teeRule]).catch((e) => e)) as AdminError;
    expect(err).toBeInstanceOf(AdminError);
    expect(err.userErrors).toEqual(userErrors);
  });

  it('rejects a next page without a cursor and sends no mutation', async () => {
    const calls: Call[] = [];
    const admin: AdminClient = {
      async graphql(query, options) {
        calls.push({ query, variables: options?.variables });
        if (query.includes('query ProductFacts')) {
          // Page one claims more pages but gives no cursor. Page two ends the list, so a regression
          // resolves (red) instead of paging forever with `after: null`.
          const first = calls.filter((c) => c.query.includes('query ProductFacts')).length === 1;
          const products = {
            nodes: first ? [node(1)] : [],
            pageInfo: { hasNextPage: first, endCursor: null },
          };
          return new Response(JSON.stringify({ data: { products } }));
        }
        return new Response(
          JSON.stringify({ data: { metafieldsSet: { metafields: [], userErrors: [] } } }),
        );
      },
    };
    const err = (await syncProducts(admin, [teeRule]).catch((e) => e)) as AdminError;
    expect(err).toBeInstanceOf(AdminError);
    expect(err.message).toBe('The product list came back incomplete (next page without a cursor).');
    expect(calls.filter((c) => c.query.includes('mutation'))).toEqual([]);
  });
});

describe('syncProducts batch failures', () => {
  it('runs every set and unset batch after a failing one, then throws all userErrors', async () => {
    const nodes = [
      ...Array.from({ length: 60 }, (_, i) => node(i)),
      node(100, { productType: 'Mugs', sizeChart: { value: 'chart-tee' } }),
    ];
    const userErrors = [{ field: ['metafields', '0', 'value'], message: 'Metaobject does not exist', code: 'INVALID' }];
    const { admin, mutations } = fakeAdmin({
      pages: [nodes],
      mutationErrors: (n) => (n === 0 ? userErrors : []),
    });
    const err = (await syncProducts(admin, [teeRule]).catch((e) => e)) as AdminError;
    expect(err).toBeInstanceOf(AdminError);
    expect(err.userErrors).toEqual(userErrors);
    const sent = mutations();
    expect(sent.map((c) => (c.query.includes('metafieldsSet') ? 'set' : 'unset'))).toEqual([
      'set',
      'set',
      'set',
      'unset',
    ]);
  });
});

// ---- runSync / claimSync with an in-memory prisma ----

interface State {
  shop: string;
  syncRequestedAt: Date | null;
  syncStartedAt: Date | null;
  syncFinishedAt: Date | null;
  syncError: string | null;
  syncCounts: string | null;
  rulesManaged: boolean;
}

type DateFilter = Date | null | { lte?: Date };

function matchesDate(value: Date | null, filter: DateFilter | undefined): boolean {
  if (filter === undefined) return true;
  if (filter === null) return value === null;
  if (filter instanceof Date) return value?.getTime() === filter.getTime();
  if (filter.lte !== undefined) return value !== null && value.getTime() <= filter.lte.getTime();
  return true;
}

function fakePrisma(rules: Rule[], initial?: Partial<State>) {
  const states = new Map<string, State>();
  const blank = (shop: string): State => ({
    shop,
    syncRequestedAt: null,
    syncStartedAt: null,
    syncFinishedAt: null,
    syncError: null,
    syncCounts: null,
    rulesManaged: false,
  });
  if (initial) states.set('s.myshopify.com', { ...blank('s.myshopify.com'), ...initial });
  const prisma = {
    shopState: {
      async findUnique({ where }: { where: { shop: string } }) {
        const s = states.get(where.shop);
        return s ? { ...s } : null;
      },
      async upsert({ where, create, update }: { where: { shop: string }; create: Partial<State>; update: Partial<State> }) {
        const s = states.get(where.shop);
        const next = s ? { ...s, ...update } : { ...blank(where.shop), ...create };
        states.set(where.shop, next);
        return { ...next };
      },
      async update({ where, data }: { where: { shop: string }; data: Partial<State> }) {
        const s = states.get(where.shop);
        if (!s) throw new Error('not found');
        Object.assign(s, data);
        return { ...s };
      },
      async updateMany({
        where,
        data,
      }: {
        where: { shop: string; syncStartedAt?: DateFilter; syncRequestedAt?: DateFilter };
        data: Partial<State>;
      }) {
        const s = states.get(where.shop);
        if (!s || !matchesDate(s.syncStartedAt, where.syncStartedAt) || !matchesDate(s.syncRequestedAt, where.syncRequestedAt)) {
          return { count: 0 };
        }
        Object.assign(s, data);
        return { count: 1 };
      },
    },
    assignmentRule: {
      async findMany() {
        return rules.map((r) => ({ ...r, shop: 's.myshopify.com', label: r.value, createdAt: new Date(0) }));
      },
    },
  };
  return { prisma, states };
}

function clock(startMs = 1_000_000) {
  let t = startMs;
  return () => new Date((t += 1000));
}

const SHOP = 's.myshopify.com';

describe('claimSync', () => {
  it('records the request and claims when no sync has run', async () => {
    const { prisma, states } = fakePrisma([]);
    const deps = { prisma, getAdmin: async () => fakeAdmin().admin, now: clock() } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    const s = states.get(SHOP)!;
    expect(s.syncRequestedAt).not.toBeNull();
    expect(s.syncStartedAt).toEqual(s.syncRequestedAt);
  });

  it('lets only one of two concurrent requests claim', async () => {
    const { prisma } = fakePrisma([]);
    const deps = { prisma, getAdmin: async () => fakeAdmin().admin, now: clock() } as unknown as SyncDeps;
    const results = await Promise.all([claimSync(SHOP, deps), claimSync(SHOP, deps)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not claim while a recent sync is unfinished, but records the request', async () => {
    const now = clock();
    const started = now();
    const { prisma, states } = fakePrisma([], { syncStartedAt: started, syncRequestedAt: started });
    const deps = { prisma, getAdmin: async () => fakeAdmin().admin, now } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(false);
    expect(states.get(SHOP)!.syncRequestedAt!.getTime()).toBeGreaterThan(started.getTime());
  });

  it('claims again when the running sync is older than 10 minutes', async () => {
    const started = new Date(0);
    const { prisma } = fakePrisma([], { syncStartedAt: started });
    const deps = { prisma, getAdmin: async () => fakeAdmin().admin, now: clock(11 * 60_000) } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
  });

  it('claims again after the previous sync finished', async () => {
    const now = clock();
    const started = now();
    const { prisma } = fakePrisma([], { syncStartedAt: started, syncFinishedAt: now() });
    const deps = { prisma, getAdmin: async () => fakeAdmin().admin, now } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
  });
});

describe('runSync', () => {
  it('syncs with the shop rules and records counts', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    const { admin } = fakeAdmin({ pages: [[node(1), node(2, { sizeChart: { value: 'chart-tee' } })]] });
    const deps = { prisma, getAdmin: async () => admin, now: clock() } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    const s = states.get(SHOP)!;
    expect(JSON.parse(s.syncCounts!)).toEqual({ checked: 2, set: 1, unset: 0 });
    expect(s.syncError).toBeNull();
    expect(s.syncFinishedAt!.getTime()).toBeGreaterThanOrEqual(s.syncStartedAt!.getTime());
  });

  it('reruns when a request arrives while it is running', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    const fake = fakeAdmin();
    const now = clock();
    let productFetches = 0;
    const admin: AdminClient = {
      async graphql(query, options) {
        if (query.includes('query ProductFacts')) {
          productFetches++;
          // A second request lands while the first pass is fetching products.
          if (productFetches === 1) states.get(SHOP)!.syncRequestedAt = now();
          return new Response(
            JSON.stringify({
              data: {
                products: {
                  nodes: [node(1, { sizeChart: { value: 'chart-tee' } })],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            }),
          );
        }
        return fake.admin.graphql(query, options);
      },
    };
    const deps = { prisma, getAdmin: async () => admin, now } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(productFetches).toBe(2);
    expect(states.get(SHOP)!.syncFinishedAt).not.toBeNull();
  });

  it('records the error and finishes so a later request can start a new sync', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    const deps = {
      prisma,
      getAdmin: async () => {
        throw new Error('no session');
      },
      now: clock(),
    } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    const s = states.get(SHOP)!;
    expect(s.syncError).toBe('no session');
    expect(s.syncFinishedAt).not.toBeNull();
    expect(await claimSync(SHOP, deps)).toBe(true);
  });
});

describe('runSync after a failed pass', () => {
  it('runs one more pass when a request arrived during the failed one, and clears the error', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    const { admin } = fakeAdmin({ pages: [[node(1)]] });
    const now = clock();
    let calls = 0;
    const deps = {
      prisma,
      now,
      getAdmin: async () => {
        calls++;
        if (calls === 1) {
          states.get(SHOP)!.syncRequestedAt = now();
          throw new Error('Metaobject does not exist');
        }
        return admin;
      },
    } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(calls).toBe(2);
    const s = states.get(SHOP)!;
    expect(s.syncError).toBeNull();
    expect(JSON.parse(s.syncCounts!)).toEqual({ checked: 1, set: 1, unset: 0 });
  });

  it('retries a persistent error exactly once, then stops with syncError set', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    const now = clock();
    let calls = 0;
    const deps = {
      prisma,
      now,
      getAdmin: async () => {
        calls++;
        states.get(SHOP)!.syncRequestedAt = now(); // a request is always pending
        throw new Error(`boom ${calls}`);
      },
    } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(calls).toBe(2);
    const s = states.get(SHOP)!;
    expect(s.syncError).toBe('boom 2');
    expect(s.syncFinishedAt).not.toBeNull();
  });

  it('does not retry a failed pass when no request is pending', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    let calls = 0;
    const deps = {
      prisma,
      now: clock(),
      getAdmin: async () => {
        calls++;
        throw new Error('boom');
      },
    } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(calls).toBe(1);
    expect(states.get(SHOP)!.syncError).toBe('boom');
  });
});

describe('runSync with a rule whose chart was deleted', () => {
  it('skips the rule, so no metafield points at the missing metaobject', async () => {
    const gone: Rule = { id: 'r0', chartId: 'chart-gone', type: 'product_type', value: 'tees', priority: 0 };
    const { prisma, states } = fakePrisma([gone, { ...teeRule, priority: 1 }]);
    const { admin, mutations } = fakeAdmin({ pages: [[node(1)]], chartIds: ['chart-tee'] });
    const deps = { prisma, getAdmin: async () => admin, now: clock() } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    const values = mutations().flatMap((c) =>
      (c.variables?.metafields as { value?: string }[]).map((m) => m.value),
    );
    expect(values).toEqual(['chart-tee']);
    expect(values).not.toContain('chart-gone');
    expect(states.get(SHOP)!.syncError).toBeNull();
  });
});

describe('runSync when rules are gone', () => {
  const assigned = () => [
    node(1, { sizeChart: { value: 'chart-tee' } }),
    node(2),
    node(3, { sizeChart: { value: 'chart-old' } }),
  ];
  const unsetIds = (mutations: () => Call[]) =>
    mutations().flatMap((c) =>
      c.query.includes('UnassignCharts')
        ? (c.variables?.metafields as { ownerId: string }[]).map((m) => m.ownerId)
        : [],
    );

  it('unsets every assigned product after the last rule of a managed shop was deleted', async () => {
    const { prisma, states } = fakePrisma([], { rulesManaged: true });
    const { admin, mutations } = fakeAdmin({ pages: [assigned()] });
    const deps = { prisma, getAdmin: async () => admin, now: clock() } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(unsetIds(mutations)).toEqual(['gid://shopify/Product/1', 'gid://shopify/Product/3']);
    expect(mutations().some((c) => c.query.includes('AssignCharts'))).toBe(false);
    expect(JSON.parse(states.get(SHOP)!.syncCounts!)).toEqual({ checked: 3, set: 0, unset: 2 });
  });

  it('writes nothing for a shop that never had rules', async () => {
    const { prisma, states } = fakePrisma([]);
    const { admin, mutations } = fakeAdmin({ pages: [assigned()] });
    const deps = { prisma, getAdmin: async () => admin, now: clock() } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(mutations()).toEqual([]);
    expect(states.get(SHOP)!.syncError).toBeNull();
  });

  it('unsets the products of a deleted chart whose rules were the only ones', async () => {
    const gone: Rule = { id: 'r0', chartId: 'chart-gone', type: 'product_type', value: 'tees', priority: 0 };
    const { prisma } = fakePrisma([gone], { rulesManaged: true });
    const { admin, mutations } = fakeAdmin({
      pages: [[node(1, { sizeChart: { value: 'chart-gone' } }), node(2)]],
      chartIds: [],
    });
    const deps = { prisma, getAdmin: async () => admin, now: clock() } as unknown as SyncDeps;
    expect(await claimSync(SHOP, deps)).toBe(true);
    await runSync(SHOP, deps);
    expect(unsetIds(mutations)).toEqual(['gid://shopify/Product/1']);
  });
});

describe('markRulesManaged', () => {
  it('creates or updates the shop state with rulesManaged', async () => {
    const { prisma, states } = fakePrisma([]);
    await markRulesManaged(prisma as never, SHOP);
    expect(states.get(SHOP)!.rulesManaged).toBe(true);
    await markRulesManaged(prisma as never, SHOP);
    expect(states.get(SHOP)!.rulesManaged).toBe(true);
  });
});

describe('requestSync', () => {
  afterEach(() => {
    real.admin.mockReset();
    real.prisma = null;
  });

  it('returns before the background loop finishes, which then completes', async () => {
    const { prisma, states } = fakePrisma([teeRule]);
    real.prisma = prisma;
    const { admin } = fakeAdmin({ pages: [[node(1)]] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    real.admin.mockImplementation(async () => {
      await gate;
      return { admin };
    });

    await requestSync(SHOP);
    expect(states.get(SHOP)!.syncStartedAt).not.toBeNull();
    expect(states.get(SHOP)!.syncFinishedAt).toBeNull();

    release();
    await vi.waitFor(() => expect(states.get(SHOP)!.syncFinishedAt).not.toBeNull());
    expect(JSON.parse(states.get(SHOP)!.syncCounts!)).toEqual({ checked: 1, set: 1, unset: 0 });
  });

  it('does not leave an unhandled rejection when the loop and its error bookkeeping both fail', async () => {
    const { prisma } = fakePrisma([teeRule]);
    real.prisma = prisma;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      real.admin.mockImplementation(async () => {
        // Break the bookkeeping too, so runSync's own error recording fails.
        prisma.shopState.update = async () => {
          throw new Error('db down');
        };
        prisma.shopState.updateMany = async () => {
          throw new Error('db down');
        };
        throw new Error('no offline session');
      });
      await requestSync(SHOP);
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      consoleError.mockRestore();
    }
  });
});
