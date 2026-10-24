import type { PrismaClient } from '@prisma/client';
import { AdminError, gql, type AdminClient } from './admin.server';
import { listCharts } from './charts.server';
import { planWrites, type ProductFacts, type Rule, type RuleType } from './rules';

const PRODUCT_FACTS = `#graphql
  query ProductFacts($after: String) {
    products(first: 25, after: $after) {
      nodes {
        id title productType vendor tags
        collections(first: 25) { nodes { id } }
        options { name optionValues { name } }
        sizeChart: metafield(namespace: "$app", key: "size_chart") { value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ONE_PRODUCT_FACTS = `#graphql
  query OneProductFacts($id: ID!) {
    product(id: $id) {
      id title productType vendor tags
      collections(first: 25) { nodes { id } }
      options { name optionValues { name } }
      sizeChart: metafield(namespace: "$app", key: "size_chart") { value }
    }
  }
`;

const ASSIGN_CHARTS = `#graphql
  mutation AssignCharts($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { metafields { ownerType key } userErrors { field message code } }
  }
`;

const UNASSIGN_CHARTS = `#graphql
  mutation UnassignCharts($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) { deletedMetafields { ownerId key } userErrors { field message } }
  }
`;

const BATCH = 25;
const STALE_MS = 10 * 60_000;

interface UserError {
  field?: string[] | null;
  message: string;
  code?: string;
}

interface ProductNode {
  id: string;
  title?: string | null;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[] | null;
  collections?: { nodes?: { id: string }[] | null } | null;
  options?: { name: string; optionValues?: { name: string }[] | null }[] | null;
  sizeChart?: { value?: string | null } | null;
}

export function toFacts(node: unknown): ProductFacts {
  const n = node as ProductNode;
  return {
    id: n.id,
    title: n.title ?? '',
    productType: n.productType ?? '',
    vendor: n.vendor ?? '',
    tags: n.tags ?? [],
    collectionIds: (n.collections?.nodes ?? []).map((c) => c.id),
    options: (n.options ?? []).map((o) => ({
      name: o.name,
      values: (o.optionValues ?? []).map((v) => v.name),
    })),
    chartId: n.sizeChart?.value ?? null,
  };
}

/** Every product's facts, paging `ProductFacts` until the last page. */
export async function fetchAllFacts(admin: AdminClient): Promise<ProductFacts[]> {
  const facts: ProductFacts[] = [];
  let after: string | null = null;
  for (;;) {
    const data: {
      products: { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    } = await gql(admin, PRODUCT_FACTS, { after });
    facts.push(...data.products.nodes.map(toFacts));
    const { hasNextPage, endCursor } = data.products.pageInfo;
    if (!hasNextPage) return facts;
    // A partial list would make the sync unset products that were never fetched.
    if (!endCursor) throw new AdminError('The product list came back incomplete (next page without a cursor).');
    after = endCursor;
  }
}

/**
 * Brings the `$app.size_chart` metafield of every product (or just `opts.productId`) in line with the rules.
 * Idempotent: products whose metafield already holds the resolved chart are not written.
 */
export async function syncProducts(
  admin: AdminClient,
  rules: Rule[],
  opts: { productId?: string; managed?: boolean } = {},
): Promise<{ checked: number; set: number; unset: number }> {
  let products: ProductFacts[];
  if (opts.productId) {
    const data = await gql<{ product: unknown | null }>(admin, ONE_PRODUCT_FACTS, { id: opts.productId });
    products = data.product ? [toFacts(data.product)] : [];
  } else {
    products = await fetchAllFacts(admin);
  }

  const { set, unset } = planWrites(products, rules, { managed: opts.managed ?? false });
  // Each batch stands alone: a userError in one batch (metafieldsSet is atomic per call) must not
  // stop the others. Counts reflect successful batches only; all userErrors are thrown at the end.
  const userErrors: UserError[] = [];
  let setCount = 0;
  let unsetCount = 0;

  for (let i = 0; i < set.length; i += BATCH) {
    const metafields = set.slice(i, i + BATCH).map((w) => ({
      ownerId: w.ownerId,
      namespace: '$app',
      key: 'size_chart',
      type: 'metaobject_reference',
      value: w.chartId,
    }));
    const data = await gql<{ metafieldsSet: { userErrors: UserError[] } }>(admin, ASSIGN_CHARTS, { metafields });
    if (data.metafieldsSet.userErrors.length) userErrors.push(...data.metafieldsSet.userErrors);
    else setCount += metafields.length;
  }

  for (let i = 0; i < unset.length; i += BATCH) {
    const metafields = unset
      .slice(i, i + BATCH)
      .map((ownerId) => ({ ownerId, namespace: '$app', key: 'size_chart' }));
    const data = await gql<{ metafieldsDelete: { userErrors: UserError[] } }>(admin, UNASSIGN_CHARTS, {
      metafields,
    });
    if (data.metafieldsDelete.userErrors.length) userErrors.push(...data.metafieldsDelete.userErrors);
    else unsetCount += metafields.length;
  }

  if (userErrors.length) {
    throw new AdminError(userErrors.map((e) => e.message).join('; '), userErrors);
  }
  return { checked: products.length, set: setCount, unset: unsetCount };
}

// ---- Background sync ----

export interface SyncDeps {
  prisma: Pick<PrismaClient, 'shopState' | 'assignmentRule'>;
  getAdmin: (shop: string) => Promise<AdminClient>;
  now: () => Date;
}

export async function loadRules(prisma: SyncDeps['prisma'], shop: string): Promise<Rule[]> {
  const rows = await prisma.assignmentRule.findMany({
    where: { shop },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    chartId: r.chartId,
    type: r.type as RuleType,
    value: r.value,
    priority: r.priority,
  }));
}

/**
 * The shop's rules and whether the shop has ever had rules (`ShopState.rulesManaged`).
 * Existing rules imply managed, so rules created before `rulesManaged` existed still count.
 */
export async function loadAssignment(
  prisma: SyncDeps['prisma'],
  shop: string,
): Promise<{ rules: Rule[]; managed: boolean }> {
  const [rules, state] = await Promise.all([
    loadRules(prisma, shop),
    prisma.shopState.findUnique({ where: { shop } }),
  ]);
  return { rules, managed: rules.length > 0 || (state?.rulesManaged ?? false) };
}

/** Rules whose chart still exists. A rule left behind by a deleted chart must never write a reference to a missing metaobject. */
export async function liveRules(admin: AdminClient, rules: Rule[]): Promise<Rule[]> {
  if (rules.length === 0) return rules;
  const chartIds = new Set((await listCharts(admin)).map((d) => d.id));
  return rules.filter((r) => chartIds.has(r.chartId));
}

/** Records that the shop now assigns charts by rules, so "no rules" later means "unset every product". */
export async function markRulesManaged(prisma: Pick<PrismaClient, 'shopState'>, shop: string): Promise<void> {
  await prisma.shopState.upsert({
    where: { shop },
    create: { shop, rulesManaged: true },
    update: { rulesManaged: true },
  });
}

/**
 * Records a sync request and claims the right to run the sync loop.
 * Returns true when the caller must run `runSync`: no sync ever started, the last one finished,
 * or the running one started over 10 minutes ago (presumed dead).
 * The claim is a compare-and-swap on `syncStartedAt`, so of several concurrent callers only one wins.
 */
export async function claimSync(shop: string, deps: SyncDeps): Promise<boolean> {
  const now = deps.now();
  await deps.prisma.shopState.upsert({
    where: { shop },
    create: { shop, syncRequestedAt: now },
    update: { syncRequestedAt: now },
  });
  const state = await deps.prisma.shopState.findUnique({ where: { shop } });
  if (!state) return false;
  const started = state.syncStartedAt;
  const idle =
    started === null ||
    started.getTime() < now.getTime() - STALE_MS ||
    (state.syncFinishedAt !== null && state.syncFinishedAt.getTime() >= started.getTime());
  if (!idle) return false;
  const claimed = await deps.prisma.shopState.updateMany({
    where: { shop, syncStartedAt: started },
    data: { syncStartedAt: now },
  });
  return claimed.count === 1;
}

/** One pass: current rules, minus rules whose chart no longer exists, applied to every product. */
async function syncPass(shop: string, deps: SyncDeps) {
  const { rules, managed } = await loadAssignment(deps.prisma, shop);
  const admin = await deps.getAdmin(shop);
  return syncProducts(admin, await liveRules(admin, rules), { managed });
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The sync loop, run by whoever won `claimSync`. A pass is repeated while a request arrived after it
 * started. After a failed pass with a request pending, one more pass runs (at most one in a row), so a
 * persistent error cannot loop. `syncError` holds the last failure only when the final pass failed.
 * Never rejects.
 */
export async function runSync(shop: string, deps: SyncDeps): Promise<void> {
  let retriedAfterError = false;
  try {
    for (;;) {
      const startedAt = deps.now();
      await deps.prisma.shopState.update({ where: { shop }, data: { syncStartedAt: startedAt } });
      let counts: Awaited<ReturnType<typeof syncProducts>>;
      try {
        counts = await syncPass(shop, deps);
      } catch (error) {
        const data = { syncFinishedAt: deps.now(), syncError: errorMessage(error) };
        if (retriedAfterError) {
          await deps.prisma.shopState.update({ where: { shop }, data });
          return;
        }
        // Finish unless a request arrived during the failed pass; then give it one retry pass.
        const finished = await deps.prisma.shopState.updateMany({
          where: { shop, syncRequestedAt: { lte: startedAt } },
          data,
        });
        if (finished.count === 1) return;
        retriedAfterError = true;
        continue;
      }
      retriedAfterError = false;
      // Finish only if no request arrived after this pass started; otherwise run another pass.
      const finished = await deps.prisma.shopState.updateMany({
        where: { shop, syncRequestedAt: { lte: startedAt } },
        data: { syncFinishedAt: deps.now(), syncCounts: JSON.stringify(counts), syncError: null },
      });
      if (finished.count === 1) return;
    }
  } catch (error) {
    // Only the state bookkeeping itself can land here.
    const message = errorMessage(error);
    try {
      await deps.prisma.shopState.update({
        where: { shop },
        data: { syncFinishedAt: deps.now(), syncError: message },
      });
    } catch (recordError) {
      console.error(`Sync for ${shop} failed (${message}) and could not be recorded`, recordError);
    }
  }
}

/** Asks for a full sync of the shop's products; starts it in the background unless one is running. */
export async function requestSync(shop: string): Promise<void> {
  const [{ default: prisma }, { unauthenticated }] = await Promise.all([
    import('../db.server'),
    import('../shopify.server'),
  ]);
  const deps: SyncDeps = {
    prisma,
    getAdmin: async (s) => (await unauthenticated.admin(s)).admin,
    now: () => new Date(),
  };
  if (await claimSync(shop, deps)) {
    void runSync(shop, deps).catch((error) => console.error(`Sync for ${shop} failed`, error));
  }
}
