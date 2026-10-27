// Pure helpers for storefront finder events: validation, shop-local days, per-shop rate limiting.

export type ParsedEvent = { e: 'open'; c: string } | { e: 'complete' | 'atc'; c: string; s: string };

export const MAX_EVENT_BYTES = 512;
const CHART_KEY = /^[a-z0-9_-]{1,64}$/;
const encoder = new TextEncoder();

/** True when the string holds U+0000–U+001F or U+007F (a loop, so no control-char regex). */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Reads a request body as UTF-8 text, or null when it is over `max` bytes. A content-length over the
 * cap is refused without touching the body; otherwise the stream is read chunk by chunk (the header
 * can lie or be absent) and cancelled as soon as the running total passes the cap.
 */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Validates a beacon body. Returns only the allowed fields; anything else is dropped. */
export function parseEvent(body: string): ParsedEvent | null {
  if (encoder.encode(body).length > MAX_EVENT_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { e, c, s } = raw as Record<string, unknown>;
  if (typeof c !== 'string' || !CHART_KEY.test(c)) return null;
  if (e === 'open') return { e, c };
  if (e !== 'complete' && e !== 'atc') return null;
  // Control characters are checked before trimming, so "L\n" is refused rather than cleaned to "L".
  if (typeof s !== 'string' || hasControlChar(s)) return null;
  const size = s.trim();
  if (size.length < 1 || size.length > 16) return null;
  return { e, c, s: size };
}

/** 'YYYY-MM-DD' in the shop's time zone; UTC when the zone is unknown or invalid. */
export function localDate(now: Date, timeZone: string | null | undefined): string {
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: timeZone || 'UTC' }).format(now);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: 'UTC' }).format(now);
  }
}

