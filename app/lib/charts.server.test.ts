import { describe, expect, it, vi } from 'vitest';
import { AdminError, gql, type AdminClient } from './admin.server';
import { deleteChart, getChart, listCharts, saveChart } from './charts.server';
import { blankDraft, toFields, type ChartDraft } from './chart-model';

interface Call {
  query: string;
  variables?: Record<string, unknown>;
}

function fakeAdmin(responses: unknown[]) {
  const calls: Call[] = [];
  let i = 0;
  const admin: AdminClient = {
    async graphql(query, options) {
      calls.push({ query, variables: options?.variables });
      const body = responses[Math.min(i++, responses.length - 1)];
      return new Response(JSON.stringify(body));
    },
  };
  return { admin, calls };
}

function validDraft(): ChartDraft {
  return {
    ...blankDraft(),
    name: 'Tees',
    category: 'tshirt',
    table: { sizes: ['S', 'M'], measurements: { chest: [50, 54] } },
  };
}

describe('gql', () => {
  it('returns data', async () => {
    const { admin } = fakeAdmin([{ data: { a: 1 } }]);
    expect(await gql<{ a: number }>(admin, 'query {a}')).toEqual({ a: 1 });
  });

  it('throws AdminError on top-level errors', async () => {
    const { admin } = fakeAdmin([{ errors: [{ message: 'boom' }] }]);
    await expect(gql(admin, 'query {a}')).rejects.toBeInstanceOf(AdminError);
  });

  it('retries a THROTTLED response then succeeds', async () => {
    const wait = vi.fn(async () => {});
    const { admin, calls } = fakeAdmin([
      { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] },
      { data: { ok: true } },
    ]);
    expect(await gql(admin, 'query {a}', undefined, wait)).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(wait).toHaveBeenCalledWith(1000);
  });

  it('gives up after 3 throttled attempts', async () => {
    const wait = vi.fn(async () => {});
    const { admin, calls } = fakeAdmin([
      { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] },
    ]);
    await expect(gql(admin, 'query {a}', undefined, wait)).rejects.toBeInstanceOf(AdminError);
    expect(calls).toHaveLength(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});

describe('saveChart', () => {
  it('upserts a $app:size_chart metaobject with the 8 fields', async () => {
    const { admin, calls } = fakeAdmin([
      {
        data: {
          metaobjectUpsert: {
            metaobject: { id: 'gid://shopify/Metaobject/1', handle: 'tees-x', updatedAt: 't' },
            userErrors: [],
          },
        },
      },
    ]);
    const d = validDraft();
    const res = await saveChart(admin, d);
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain('metaobjectUpsert');
    expect(calls[0].query).toContain('$app:size_chart');
    const vars = calls[0].variables as { handle: string; fields: unknown[] };
    expect(vars.handle).toMatch(/^tees-/);
    expect(vars.fields).toEqual(toFields(d));
    expect(vars.fields).toHaveLength(8);
    if (res.ok) {
      expect(res.draft.id).toBe('gid://shopify/Metaobject/1');
      expect(res.draft.handle).toBe('tees-x');
    }
  });

  it('reuses the handle of an existing draft', async () => {
    const { admin, calls } = fakeAdmin([
      { data: { metaobjectUpsert: { metaobject: { id: 'g', handle: 'keep', updatedAt: 't' }, userErrors: [] } } },
    ]);
    await saveChart(admin, { ...validDraft(), id: 'g', handle: 'keep' });
    expect((calls[0].variables as { handle: string }).handle).toBe('keep');
  });

  it('makes no request for an invalid draft', async () => {
    const { admin, calls } = fakeAdmin([{ data: {} }]);
    const res = await saveChart(admin, { ...validDraft(), name: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it('surfaces userErrors', async () => {
    const { admin } = fakeAdmin([
      {
        data: {
          metaobjectUpsert: {
            metaobject: null,
            userErrors: [{ field: ['fields'], message: 'Table is bad', code: 'INVALID' }],
          },
        },
      },
    ]);
    const res = await saveChart(admin, validDraft());
    expect(res).toEqual({ ok: false, errors: ['Table is bad'] });
  });
});

describe('listCharts / getChart / deleteChart', () => {
  const node = (n: number) => ({
    id: `gid://shopify/Metaobject/${n}`,
    handle: `h${n}`,
    updatedAt: 't',
    fields: toFields({ ...validDraft(), name: `Chart ${n}` }),
    referencedBy: { nodes: [] },
  });

  it('follows endCursor and sorts by name', async () => {
    const { admin, calls } = fakeAdmin([
      { data: { metaobjects: { nodes: [node(2)], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } },
      { data: { metaobjects: { nodes: [node(1)], pageInfo: { hasNextPage: false, endCursor: null } } } },
    ]);
    const list = await listCharts(admin);
    expect(calls).toHaveLength(2);
    expect(calls[0].variables).toEqual({ after: null });
    expect(calls[1].variables).toEqual({ after: 'c1' });
    expect(list.map((c) => c.name)).toEqual(['Chart 1', 'Chart 2']);
  });

  it('getChart returns null when missing', async () => {
    const { admin } = fakeAdmin([{ data: { metaobjectByHandle: null } }]);
    expect(await getChart(admin, 'nope')).toBeNull();
  });

  it('getChart maps fields', async () => {
    const { admin } = fakeAdmin([
      { data: { metaobjectByHandle: { id: 'g1', handle: 'h', fields: toFields(validDraft()) } } },
    ]);
    const c = await getChart(admin, 'h');
    expect(c?.id).toBe('g1');
    expect(c?.name).toBe('Tees');
  });

  it('deleteChart sends metaobjectDelete and throws on userErrors', async () => {
    const ok = fakeAdmin([{ data: { metaobjectDelete: { deletedId: 'g', userErrors: [] } } }]);
    await deleteChart(ok.admin, 'g');
    expect(ok.calls[0].query).toContain('metaobjectDelete');
    expect(ok.calls[0].variables).toEqual({ id: 'g' });

    const bad = fakeAdmin([
      { data: { metaobjectDelete: { deletedId: null, userErrors: [{ message: 'nope' }] } } },
    ]);
    await expect(deleteChart(bad.admin, 'g')).rejects.toBeInstanceOf(AdminError);
  });
});
