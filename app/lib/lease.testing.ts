import type { LeaseDb } from './lease.server';

/** Test helper: in-memory jobLease table. */
export interface LeaseRow {
  name: string;
  holder: string;
  lockedUntil: Date;
}

/** In-memory `jobLease` that honours the `where` filters the lease code uses. */
export function fakeLeaseDb(opts: { createError?: unknown } = {}) {
  const rows = new Map<string, LeaseRow>();
  const db = {
    jobLease: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { name?: string; holder?: string; lockedUntil?: { lt: Date } };
        data: Partial<LeaseRow>;
      }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (where.name !== undefined && row.name !== where.name) continue;
          if (where.holder !== undefined && row.holder !== where.holder) continue;
          if (where.lockedUntil && !(row.lockedUntil.getTime() < where.lockedUntil.lt.getTime())) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
      create: async ({ data }: { data: LeaseRow }) => {
        if (opts.createError) throw opts.createError;
        if (rows.has(data.name)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        rows.set(data.name, { ...data });
        return data;
      },
    },
  } as unknown as LeaseDb;
  return { db, rows };
}
