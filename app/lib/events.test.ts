import { describe, expect, it } from 'vitest';
import { localDate, parseEvent, RateLimiter } from './events';

describe('parseEvent', () => {
  it('accepts the three valid shapes', () => {
    expect(parseEvent('{"e":"open","c":"tee-chart"}')).toEqual({ e: 'open', c: 'tee-chart' });
    expect(parseEvent('{"e":"complete","c":"tee_1","s":"M"}')).toEqual({ e: 'complete', c: 'tee_1', s: 'M' });
    expect(parseEvent('{"e":"atc","c":"tee","s":" XL "}')).toEqual({ e: 'atc', c: 'tee', s: 'XL' });
  });

  it('ignores s on open', () => {
    expect(parseEvent('{"e":"open","c":"tee","s":"M"}')).toEqual({ e: 'open', c: 'tee' });
  });

  it('rejects a body over 512 bytes', () => {
    const body = JSON.stringify({ e: 'open', c: 'tee', pad: 'x'.repeat(600) });
    expect(parseEvent(body)).toBeNull();
  });

  it('counts bytes, not characters', () => {
    // 200 three-byte chars = 600 bytes but only ~230 characters.
    const body = JSON.stringify({ e: 'open', c: 'tee', pad: '€'.repeat(200) });
    expect(body.length).toBeLessThan(512);
    expect(parseEvent(body)).toBeNull();
  });

  it('rejects non-JSON, non-objects and unknown names', () => {
    expect(parseEvent('{')).toBeNull();
    expect(parseEvent('')).toBeNull();
    expect(parseEvent('[]')).toBeNull();
    expect(parseEvent('null')).toBeNull();
    expect(parseEvent('"open"')).toBeNull();
    expect(parseEvent('{"e":"view"}')).toBeNull();
    expect(parseEvent('{"e":"view","c":"tee"}')).toBeNull();
  });

  it('rejects a bad chart key', () => {
    expect(parseEvent('{"e":"open","c":"Tee Shirt"}')).toBeNull();
    expect(parseEvent('{"e":"open"}')).toBeNull();
    expect(parseEvent('{"e":"open","c":""}')).toBeNull();
    expect(parseEvent(JSON.stringify({ e: 'open', c: 'a'.repeat(65) }))).toBeNull();
    expect(parseEvent('{"e":"open","c":5}')).toBeNull();
  });

  it('rejects a bad size on complete and atc', () => {
    expect(parseEvent('{"e":"complete","c":"tee","s":""}')).toBeNull();
    expect(parseEvent('{"e":"complete","c":"tee","s":"   "}')).toBeNull();
    expect(parseEvent(JSON.stringify({ e: 'complete', c: 'tee', s: 'x'.repeat(17) }))).toBeNull();
    expect(parseEvent('{"e":"atc","c":"tee","s":"L\\n"}')).toBeNull();
    expect(parseEvent('{"e":"atc","c":"tee","s":"L\\u007f"}')).toBeNull();
    expect(parseEvent('{"e":"atc","c":"tee"}')).toBeNull();
    expect(parseEvent('{"e":"atc","c":"tee","s":3}')).toBeNull();
  });

  it('accepts a 16-char size', () => {
    expect(parseEvent(JSON.stringify({ e: 'complete', c: 'tee', s: 'x'.repeat(16) }))).toEqual({
      e: 'complete',
      c: 'tee',
      s: 'x'.repeat(16),
    });
  });

  it('drops extra keys', () => {
    expect(parseEvent('{"e":"complete","c":"tee","s":"M","height":180}')).toEqual({ e: 'complete', c: 'tee', s: 'M' });
    expect(parseEvent('{"e":"open","c":"tee","height":180}')).toEqual({ e: 'open', c: 'tee' });
  });
});

describe('localDate', () => {
  const now = new Date('2026-10-24T06:30:00Z');

  it('uses the shop time zone', () => {
    expect(localDate(now, 'America/Los_Angeles')).toBe('2026-10-23');
    expect(localDate(now, 'Asia/Tokyo')).toBe('2026-10-24');
  });

  it('falls back to UTC for a missing or invalid zone', () => {
    expect(localDate(now, 'Not/AZone')).toBe('2026-10-24');
    expect(localDate(now, null)).toBe('2026-10-24');
    expect(localDate(now, undefined)).toBe('2026-10-24');
    expect(localDate(new Date('2026-10-24T23:59:59Z'), null)).toBe('2026-10-24');
  });
});

describe('RateLimiter', () => {
  it('allows a burst of 60, refuses the 61st, refills at 10/s', () => {
    let t = 1_000_000;
    const rl = new RateLimiter({ now: () => t });
    for (let i = 0; i < 60; i++) expect(rl.allow('a.myshopify.com')).toBe(true);
    expect(rl.allow('a.myshopify.com')).toBe(false);
    t += 100;
    expect(rl.allow('a.myshopify.com')).toBe(true);
    expect(rl.allow('a.myshopify.com')).toBe(false);
  });

  it('keeps a bucket per shop', () => {
    const t = 0;
    const rl = new RateLimiter({ burst: 1, now: () => t });
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(false);
    expect(rl.allow('b')).toBe(true);
  });

  it('never refills above the burst', () => {
    let t = 0;
    const rl = new RateLimiter({ perSecond: 10, burst: 2, now: () => t });
    t += 60_000;
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(false);
  });
});
