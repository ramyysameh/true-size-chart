import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToCart } from '../src/cart';
import { CONFIG, mountConfig } from './fixtures/config';

const ID = 1011;

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mountConfig(document);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
};

describe('addToCart', () => {
  it('posts the variant to <cartAdd>.js and resolves ok', async () => {
    fetchMock.mockResolvedValue(reply(200, { items: [] }));
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: true, drawer: false });
    const { url, init, body } = sent();
    expect(url).toBe('/cart/add.js');
    expect(init.method).toBe('POST');
    expect(body).toEqual({ items: [{ id: ID, quantity: 1 }] });
  });

  it('fires tsc:cart-added with the variant id', async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    const seen: unknown[] = [];
    const onAdded = (e: Event) => seen.push((e as CustomEvent).detail);
    document.addEventListener('tsc:cart-added', onAdded);
    await addToCart(CONFIG, ID, document);
    document.removeEventListener('tsc:cart-added', onAdded);
    expect(seen).toEqual([{ variantId: ID }]);
  });

  it('asks for the cart bubble section and swaps its HTML when #cart-icon-bubble exists', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="cart-icon-bubble"><span>0</span></div>');
    fetchMock.mockResolvedValue(
      reply(200, {
        sections: { 'cart-icon-bubble': '<div class="shopify-section"><span>3</span></div>' },
      }),
    );
    await addToCart(CONFIG, ID, document);
    const { body } = sent();
    expect(body.sections).toBe('cart-icon-bubble');
    expect(body.sections_url).toBe(window.location.pathname);
    expect(document.getElementById('cart-icon-bubble')?.innerHTML).toBe('<span>3</span>');
  });

  it("also asks for Dawn's cart drawer, swaps #CartDrawer and clears is-empty when <cart-drawer> exists", async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<cart-drawer class="drawer is-empty"><div id="CartDrawer"><p>Your cart is empty</p></div></cart-drawer><div id="cart-icon-bubble"><span>0</span></div>',
    );
    fetchMock.mockResolvedValue(
      reply(200, {
        sections: {
          'cart-drawer':
            '<div id="shopify-section-cart-drawer" class="shopify-section"><cart-drawer class="drawer"><div id="CartDrawer"><p>1 item</p></div></cart-drawer></div>',
          'cart-icon-bubble': '<div class="shopify-section"><span>1</span></div>',
        },
      }),
    );
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: true, drawer: false });
    expect(sent().body.sections).toBe('cart-drawer,cart-icon-bubble');
    expect(document.getElementById('CartDrawer')?.innerHTML).toBe('<p>1 item</p>');
    expect(document.querySelector('cart-drawer')?.classList.contains('is-empty')).toBe(false);
    expect(document.getElementById('cart-icon-bubble')?.innerHTML).toBe('<span>1</span>');
  });

  it("hands the response to <cart-drawer>'s renderContents and leaves #CartDrawer untouched", async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<cart-drawer class="drawer is-empty"><div id="CartDrawer"><p>Your cart is empty</p></div></cart-drawer><div id="cart-icon-bubble"><span>0</span></div>',
    );
    const renderContents = vi.fn();
    (document.querySelector('cart-drawer') as unknown as { renderContents: unknown }).renderContents = renderContents;
    const body = {
      sections: {
        'cart-drawer': '<div class="shopify-section"><div id="CartDrawer"><p>1 item</p></div></div>',
        'cart-icon-bubble': '<div class="shopify-section"><span>1</span></div>',
      },
    };
    fetchMock.mockResolvedValue(reply(200, body));
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: true, drawer: true });
    expect(renderContents).toHaveBeenCalledTimes(1);
    expect(renderContents).toHaveBeenCalledWith(body);
    expect(document.getElementById('CartDrawer')?.innerHTML).toBe('<p>Your cart is empty</p>');
  });

  it('falls back to swapping #CartDrawer, with drawer false, when renderContents throws', async () => {
    document.body.insertAdjacentHTML('beforeend', '<cart-drawer class="drawer"><div id="CartDrawer"></div></cart-drawer>');
    (document.querySelector('cart-drawer') as unknown as { renderContents: unknown }).renderContents = () => {
      throw new Error('theme');
    };
    fetchMock.mockResolvedValue(
      reply(200, { sections: { 'cart-drawer': '<div class="shopify-section"><div id="CartDrawer"><p>1 item</p></div></div>' } }),
    );
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: true, drawer: false });
    expect(document.getElementById('CartDrawer')?.innerHTML).toBe('<p>1 item</p>');
  });

  it('asks only for the sections whose elements are on the page', async () => {
    document.body.insertAdjacentHTML('beforeend', '<cart-drawer class="drawer"><div id="CartDrawer"></div></cart-drawer>');
    fetchMock.mockResolvedValue(reply(200, {}));
    await addToCart(CONFIG, ID, document);
    expect(sent().body.sections).toBe('cart-drawer');
    expect(sent().body.sections_url).toBe(window.location.pathname);
  });

  it('reports the add as done when a section swap throws, and still swaps the others', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<cart-drawer class="drawer is-empty"><div id="CartDrawer"></div></cart-drawer><div id="cart-icon-bubble"><span>0</span></div>',
    );
    fetchMock.mockResolvedValue(
      reply(200, {
        sections: { 'cart-drawer': '<div id="CartDrawer"></div>', 'cart-icon-bubble': '<div class="shopify-section"><span>1</span></div>' },
      }),
    );
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementationOnce(() => {
      throw new Error('theme markup');
    });
    const seen: unknown[] = [];
    const onAdded = (e: Event) => seen.push((e as CustomEvent).detail);
    document.addEventListener('tsc:cart-added', onAdded);
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: true, drawer: false });
    document.removeEventListener('tsc:cart-added', onAdded);
    expect(seen).toEqual([{ variantId: ID }]);
    expect(document.getElementById('cart-icon-bubble')?.innerHTML).toBe('<span>1</span>');
  });

  it('leaves the bubble alone when the response has no section', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="cart-icon-bubble"><span>0</span></div>');
    fetchMock.mockResolvedValue(reply(200, {}));
    await addToCart(CONFIG, ID, document);
    expect(document.getElementById('cart-icon-bubble')?.innerHTML).toBe('<span>0</span>');
  });

  it('omits sections when there is no #cart-icon-bubble', async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    await addToCart(CONFIG, ID, document);
    const { body } = sent();
    expect(body).not.toHaveProperty('sections');
    expect(body).not.toHaveProperty('sections_url');
  });

  it("returns Shopify's description on a 422 and does not fire the event", async () => {
    fetchMock.mockResolvedValue(
      reply(422, { status: 422, message: 'Cart Error', description: 'All 1 X are in your cart.' }),
    );
    const seen: unknown[] = [];
    const onAdded = (e: Event) => seen.push(e);
    document.addEventListener('tsc:cart-added', onAdded);
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({
      ok: false,
      message: 'All 1 X are in your cart.',
    });
    document.removeEventListener('tsc:cart-added', onAdded);
    expect(seen).toEqual([]);
  });

  it('falls back to message, then null, on an error body', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { message: 'Boom' }));
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: false, message: 'Boom' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => Promise.reject(new Error('not json')) });
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: false, message: null });
  });

  it('returns ok false with no message when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(addToCart(CONFIG, ID, document)).resolves.toEqual({ ok: false, message: null });
  });
});
