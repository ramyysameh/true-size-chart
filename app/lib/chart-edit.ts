import { DIMS, type ChartTable, type Dim } from '@true-size-chart/engine';
import { norm } from './chart-model';

function clone(t: ChartTable): ChartTable {
  const measurements: ChartTable['measurements'] = {};
  for (const dim of DIMS) {
    const col = t.measurements[dim];
    if (col) measurements[dim] = [...col];
  }
  const out: ChartTable = { sizes: [...t.sizes], measurements };
  if (t.aliases) out.aliases = { ...t.aliases };
  return out;
}

export function addSize(t: ChartTable): ChartTable {
  const out = clone(t);
  out.sizes.push('');
  for (const dim of DIMS) out.measurements[dim]?.push(null);
  return out;
}

export function removeSize(t: ChartTable, index: number): ChartTable {
  const out = clone(t);
  const removed = out.sizes[index];
  out.sizes.splice(index, 1);
  for (const dim of DIMS) out.measurements[dim]?.splice(index, 1);
  if (out.aliases && removed !== undefined) {
    for (const [k, target] of Object.entries(out.aliases)) {
      if (norm(target) === norm(removed)) delete out.aliases[k];
    }
    if (Object.keys(out.aliases).length === 0) delete out.aliases;
  }
  return out;
}

export function setSizeLabel(t: ChartTable, index: number, label: string): ChartTable {
  const out = clone(t);
  const old = out.sizes[index];
  out.sizes[index] = label;
  if (out.aliases && old !== undefined) {
    for (const [k, target] of Object.entries(out.aliases)) {
      if (target === old) out.aliases[k] = label;
    }
  }
  return out;
}

export function availableDims(t: ChartTable): Dim[] {
  return DIMS.filter((d) => !t.measurements[d]);
}

export function addDim(t: ChartTable, dim: Dim): ChartTable {
  const out = clone(t);
  if (!out.measurements[dim]) out.measurements[dim] = t.sizes.map(() => null);
  return out;
}

export function removeDim(t: ChartTable, dim: Dim): ChartTable {
  const out = clone(t);
  delete out.measurements[dim];
  return out;
}

/** Empty or unreadable text becomes null; a decimal comma is accepted. */
export function setCell(t: ChartTable, dim: Dim, index: number, text: string): ChartTable {
  const out = clone(t);
  const col = out.measurements[dim];
  if (!col) return out;
  const s = text.trim().replace(',', '.');
  const n = s === '' ? NaN : Number(s);
  col[index] = Number.isFinite(n) ? n : null;
  return out;
}

export function cellText(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}
