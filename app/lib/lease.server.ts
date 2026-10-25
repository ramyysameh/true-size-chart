import type { Prisma } from '@prisma/client';

export interface LeaseDb {
  jobLease: Pick<Prisma.JobLeaseDelegate, 'updateMany' | 'create'>;
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

/**
 * Takes the named lease for `ttlMs` when nobody holds it or the holder's has expired.
 * An expired row is claimed with one conditional update; a missing row is created, and a
 * P2002 on create means another process created it first.
 */
export async function acquireLease(
  db: LeaseDb,
  name: string,
  holder: string,
  ttlMs: number,
  now: Date,
): Promise<boolean> {
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const { count } = await db.jobLease.updateMany({
    where: { name, lockedUntil: { lt: now } },
    data: { holder, lockedUntil },
  });
  if (count === 1) return true;
  try {
    await db.jobLease.create({ data: { name, holder, lockedUntil } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** Expires the lease now if `holder` still owns it. Never throws: the lease expires by itself. */
export async function releaseLease(db: LeaseDb, name: string, holder: string, now: Date): Promise<void> {
  try {
    await db.jobLease.updateMany({ where: { name, holder }, data: { lockedUntil: now } });
  } catch {
    // The lease frees itself at lockedUntil.
  }
}
