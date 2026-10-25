import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const toml = readFileSync('shopify.app.toml', 'utf8');

describe('shopify.app.toml scopes', () => {
  it('requests exactly the four write scopes and nothing protected', () => {
    const line = toml.split(/\r?\n/).find((l) => l.startsWith('scopes ='));
    expect(line).toBe('scopes = "write_products,write_metaobjects,write_metaobject_definitions,write_app_proxy"');
  });
});

describe('shopify.app.toml webhooks', () => {
  it('subscribes /webhooks/compliance to all three privacy compliance topics', () => {
    const blocks = toml.split('[[webhooks.subscriptions]]').slice(1);
    const compliance = blocks.find((b) => /uri = "\/webhooks\/compliance"/.test(b));
    expect(compliance).toBeDefined();
    const topics = compliance!.match(/compliance_topics = \[([^\]]*)\]/)?.[1] ?? '';
    for (const topic of ['customers/data_request', 'customers/redact', 'shop/redact']) {
      expect(topics).toContain(`"${topic}"`);
    }
  });
});

describe('app sources', () => {
  it('never use shopifyqlQuery or read_reports', () => {
    const files = (readdirSync('app', { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => join('app', f));
    const offenders = files.filter((f) => /shopifyqlQuery|read_reports/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
