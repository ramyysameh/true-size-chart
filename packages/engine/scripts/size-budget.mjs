// Fails when the minified engine bundle exceeds its gzip budget (storefront speed is a product promise).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 6144;
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'engine.js');
const size = gzipSync(readFileSync(file), { level: 9 }).length;

console.log(`engine.js gzip: ${size} B (budget ${BUDGET_BYTES} B)`);
if (size > BUDGET_BYTES) process.exit(1);
