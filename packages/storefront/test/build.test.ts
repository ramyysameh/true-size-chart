import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(pkg, '..', '..', 'extensions', 'true-size-chart');

describe('build', () => {
  it('writes the finder bundle, stylesheet and loader snippet', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: pkg, stdio: 'pipe' });
    const snippet = readFileSync(join(ext, 'snippets', 'tsc-loader.liquid'), 'utf8');
    expect(snippet.startsWith('{%- doc -%}')).toBe(true);
    expect(snippet.match(/\{% raw %\}/g)).toHaveLength(1);
    expect(snippet.match(/\{% endraw %\}/g)).toHaveLength(1);
    expect(readFileSync(join(ext, 'assets', 'tsc-finder.js'), 'utf8')).toContain('true-size-finder');
    expect(readFileSync(join(ext, 'assets', 'tsc-finder.css'), 'utf8').length).toBeGreaterThan(0);
  }, 30_000);

  it('compacts the drawer chrome on phones, after the base rules so the overrides win', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: pkg, stdio: 'pipe' });
    const css = readFileSync(join(ext, 'assets', 'tsc-finder.css'), 'utf8').replace(/\s+/g, '');
    const blocks = [...css.matchAll(/@media\(max-width:749px\)\{((?:[^{}]*\{[^{}]*\})*)\}/g)];
    const compact = blocks.find((b) => b[1].includes('.tsc-body{padding:16px}'));
    expect(compact).toBeDefined();
    expect(compact![1]).toContain('env(safe-area-inset-bottom)');
    expect(compact!.index).toBeGreaterThan(css.indexOf('.tsc-body{'));
    expect(compact!.index).toBeGreaterThan(css.indexOf('.tsc-foot{'));
  }, 30_000);
});
