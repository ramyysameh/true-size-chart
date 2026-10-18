import type { FinderConfig } from './config';

export type AddResult = { ok: true } | { ok: false; message: string | null };

const BUBBLE_ID = 'cart-icon-bubble';

interface CartResponse {
  description?: unknown;
  message?: unknown;
  sections?: Record<string, unknown>;
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

/** Swaps the theme's cart bubble for the freshly rendered section. */
function refreshBubble(bubble: Element, html: unknown): void {
  if (typeof html !== 'string') return;
  const section = new DOMParser().parseFromString(html, 'text/html').querySelector('.shopify-section');
  if (section) bubble.innerHTML = section.innerHTML;
}

/** Adds one unit of a variant through the AJAX Cart API; never throws. */
export async function addToCart(config: FinderConfig, variantId: number, doc: Document): Promise<AddResult> {
  const bubble = doc.getElementById(BUBBLE_ID);
  const payload: Record<string, unknown> = { items: [{ id: variantId, quantity: 1 }] };
  if (bubble) {
    payload.sections = BUBBLE_ID;
    payload.sections_url = doc.location.pathname;
  }

  try {
    const res = await fetch(`${config.routes.cartAdd}.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await readBody(res);
    if (!res.ok) return { ok: false, message: text(body.description) ?? text(body.message) };

    if (bubble) refreshBubble(bubble, body.sections?.[BUBBLE_ID]);
    doc.dispatchEvent(new CustomEvent('tsc:cart-added', { detail: { variantId } }));
    return { ok: true };
  } catch {
    return { ok: false, message: null };
  }
}
