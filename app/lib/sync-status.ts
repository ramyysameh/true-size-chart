export interface SyncStateInput {
  syncStartedAt: Date | null;
  syncFinishedAt: Date | null;
  syncError: string | null;
  syncCounts: string | null;
}

export type SyncStatus =
  | { kind: 'error'; message: string }
  | { kind: 'syncing' }
  | { kind: 'stalled' }
  | { kind: 'done'; finishedAt: Date; set: number; unset: number }
  | { kind: 'never' };

export const STALL_MS = 10 * 60 * 1000;

function parseCounts(raw: string | null): { set: number; unset: number } {
  try {
    const c = raw ? (JSON.parse(raw) as { set?: unknown; unset?: unknown }) : {};
    return { set: Number(c.set) || 0, unset: Number(c.unset) || 0 };
  } catch {
    return { set: 0, unset: 0 };
  }
}

/** What the assignments page says about the last product sync. */
export function syncStatus(state: SyncStateInput | null, now: Date): SyncStatus {
  if (!state) return { kind: 'never' };
  if (state.syncError) return { kind: 'error', message: state.syncError };
  const { syncStartedAt: started, syncFinishedAt: finished } = state;
  if (started && (!finished || started > finished)) {
    return now.getTime() - started.getTime() < STALL_MS ? { kind: 'syncing' } : { kind: 'stalled' };
  }
  if (finished) return { kind: 'done', finishedAt: finished, ...parseCounts(state.syncCounts) };
  return { kind: 'never' };
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function relativeTime(then: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}
