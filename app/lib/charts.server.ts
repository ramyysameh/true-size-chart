import { AdminError, gql, type AdminClient } from './admin.server';
import {
  fromFields,
  newHandle,
  toFields,
  validateDraft,
  type ChartDraft,
} from './chart-model';

interface UserError {
  field?: string[] | null;
  message: string;
  code?: string;
}

const CHART_UPSERT = `#graphql
  mutation ChartUpsert($handle: String!, $fields: [MetaobjectFieldInput!]!) {
    metaobjectUpsert(handle: { type: "$app:size_chart", handle: $handle }, metaobject: { fields: $fields }) {
      metaobject { id handle updatedAt }
      userErrors { field message code }
    }
  }
`;

const CHARTS = `#graphql
  query Charts($after: String) {
    metaobjects(type: "$app:size_chart", first: 50, after: $after) {
      nodes { id handle updatedAt fields { key value } referencedBy(first: 1) { nodes { referencer { ... on Product { id } } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CHART = `#graphql
  query Chart($handle: String!) {
    metaobjectByHandle(handle: { type: "$app:size_chart", handle: $handle }) { id handle fields { key value } }
  }
`;

const CHART_DELETE = `#graphql
  mutation ChartDelete($id: ID!) {
    metaobjectDelete(id: $id) { deletedId userErrors { field message code } }
  }
`;

interface MetaobjectNode {
  id: string;
  handle: string;
  fields: { key: string; value: string | null }[];
}

export interface ChartListItem {
  draft: ChartDraft;
  /** At least one product references this chart. */
  inUse: boolean;
}

export async function listChartItems(admin: AdminClient): Promise<ChartListItem[]> {
  const items: ChartListItem[] = [];
  let after: string | null = null;
  for (;;) {
    const data: {
      metaobjects: {
        nodes: (MetaobjectNode & { referencedBy?: { nodes: unknown[] } | null })[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await gql(admin, CHARTS, { after });
    for (const n of data.metaobjects.nodes) {
      items.push({
        draft: fromFields(n.id, n.handle, n.fields),
        inUse: (n.referencedBy?.nodes.length ?? 0) > 0,
      });
    }
    const { hasNextPage, endCursor } = data.metaobjects.pageInfo;
    if (!hasNextPage) break;
    // A partial list would make the sync treat live rules as orphaned and unset their products.
    if (!endCursor) throw new AdminError('The chart list came back incomplete (next page without a cursor).');
    after = endCursor;
  }
  return items.sort((a, b) => a.draft.name.localeCompare(b.draft.name));
}

export async function listCharts(admin: AdminClient): Promise<ChartDraft[]> {
  return (await listChartItems(admin)).map((i) => i.draft);
}

export async function getChart(admin: AdminClient, handle: string): Promise<ChartDraft | null> {
  const data = await gql<{ metaobjectByHandle: MetaobjectNode | null }>(admin, CHART, { handle });
  const n = data.metaobjectByHandle;
  return n ? fromFields(n.id, n.handle, n.fields) : null;
}

export async function saveChart(
  admin: AdminClient,
  d: ChartDraft,
): Promise<{ ok: true; draft: ChartDraft } | { ok: false; errors: string[] }> {
  const { errors } = validateDraft(d);
  if (errors.length) return { ok: false, errors };

  const handle = d.handle ?? newHandle(d.name);
  const data = await gql<{
    metaobjectUpsert: {
      metaobject: { id: string; handle: string } | null;
      userErrors: UserError[];
    };
  }>(admin, CHART_UPSERT, { handle, fields: toFields(d) });

  const { metaobject, userErrors } = data.metaobjectUpsert;
  if (userErrors.length || !metaobject) {
    return {
      ok: false,
      errors: userErrors.length ? userErrors.map((e) => e.message) : ['The chart could not be saved.'],
    };
  }
  return { ok: true, draft: { ...d, id: metaobject.id, handle: metaobject.handle } };
}

/** Deletes the metaobject only. Rules and sync are the caller's job. */
export async function deleteChart(admin: AdminClient, id: string): Promise<void> {
  const data = await gql<{
    metaobjectDelete: { deletedId: string | null; userErrors: UserError[] };
  }>(admin, CHART_DELETE, { id });
  const { userErrors } = data.metaobjectDelete;
  if (userErrors.length) throw new AdminError(userErrors.map((e) => e.message).join('; '), userErrors);
}
