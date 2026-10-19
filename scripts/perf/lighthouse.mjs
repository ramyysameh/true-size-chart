#!/usr/bin/env node
// Lighthouse performance delta for the storefront finder.
//
//   node scripts/perf/lighthouse.mjs --url <pdp> --label <off|on> [--runs 5]
//   node scripts/perf/lighthouse.mjs --compare off on
//
// `--label on` is measured with the app embed and "Find my size" block enabled,
// `--label off` with both disabled. The password-protected dev store needs the
// storefront_digest cookie, passed through the TSC_LH_COOKIE environment variable.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_DELTA = 3;
const LABELS = ['off', 'on'];
const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'results');

const USAGE = `Usage:
  node scripts/perf/lighthouse.mjs --url <pdp> --label <off|on> [--runs 5]
  node scripts/perf/lighthouse.mjs --compare off on

  --url      product page to audit
  --label    "on" (embed and block enabled) or "off" (both disabled)
  --runs     Lighthouse runs, the median performance score is kept (default 5)
  --compare  print both medians and the delta (off - on); exit 1 when the delta exceeds ${MAX_DELTA}

Environment:
  TSC_LH_COOKIE  value of the storefront_digest cookie from an unlocked browser session`;

function fail(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function resultPath(label) {
  return join(RESULTS_DIR, `${label}.json`);
}

function readResult(label) {
  const file = resultPath(label);
  if (!existsSync(file)) {
    fail(`No result for "${label}" (${file}). Run it with --label ${label} first.`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function compare(a, b) {
  if (a !== 'off' || b !== 'on') fail('--compare takes "off on", in that order.');
  const off = readResult('off');
  const on = readResult('on');
  const delta = off.median - on.median;
  console.log(`off median: ${off.median}`);
  console.log(`on median:  ${on.median}`);
  console.log(`delta (off - on): ${delta}`);
  if (delta > MAX_DELTA) {
    console.error(`FAIL: the finder costs ${delta} Lighthouse points (budget ${MAX_DELTA}).`);
    process.exit(1);
  }
  console.log(`OK: within the ${MAX_DELTA}-point budget.`);
}

// One command string through the shell: npx is npx.cmd on Windows, which cannot be spawned directly.
const quote = (value) => `"${value}"`;

function runLighthouse(url, headersFile, outFile) {
  const command = [
    'npx lighthouse@12',
    quote(url),
    '--only-categories=performance',
    '--form-factor=mobile',
    '--output=json',
    `--output-path=${quote(outFile)}`,
    '--quiet',
    '--chrome-flags="--headless=new"',
    `--extra-headers=${quote(headersFile)}`,
  ].join(' ');
  const result = spawnSync(command, { stdio: ['ignore', 'inherit', 'inherit'], shell: true });
  if (result.status !== 0) {
    throw new Error(`lighthouse exited with ${result.status ?? result.error?.message}`);
  }
  const report = JSON.parse(readFileSync(outFile, 'utf8'));
  const score = report.categories?.performance?.score;
  if (typeof score !== 'number') throw new Error('lighthouse report has no performance score');
  return Math.round(score * 100);
}

function measure(url, label, runs) {
  const cookie = process.env.TSC_LH_COOKIE;
  if (!cookie) fail('TSC_LH_COOKIE is not set (storefront_digest cookie value).');

  const dir = mkdtempSync(join(tmpdir(), 'tsc-lh-'));
  const headersFile = join(dir, 'headers.json');
  const outFile = join(dir, 'report.json');
  writeFileSync(headersFile, JSON.stringify({ Cookie: `storefront_digest=${cookie}` }));

  const scores = [];
  try {
    for (let i = 1; i <= runs; i++) {
      const score = runLighthouse(url, headersFile, outFile);
      console.log(`run ${i}/${runs}: ${score}`);
      scores.push(score);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const result = { label, url, runs, scores, median: median(scores), at: new Date().toISOString() };
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(resultPath(label), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${label} median: ${result.median} -> ${resultPath(label)}`);
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const compareAt = argv.indexOf('--compare');
  if (compareAt !== -1) {
    compare(argv[compareAt + 1], argv[compareAt + 2]);
    return;
  }

  const flags = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--url', '--label', '--runs'].includes(flag) || argv[i + 1] === undefined) {
      fail(`Unexpected argument: ${flag}`);
    }
    flags.set(flag, argv[i + 1]);
  }

  const url = flags.get('--url');
  const label = flags.get('--label');
  const runs = Number(flags.get('--runs') ?? 5);
  if (!url) fail('--url is required.');
  if (!LABELS.includes(label)) fail('--label must be "off" or "on".');
  if (!Number.isInteger(runs) || runs < 1) fail('--runs must be a positive integer.');
  measure(url, label, runs);
}

main(process.argv.slice(2));
