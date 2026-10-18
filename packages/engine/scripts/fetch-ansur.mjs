// Downloads the public-domain ANSUR II anthropometric survey (US Army, 2012)
// published by the Open Design Lab at Penn State: https://www.openlab.psu.edu/ansur2/
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
await mkdir(dataDir, { recursive: true });

for (const sex of ['MALE', 'FEMALE']) {
  const url = `https://tools.openlab.psu.edu/publicData/ANSUR_II_${sex}_Public.csv`;
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  const header = body.subarray(0, 4096).toString('latin1').split(/\r?\n/)[0] ?? '';
  if (!res.ok || !header.split(',').includes('stature')) {
    throw new Error(`Unexpected response from ${url} (HTTP ${res.status})`);
  }
  await writeFile(join(dataDir, `ansur2-${sex.toLowerCase()}.csv`), body);
  console.log(`saved ansur2-${sex.toLowerCase()}.csv (${body.length} bytes)`);
}
