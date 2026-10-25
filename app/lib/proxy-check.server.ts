import type prisma from '../db.server';

/** Where the storefront sends finder events; must match `[app_proxy]` in shopify.app.toml and the embed. */
export const PROXY_PATH = '/apps/tsc';
export const PROXY_TTL_MS = 6 * 3_600_000;
export type ProxyStatus = 'ok' | 'moved' | 'unknown';

const PING_BODY = 'tsc-ok';
const PROBE_TIMEOUT_MS = 5000;

/**
 * Asks the storefront for the proxy's ping. Only Shopify's own 404 means the merchant renamed the
 * proxy path; a password page, an error or no answer is `unknown`, never a false alarm.
 */
export async function probeProxy(shopDomain: string, fetchImpl: typeof fetch = fetch): Promise<ProxyStatus> {
  try {
    const res = await fetchImpl(`https://${shopDomain}${PROXY_PATH}/ping`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (new URL(res.url).pathname.startsWith('/password')) return 'unknown';
    if (res.status === 404) return 'moved';
    if (res.status === 200 && (await res.text()).trim() === PING_BODY) return 'ok';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The shop's proxy status, probed at most every PROXY_TTL_MS unless `recheck` is set. */
export async function proxyStatus(
  shop: string,
  opts: { recheck?: boolean; db?: typeof prisma; now?: () => Date; probe?: (shopDomain: string) => Promise<ProxyStatus> } = {},
): Promise<ProxyStatus> {
  const db = opts.db ?? (await import('../db.server')).default;
  const now = (opts.now ?? (() => new Date()))();
  const probe = opts.probe ?? ((domain: string) => probeProxy(domain));

  if (!opts.recheck) {
    const state = await db.shopState.findUnique({ where: { shop }, select: { proxyStatus: true, proxyCheckedAt: true } });
    const fresh = state?.proxyCheckedAt && now.getTime() - state.proxyCheckedAt.getTime() < PROXY_TTL_MS;
    if (fresh && isStatus(state.proxyStatus)) return state.proxyStatus;
  }

  const status = await probe(shop);
  const data = { proxyStatus: status, proxyCheckedAt: now };
  await db.shopState.upsert({ where: { shop }, create: { shop, ...data }, update: data });
  return status;
}

function isStatus(value: string | null | undefined): value is ProxyStatus {
  return value === 'ok' || value === 'moved' || value === 'unknown';
}
