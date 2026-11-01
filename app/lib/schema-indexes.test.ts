// The event flood guard counts EventDaily rows by shop and date on every new chart key
// (events.server.ts); without its own index that count scans every row the shop has.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');

function modelBody(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`model ${name} not found`);
  return match[1];
}

describe('schema indexes', () => {
  it('indexes EventDaily by shop and date for the chart-key cap', () => {
    expect(modelBody('EventDaily')).toMatch(/@@index\(\[shop, date\]\)/);
  });
});
