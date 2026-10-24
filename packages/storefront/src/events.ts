import type { FinderConfig } from './config';

export type EventName = 'open' | 'complete' | 'atc';

export interface Tracker {
  open(): void;
  complete(size: string): void;
  addToCart(size: string): void;
}

/**
 * Anonymous finder events: the event, the chart key and a size label, nothing else.
 * A string body goes as text/plain, so the beacon needs no CORS preflight.
 */
export function createTracker(
  config: Pick<FinderConfig, 'events' | 'preview' | 'chart'>,
  nav: { sendBeacon?(url: string, data: string): boolean } = globalThis.navigator,
): Tracker {
  const once = new Set<EventName>();
  const send = (e: EventName, s?: string) => {
    if (!config.events || config.preview || typeof nav?.sendBeacon !== 'function') return;
    try {
      nav.sendBeacon(config.events, JSON.stringify({ e, c: config.chart.key, s }));
    } catch {
      // A blocked or failing beacon must never break the finder.
    }
  };
  const sendOnce = (e: EventName, s?: string) => {
    if (once.has(e)) return;
    once.add(e);
    send(e, s);
  };
  return {
    open: () => sendOnce('open'),
    complete: (size) => sendOnce('complete', size),
    addToCart: (size) => send('atc', size),
  };
}
