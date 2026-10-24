import { describe, expect, it } from 'vitest';
import { relativeTime, syncStatus, type SyncStateInput } from './sync-status';

const now = new Date('2026-10-22T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const state = (o: Partial<SyncStateInput>): SyncStateInput => ({
  syncStartedAt: null,
  syncFinishedAt: null,
  syncError: null,
  syncCounts: null,
  ...o,
});

describe('syncStatus', () => {
  it('never when there is no state', () => {
    expect(syncStatus(null, now)).toEqual({ kind: 'never' });
    expect(syncStatus(state({}), now)).toEqual({ kind: 'never' });
  });
  it('syncing when started after finish and recent', () => {
    expect(syncStatus(state({ syncStartedAt: ago(1) }), now)).toEqual({ kind: 'syncing' });
    expect(syncStatus(state({ syncStartedAt: ago(1), syncFinishedAt: ago(30) }), now)).toEqual({ kind: 'syncing' });
  });
  it('stalled when unfinished for 10 minutes or more', () => {
    expect(syncStatus(state({ syncStartedAt: ago(10) }), now)).toEqual({ kind: 'stalled' });
  });
  it('done with counts, tolerating bad JSON', () => {
    const done = state({ syncStartedAt: ago(6), syncFinishedAt: ago(5), syncCounts: '{"checked":9,"set":3,"unset":2}' });
    expect(syncStatus(done, now)).toEqual({ kind: 'done', finishedAt: ago(5), set: 3, unset: 2 });
    expect(syncStatus({ ...done, syncCounts: 'x' }, now)).toMatchObject({ kind: 'done', set: 0, unset: 0 });
  });
  it('a running sync hides a stale error', () => {
    expect(syncStatus(state({ syncError: 'boom', syncStartedAt: ago(1), syncFinishedAt: ago(30) }), now)).toEqual({ kind: 'syncing' });
  });
  it('error shows when the last pass finished after it started', () => {
    expect(syncStatus(state({ syncError: 'boom', syncStartedAt: ago(6), syncFinishedAt: ago(5) }), now)).toEqual({ kind: 'error', message: 'boom' });
  });
});

describe('relativeTime', () => {
  it('formats', () => {
    expect(relativeTime(ago(0), now)).toBe('just now');
    expect(relativeTime(ago(1), now)).toBe('1 minute ago');
    expect(relativeTime(ago(5), now)).toBe('5 minutes ago');
    expect(relativeTime(ago(120), now)).toBe('2 hours ago');
    expect(relativeTime(ago(60 * 24 * 3), now)).toBe('3 days ago');
  });
});
