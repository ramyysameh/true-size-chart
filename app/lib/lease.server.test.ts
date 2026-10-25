import { describe, expect, it } from 'vitest';
import { acquireLease, releaseLease, type LeaseDb } from './lease.server';
import { fakeLeaseDb } from './lease.testing';

const NOW = new Date('2026-10-25T12:00:00Z');
const MIN = 60_000;
const TTL = 25 * MIN;
const at = (min: number) => new Date(NOW.getTime() + min * MIN);

describe('acquireLease', () => {
  it('acquires on an empty table (create path)', async () => {
    const { db, rows } = fakeLeaseDb();
    expect(await acquireLease(db, 'job', 'a', TTL, NOW)).toBe(true);
    expect(rows.get('job')).toEqual({ name: 'job', holder: 'a', lockedUntil: at(25) });
  });

  it('refuses a second holder while the lease is live', async () => {
    const { db, rows } = fakeLeaseDb();
    await acquireLease(db, 'job', 'a', TTL, NOW);
    expect(await acquireLease(db, 'job', 'b', TTL, at(1))).toBe(false);
    expect(rows.get('job')!.holder).toBe('a');
  });

  it('lets a second holder take an expired lease', async () => {
    const { db, rows } = fakeLeaseDb();
    await acquireLease(db, 'job', 'a', TTL, NOW);
    expect(await acquireLease(db, 'job', 'b', TTL, at(26))).toBe(true);
    expect(rows.get('job')).toEqual({ name: 'job', holder: 'b', lockedUntil: at(26 + 25) });
  });

  it('treats a create that loses the race (P2002) as not acquired', async () => {
    const { db } = fakeLeaseDb({ createError: { code: 'P2002' } });
    expect(await acquireLease(db, 'job', 'a', TTL, NOW)).toBe(false);
  });

  it('propagates any other create error', async () => {
    const { db } = fakeLeaseDb({ createError: new Error('connection refused') });
    await expect(acquireLease(db, 'job', 'a', TTL, NOW)).rejects.toThrow('connection refused');
  });
});

describe('releaseLease', () => {
  it('lets another holder acquire at once after the holder releases', async () => {
    const { db } = fakeLeaseDb();
    await acquireLease(db, 'job', 'a', TTL, NOW);
    await releaseLease(db, 'job', 'a', at(2));
    expect(await acquireLease(db, 'job', 'b', TTL, at(3))).toBe(true);
  });

  it('changes nothing when a non-holder releases', async () => {
    const { db, rows } = fakeLeaseDb();
    await acquireLease(db, 'job', 'a', TTL, NOW);
    await releaseLease(db, 'job', 'b', at(2));
    expect(rows.get('job')).toEqual({ name: 'job', holder: 'a', lockedUntil: at(25) });
    expect(await acquireLease(db, 'job', 'b', TTL, at(3))).toBe(false);
  });

  it('never throws', async () => {
    const db = {
      jobLease: {
        updateMany: async () => {
          throw new Error('db down');
        },
        create: async () => undefined,
      },
    } as unknown as LeaseDb;
    await expect(releaseLease(db, 'job', 'a', NOW)).resolves.toBeUndefined();
  });
});
