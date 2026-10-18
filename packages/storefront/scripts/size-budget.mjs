// Fails when a storefront asset exceeds its budget (storefront speed is a product promise).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'extensions', 'true-size-chart');
const gzip = (buf) => gzipSync(buf, { level: 9 }).length;

// The loader is inline, so its raw size counts: measure the code between the raw tags.
const snippet = readFileSync(join(ext, 'snippets', 'tsc-loader.liquid'), 'utf8');
const loader = snippet.slice(snippet.indexOf('{% raw %}') + 9, snippet.indexOf('{% endraw %}'));

const checks = [
  { name: 'tsc-finder.js (gzip)', size: gzip(readFileSync(join(ext, 'assets', 'tsc-finder.js'))), budget: 15360 },
  { name: 'tsc-finder.css (gzip)', size: gzip(readFileSync(join(ext, 'assets', 'tsc-finder.css'))), budget: 4096 },
  { name: 'inline loader (raw)', size: Buffer.byteLength(loader), budget: 1024 },
];

let failed = false;
for (const { name, size, budget } of checks) {
  const over = size > budget;
  failed ||= over;
  console.log(`${name}: ${size} B (budget ${budget} B)${over ? ' OVER BUDGET' : ''}`);
}
if (failed) process.exit(1);
