import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SUPPORT_EMAIL } from './brand';

const PRICE = /\$\s?\d/;

describe('public landing page', () => {
  const source = readFileSync('app/routes/_index/route.tsx', 'utf8');

  it('never asks for a shop domain (App Store requirement 2.3.1)', () => {
    expect(source).not.toMatch(/name="shop"/);
    expect(source).not.toMatch(/\blogin\b/);
    expect(source).not.toMatch(/<Form\b/);
  });

  it('shows no prices outside the listing’s Pricing details', () => {
    expect(source).not.toMatch(PRICE);
  });
});

describe('privacy policy', () => {
  it('states what is never collected, where measurements stay, and when data is deleted', async () => {
    const { default: PrivacyPolicy } = await import('../routes/privacy');
    const html = renderToString(createElement(PrivacyPolicy));
    for (const text of ['never', 'localStorage', 'uninstalled', 'shop/redact', SUPPORT_EMAIL]) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(PRICE);
  });
});
