import type { FinderConfig } from './config';

export type AddResult = { ok: true } | { ok: false; message: string | null };

const BUBBLE_ID = 'cart-icon-bubble';
/** Dawn's cart drawer: the <cart-drawer> element, its section id, and the node its section swaps. */
const DRAWER = 'cart-drawer';
const DRAWER_INNER = 'CartDrawer';

interface CartResponse {
  description?: unknown;
  message?: unknown;
  sections?: Record<string, unknown> | null;
}

async function readBody(res: Response): Promise<CartResponse> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === 'object' ? (body as CartResponse) : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Swaps `target`'s contents for those of `selector` in a freshly rendered section; true when it did. */
function swap(target: Element | null, html: unknown, selector: string): boolean {
  if (!target || typeof html !== 'string') return false;
  const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  if (!fresh) return false;
  target.innerHTML = fresh.innerHTML;
  return true;
}

/** Adds one unit of a variant through the AJAX Cart API; never throws. */
export async function addToCart(config: FinderConfig, variantId: number, doc: Document): Promise<AddResult> {
  const drawer = doc.querySelector(DRAWER);
  const bubble = doc.getElementById(BUBBLE_ID);
  const payload: Record<string, unknown> = { items: [{ id: variantId, quantity: 1 }] };
  const sections = [drawer && DRAWER, bubble && BUBBLE_ID].filter(Boolean);
  if (sections.length) {
    payload.sections = sections.join(',');
    payload.sections_url = doc.location.pathname;
  }

  let body: CartResponse;
  try {
    const res = await fetch(`${config.routes.cartAdd}.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    body = await readBody(res);
    if (!res.ok) return { ok: false, message: text(body.description) ?? text(body.message) };
  } catch {
    return { ok: false, message: null };
  }
  doc.dispatchEvent(new CustomEvent('tsc:cart-added', { detail: { variantId } }));

  // The add has succeeded: theme markup we misread may leave a widget stale, never turn this into a failure.
  const rendered = body.sections ?? {};
  try {
    if (drawer && swap(doc.getElementById(DRAWER_INNER), rendered[DRAWER], `#${DRAWER_INNER}`)) drawer.classList.remove('is-empty');
  } catch {
    /* the drawer stays as it was */
  }
  try {
    swap(bubble, rendered[BUBBLE_ID], '.shopify-section');
  } catch {
    /* the bubble stays as it was */
  }
  return { ok: true };
}
