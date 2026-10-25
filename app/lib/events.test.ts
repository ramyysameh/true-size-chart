import { describe, expect, it, vi } from 'vitest';
import { localDate, MAX_EVENT_BYTES, parseEvent, RateLimiter, readCapped } from './events';

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

/** A POST request whose body is a stream of the given chunks; `pulled` counts chunks handed out. */
function streamRequest(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const state = { pulled: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (state.pulled >= chunks.length) return controller.close();
        controller.enqueue(chunks[state.pulled++]);
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request('https://app.test/proxy/e', { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
  return { request, state };
}
const bytes = (s: string) => new TextEncoder().encode(s);

describe('readCapped', () => {
  it('exports the cap parseEvent uses', () => {
    expect(MAX_EVENT_BYTES).toBe(512);
    expect(parseEvent('x'.repeat(MAX_EVENT_BYTES + 1))).toBeNull();
  });

  it('refuses on content-length alone, without touching the body', async () => {
    const pull = vi.fn(() => {
      throw new Error('body must not be read');
    });
    const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
    const request = new Request('https://app.test/proxy/e', {
      method: 'POST',
      headers: { 'content-length': '100000' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBeNull();
    expect(pull).not.toHaveBeenCalled();
  });

  it('cancels a headerless stream once it passes the cap', async () => {
    const chunks = Array.from({ length: 6 }, () => bytes('a'.repeat(100)));
    const { request, state } = streamRequest(chunks);
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBeNull();
    // cancel() only fires on a stream that has not closed, so the cap stopped the read before the end.
    expect(state.cancelled).toBe(true);
  });

  it('returns a small body unchanged', async () => {
    const json = JSON.stringify({ e: 'complete', c: 'tee', s: 'M', pad: 'x'.repeat(40) });
    expect(json.length).toBeGreaterThan(50);
    const { request } = streamRequest([bytes(json)]);
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBe(json);
  });

  it('joins a body split across chunks', async () => {
    const { request } = streamRequest([bytes('{"e":"open",'), bytes('"c":"tee"}')]);
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBe('{"e":"open","c":"tee"}');
  });

  it('does not trust a lying content-length', async () => {
    const { request } = streamRequest([bytes('a'.repeat(300)), bytes('a'.repeat(300))], { 'content-length': '10' });
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBeNull();
  });

  it('counts bytes, not characters', async () => {
    const ok = streamRequest([bytes('é'.repeat(200))]);
    expect(await readCapped(ok.request, MAX_EVENT_BYTES)).toBe('é'.repeat(200));
    const tooBig = streamRequest([bytes('é'.repeat(300))]);
    expect(await readCapped(tooBig.request, MAX_EVENT_BYTES)).toBeNull();
  });

  it('decodes a multi-byte character split across chunks', async () => {
    const e = bytes('é');
    const { request } = streamRequest([e.slice(0, 1), e.slice(1)]);
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBe('é');
  });

  it('treats a missing body as empty', async () => {
    const request = new Request('https://app.test/proxy/e', { method: 'POST' });
    expect(await readCapped(request, MAX_EVENT_BYTES)).toBe('');
  });
});
