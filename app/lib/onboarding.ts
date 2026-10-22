import type { ActivationState } from './theme-links';

export type Step = 1 | 2 | 3 | 4;

export function parseStep(raw: string | null): Step {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 4) as Step;
}

/** `?charts=a,b` -> chart handles created in this onboarding flow (junk and duplicates dropped). */
export function parseChartHandles(raw: string | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const h = part.trim();
    if (/^[A-Za-z0-9_-]+$/.test(h) && !out.includes(h)) out.push(h);
  }
  return out;
}

export function onboardingUrl(step: Step, handles: string[]): string {
  const params = new URLSearchParams({ step: String(step) });
  if (handles.length > 0) params.set('charts', handles.join(','));
  return `/app/onboarding?${params.toString().replace(/%2C/g, ',')}`;
}

/** Templates picked in step 1 that this flow has not created yet (matched by chart name). */
export function templatesToCreate<T extends { key: string; name: string }>(
  pickedKeys: string[],
  templates: readonly T[],
  flowChartNames: string[],
): T[] {
  const made = new Set(flowChartNames);
  return templates.filter((t) => pickedKeys.includes(t.key) && !made.has(t.name));
}

export interface ChecklistItem {
  key: 'embed' | 'block' | 'charts' | 'rules' | 'mapping';
  label: string;
  done: boolean;
  href: string;
}

export function setupChecklist(s: {
  embed: ActivationState;
  block: ActivationState;
  charts: number;
  rules: number;
}): ChecklistItem[] {
  return [
    { key: 'embed', label: 'Turn on the app embed', done: s.embed === 'active', href: '/app/onboarding?step=4' },
    { key: 'block', label: 'Place the size finder button on your product page', done: s.block === 'active', href: '/app/onboarding?step=4' },
    { key: 'charts', label: 'Create a size chart', done: s.charts > 0, href: '/app/charts' },
    { key: 'rules', label: 'Assign charts to products', done: s.rules > 0, href: '/app/rules' },
    { key: 'mapping', label: 'Check size mapping', done: false, href: '/app/mapping' },
  ];
}

/** A `returnTo` that points back into onboarding; anything else (other paths, other origins) is rejected. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || /[\\\s]/.test(value)) return null;
  if (value === '/app/onboarding' || value.startsWith('/app/onboarding?')) return value;
  return null;
}
