import { describe, expect, it, vi } from 'vitest';
import { createTracker } from '../src/events';

const CHART = { key: 'tee' } as Parameters<typeof createTracker>[0]['chart'];
const CONFIG = { events: '/apps/tsc/e', chart: CHART };

function fakeNav() {
  const calls: [string, string][] = [];
  return {
    calls,
    nav: {
      sendBeacon(url: string, data: string) {
        calls.push([url, data]);
        return true;
      },
    },
  };
}

describe('createTracker', () => {
  it('sends open once per tracker', () => {
    const { calls, nav } = fakeNav();
    const t = createTracker(CONFIG, nav);
    t.open();
    t.open();
    expect(calls).toEqual([['/apps/tsc/e', '{"e":"open","c":"tee"}']]);
  });

  it('sends complete once, with the first size', () => {
    const { calls, nav } = fakeNav();
    const t = createTracker(CONFIG, nav);
    t.complete('L');
    t.complete('M');
    expect(calls).toEqual([['/apps/tsc/e', '{"e":"complete","c":"tee","s":"L"}']]);
  });

  it('sends atc on every call', () => {
    const { calls, nav } = fakeNav();
    const t = createTracker(CONFIG, nav);
    t.addToCart('L');
    t.addToCart('L');
    expect(calls).toHaveLength(2);
    for (const [, data] of calls) expect(data).toBe('{"e":"atc","c":"tee","s":"L"}');
  });

  it('sends nothing without an events URL', () => {
    const { calls, nav } = fakeNav();
    const t = createTracker({ chart: CHART }, nav);
    t.open();
    t.complete('L');
    t.addToCart('L');
    expect(calls).toHaveLength(0);
  });

  it('sends nothing in the admin preview', () => {
    const { calls, nav } = fakeNav();
    const t = createTracker({ ...CONFIG, preview: true }, nav);
    t.open();
    t.complete('L');
    t.addToCart('L');
    expect(calls).toHaveLength(0);
  });

  it('does not throw when sendBeacon is missing', () => {
    const t = createTracker(CONFIG, {});
    expect(() => {
      t.open();
      t.complete('L');
      t.addToCart('L');
    }).not.toThrow();
  });

  it('swallows a throwing sendBeacon', () => {
    const t = createTracker(CONFIG, {
      sendBeacon() {
        throw new TypeError('blocked');
      },
    });
    expect(() => {
      t.open();
      t.complete('L');
      t.addToCart('L');
    }).not.toThrow();
  });

  it('defaults to globalThis.navigator', () => {
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);
    try {
      createTracker(CONFIG).open();
      expect(beacon.mock.calls).toEqual([['/apps/tsc/e', '{"e":"open","c":"tee"}']]);
    } finally {
      beacon.mockRestore();
    }
  });

  it('never sends a key besides e, c and s', () => {
    const { calls, nav } = fakeNav();
    const t = createTracker(CONFIG, nav);
    t.open();
    t.complete('L');
    t.addToCart('XL');
    expect(calls).toHaveLength(3);
    for (const [, data] of calls) {
      const parsed: unknown = JSON.parse(data);
      expect(parsed).toBeTypeOf('object');
      for (const key of Object.keys(parsed as object)) expect(['e', 'c', 's']).toContain(key);
    }
  });
});
