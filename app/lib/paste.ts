import type { ChartTable, Dim } from '@true-size-chart/engine';

export type PasteResult =
  | { ok: true; table: ChartTable; ignored: string[] }
  | { ok: false; error: string };

const SYNONYMS: Record<string, Dim> = {
  chest: 'chest',
  bust: 'chest',
  'chest width': 'chest',
  'pit to pit': 'chest',
  waist: 'waist',
  hip: 'hip',
  hips: 'hip',
  length: 'length',
  'body length': 'length',
  'total length': 'length',
  inseam: 'inseam',
  'inside leg': 'inseam',
  'inner leg': 'inseam',
};
const SIZE_HEADERS = new Set(['size', 'sizes', 'size name', 'size label']);
const DIM_ORDER: readonly Dim[] = ['chest', 'waist', 'hip', 'length', 'inseam'];
const QUOTES = /["“”″]/g;
const NO_SPLIT =
  'Could not tell the columns apart (a decimal comma like 52,5 can look like two cells). Copy the table from your spreadsheet, or separate columns with tabs or semicolons.';

function cleanHeader(h: string): string {
  return h
    .replace(QUOTES, '')
    .trim()
    .replace(/\s*\((cm|in)\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function dimOf(h: string): Dim | undefined {
  return SYNONYMS[cleanHeader(h)];
}

function splitRows(text: string): string[][] | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'Paste a header row and at least one size row.' };
  let delim = ',';
  if (text.includes('\t')) delim = '\t';
  else if (text.includes(';')) delim = ';';
  else if (lines.some((l) => /^\s*\d+,\d{1,2}\s*$/.test(l))) {
    // A row that is just "52,5" is a decimal, not two cells.
    return { error: NO_SPLIT };
  }
  return lines.map((l) => dropTrailingEmpty(l.split(delim).map((c) => c.replace(QUOTES, '').trim())));
}

/** Spreadsheet CSV exports end rows with empty cells ("S,52,"); they are not columns. */
function dropTrailingEmpty(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === '') end--;
  return cells.slice(0, end);
}

/** number, null for blank, undefined when unreadable. */
function parseValue(raw: string): number | null | undefined {
  const s = raw
    .replace(QUOTES, '')
    .replace(/\s*(cm|inches|inch|in)\b/gi, '')
    .trim();
  if (s === '') return null;
  const num = '(\\d+(?:[.,]\\d+)?)';
  const toNum = (x: string) => Number(x.replace(',', '.'));
  const range = new RegExp(`^${num}\\s*[-–—]\\s*${num}$`).exec(s);
  if (range) return (toNum(range[1]) + toNum(range[2])) / 2;
  if (new RegExp(`^${num}$`).test(s)) return toNum(s);
  return undefined;
}

export function parsePastedTable(text: string): PasteResult {
  const split = splitRows(text);
  if ('error' in split) return { ok: false, error: split.error };
  // A data row wider than the header usually means a decimal comma ("52,5") was split. Never guess.
  if (split.slice(1).some((r) => r.length > split[0].length)) return { ok: false, error: NO_SPLIT };
  const width = split[0].length;
  let rows = split.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);

  // Sizes across the top: the first column below the header names measurements.
  if (rows.slice(1).every((r) => dimOf(r[0]) !== undefined)) {
    rows = rows[0].map((_, c) => rows.map((r) => r[c]));
  }
  if (rows.length < 2) return { ok: false, error: 'Paste a header row and at least one size row.' };

  const header = rows[0];
  const sizeCol = header.findIndex((h, i) => SIZE_HEADERS.has(cleanHeader(h)) || (i === 0 && h.trim() === ''));
  if (sizeCol === -1) return { ok: false, error: 'No size column found. Name the first column "Size".' };

  const dimCols = new Map<Dim, number>();
  const ignored: string[] = [];
  header.forEach((h, i) => {
    if (i === sizeCol) return;
    const dim = dimOf(h);
    if (dim && !dimCols.has(dim)) dimCols.set(dim, i);
    else if (h.trim() !== '') ignored.push(h.trim());
  });
  if (dimCols.size === 0) {
    return {
      ok: false,
      error: 'No measurement columns recognised. Use headers like Chest, Waist, Hip, Length or Inseam.',
    };
  }

  const sizes: string[] = [];
  const columns = new Map<Dim, (number | null)[]>([...dimCols.keys()].map((d) => [d, []]));
  for (const row of rows.slice(1)) {
    const label = row[sizeCol].trim();
    const cells = [...dimCols.entries()].map(([dim, c]) => ({ dim, raw: row[c] }));
    if (label === '') {
      if (cells.every((c) => c.raw.trim() === '')) continue;
      return { ok: false, error: 'A row has measurements but no size label.' };
    }
    const parsed: [Dim, number | null][] = [];
    for (const { dim, raw } of cells) {
      const v = parseValue(raw);
      if (v === undefined) {
        return { ok: false, error: `Could not read "${raw.trim()}" for size ${label} (${dim}).` };
      }
      parsed.push([dim, v]);
    }
    sizes.push(label);
    for (const [dim, v] of parsed) columns.get(dim)!.push(v);
  }
  if (sizes.length === 0) return { ok: false, error: 'No size rows found.' };

  const measurements: ChartTable['measurements'] = {};
  for (const dim of DIM_ORDER) {
    const col = columns.get(dim);
    if (col) measurements[dim] = col;
  }
  return { ok: true, table: { sizes, measurements }, ignored };
}
