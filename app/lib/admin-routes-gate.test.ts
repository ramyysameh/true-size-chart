// The paywall rule for embedded admin routes (see gate.server.ts): the app.tsx layout loader gates every
// page load, and React Router runs only the posted route's action, so every action must gate itself.
// Lives in app/lib because flatRoutes would treat a file in app/routes as a route.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../routes');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const routes = readdirSync(dir).filter((f) => /^app\..+\.tsx$/.test(f));

/** Source of one exported `loader` or `action`, up to the next top-level export. */
function exportBody(src: string, name: 'loader' | 'action'): string | null {
  const start = src.search(new RegExp(`export const ${name}\\b`));
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('admin route paywall', () => {
  it('finds the admin routes to check', () => {
    expect(routes.length).toBeGreaterThanOrEqual(7);
  });

  it('gates every page load in the app layout loader', () => {
    const body = exportBody(read('app.tsx'), 'loader');
    expect(body).toMatch(/authenticatePro\(/);
  });

  it.each(routes)('%s gates its action through authenticatePro', (file) => {
    const body = exportBody(read(file), 'action');
    if (body === null) return; // no action, nothing to gate
    expect(body).toMatch(/authenticatePro\(/);
    expect(body).not.toMatch(/authenticate\.admin\(/);
  });
});
