import db from '../db.server';
import type { AdminClient } from './admin.server';
import { fetchAllFacts } from './assign.server';
import type { ChartDraft } from './chart-model';
import { listCharts } from './charts.server';
import { mappingIssues, parseSizeOptionNames, type MappingIssue } from './size-mapping';

export const DEFAULT_SIZE_OPTION_NAMES = 'Size';

/** The shop's raw size-option-names setting (comma-separated), "Size" until saved. */
export async function loadSizeOptionNames(shop: string): Promise<string> {
  const state = await db.shopState.findUnique({ where: { shop } });
  return state?.sizeOptionNames ?? DEFAULT_SIZE_OPTION_NAMES;
}

export async function saveSizeOptionNames(shop: string, raw: string): Promise<string> {
  const names = parseSizeOptionNames(raw);
  const sizeOptionNames = names.length > 0 ? names.join(', ') : DEFAULT_SIZE_OPTION_NAMES;
  await db.shopState.upsert({ where: { shop }, create: { shop, sizeOptionNames }, update: { sizeOptionNames } });
  return sizeOptionNames;
}

/** Size-label mismatches for every product that has a chart (pages through all products). */
export async function loadMappingIssues(
  admin: AdminClient,
  shop: string,
  charts?: ChartDraft[],
): Promise<{ issues: MappingIssue[]; charts: ChartDraft[]; sizeOptionNames: string }> {
  const [chartList, facts, sizeOptionNames] = await Promise.all([
    charts ?? listCharts(admin),
    fetchAllFacts(admin),
    loadSizeOptionNames(shop),
  ]);
  const byId = new Map(chartList.flatMap((c) => (c.id ? [[c.id, c] as const] : [])));
  const assigned = facts.filter((p) => p.chartId !== null);
  return {
    issues: mappingIssues(assigned, byId, parseSizeOptionNames(sizeOptionNames)),
    charts: chartList,
    sizeOptionNames,
  };
}
