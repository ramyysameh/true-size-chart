import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CATEGORIES, TEMPLATES } from "@true-size-chart/engine";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { gql } from "../lib/admin.server";
import { requestSync } from "../lib/assign.server";
import { draftFromTemplate, type ChartDraft } from "../lib/chart-model";
import { getChart, listCharts, saveChart } from "../lib/charts.server";
import { onboardingUrl, parseChartHandles, parseStep, templatesToCreate } from "../lib/onboarding";
import { suggestRules } from "../lib/rules";
import { themeEditorLinks } from "../lib/theme-links";
import { useExtensionStatus } from "../components/useExtensionStatus";

const PRODUCT_TYPES = `#graphql
  query ProductTypes { productTypes(first: 250) { nodes } }
`;

async function loadFlowCharts(admin: Parameters<typeof getChart>[0], handles: string[]): Promise<ChartDraft[]> {
  const charts = await Promise.all(handles.map((h) => getChart(admin, h).catch(() => null)));
  return charts.filter((c): c is ChartDraft => c !== null);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const step = parseStep(url.searchParams.get("step"));
  const handles = parseChartHandles(url.searchParams.get("charts"));
  const flowCharts = await loadFlowCharts(admin, handles);
  const flowNames = new Set(flowCharts.map((c) => c.name));

  const base = {
    step,
    handles: flowCharts.flatMap((c) => (c.handle ? [c.handle] : [])),
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "", // eslint-disable-line no-undef
    templateGroups: CATEGORIES.map((category) => ({
      category,
      templates: TEMPLATES.filter((t) => t.category === category).map((t) => ({
        key: t.key,
        name: t.name,
        audience: t.audience,
      })),
    })).filter((g) => g.templates.length > 0),
    pickedKeys: TEMPLATES.filter((t) => flowNames.has(t.name)).map((t) => t.key),
    flowCharts: flowCharts.map((c) => ({ handle: c.handle ?? "", name: c.name, sizes: c.table.sizes.join(", ") })),
    suggestions: [] as { chartId: string; chartName: string; value: string }[],
  };

  if (step === 3) {
    const pool = flowCharts.length > 0 ? flowCharts : await listCharts(admin);
    const types = await gql<{ productTypes: { nodes: string[] } }>(admin, PRODUCT_TYPES).catch(() => null);
    const names = new Map(pool.map((c) => [c.id ?? "", c.name]));
    base.suggestions = suggestRules(
      pool.flatMap((c) => (c.id ? [{ id: c.id, category: c.category }] : [])),
      (types?.productTypes.nodes ?? []).filter((t) => t.trim() !== ""),
    ).map((s) => ({ chartId: s.chartId, chartName: names.get(s.chartId) ?? "", value: s.value }));
  }
  return base;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const handles = parseChartHandles(url.searchParams.get("charts"));
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    let picked: string[] = [];
    try {
      const parsed: unknown = JSON.parse(String(form.get("templateKeys") ?? "[]"));
      if (Array.isArray(parsed)) picked = parsed.map(String);
    } catch {
      picked = [];
    }
    const existing = await loadFlowCharts(admin, handles);
    const all = [...handles];
    for (const t of templatesToCreate(picked, TEMPLATES, existing.map((c) => c.name))) {
      const template = TEMPLATES.find((x) => x.key === t.key);
      if (!template) continue;
      const result = await saveChart(admin, draftFromTemplate(template));
      if (!result.ok) return { error: result.errors.join(" ") };
      if (result.draft.handle) all.push(result.draft.handle);
    }
    if (all.length === 0) return { error: "Pick at least one chart, or skip this step." };
    return await redirect(onboardingUrl(2, all));
  }

  if (intent === "rules") {
    let wanted: { chartId: string; value: string }[] = [];
    try {
      const parsed: unknown = JSON.parse(String(form.get("rules") ?? "[]"));
      if (Array.isArray(parsed)) {
        wanted = parsed
          .map((r) => ({ chartId: String(r?.chartId ?? ""), value: String(r?.value ?? "").trim() }))
          .filter((r) => r.chartId && r.value);
      }
    } catch {
      wanted = [];
    }
    if (wanted.length > 0) {
      const chartIds = new Set((await listCharts(admin)).map((c) => c.id));
      const current = await db.assignmentRule.findMany({ where: { shop } });
      const last = current.reduce((max, r) => Math.max(max, r.priority), 0);
      const fresh = wanted.filter(
        (r) =>
          chartIds.has(r.chartId) &&
          !current.some((c) => c.type === "product_type" && c.chartId === r.chartId && c.value === r.value),
      );
      if (fresh.length > 0) {
        await db.assignmentRule.createMany({
          data: fresh.map((r, i) => ({
            shop,
            chartId: r.chartId,
            type: "product_type",
            value: r.value,
            label: r.value,
            priority: last + 1 + i,
          })),
        });
        await requestSync(shop);
      }
    }
    return await redirect(onboardingUrl(4, handles));
  }

  if (intent === "finish" || intent === "skip") {
    const onboardedAt = new Date();
    await db.shopState.upsert({ where: { shop }, create: { shop, onboardedAt }, update: { onboardedAt } });
    return await redirect(intent === "skip" ? "/app/charts" : "/app");
  }

  return { error: "Unknown action." };
};

const CATEGORY_LABELS: Record<string, string> = {
  tshirt: "T-shirts",
  shirt: "Shirts",
  hoodie: "Hoodies and sweatshirts",
  jacket: "Jackets",
  dress: "Dresses",
  pants: "Pants and jeans",
  shorts: "Shorts",
  skirt: "Skirts",
};

const STEP_TITLES = ["What do you sell?", "Review your charts", "Assign them", "Turn it on"];

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const post = (payload: Record<string, string>) =>
    fetcher.submit(payload, { method: "post", action: onboardingUrl(data.step, data.handles) });

  return (
    <s-page heading="Set up True: Size Chart">
      <s-text color="subdued">
        Step {data.step} of 4: {STEP_TITLES[data.step - 1]}
      </s-text>

      {error ? (
        <s-banner tone="critical" heading="Something went wrong">
          {error}
        </s-banner>
      ) : null}

      {data.step === 1 ? <StepTemplates key={data.pickedKeys.join()} data={data} busy={busy} post={post} /> : null}
      {data.step === 2 ? <StepReview data={data} /> : null}
      {data.step === 3 ? <StepAssign data={data} busy={busy} post={post} /> : null}
      {data.step === 4 ? <StepTurnOn data={data} busy={busy} post={post} /> : null}
    </s-page>
  );
}

type Data = ReturnType<typeof useLoaderData<typeof loader>>;
interface StepProps {
  data: Data;
  busy: boolean;
  post: (payload: Record<string, string>) => void;
}

function StepTemplates({ data, busy, post }: StepProps) {
  const [picked, setPicked] = useState<string[]>(data.pickedKeys);
  const toggle = (key: string, on: boolean) =>
    setPicked((p) => (on ? [...p.filter((k) => k !== key), key] : p.filter((k) => k !== key)));

  return (
    <s-section heading="What do you sell?">
      <s-stack gap="large">
        <s-paragraph>Pick the kinds of clothing you sell. We create a starter size chart for each.</s-paragraph>
        {data.templateGroups.map((g) => (
          <s-stack key={g.category} gap="small-200">
            <s-heading>{CATEGORY_LABELS[g.category] ?? g.category}</s-heading>
            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="small-200">
              {g.templates.map((t) => (
                <s-checkbox
                  key={t.key}
                  label={t.name}
                  checked={picked.includes(t.key)}
                  onChange={(e) => toggle(t.key, e.currentTarget.checked)}
                ></s-checkbox>
              ))}
            </s-grid>
          </s-stack>
        ))}
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            loading={busy}
            disabled={busy || picked.length === 0}
            onClick={() => post({ intent: "create", templateKeys: JSON.stringify(picked) })}
          >
            Continue
          </s-button>
          <s-button variant="tertiary" disabled={busy} onClick={() => post({ intent: "skip" })}>
            Skip, I will build my own
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function StepReview({ data }: { data: Data }) {
  const next = onboardingUrl(3, data.handles);
  return (
    <s-section heading="Review your charts">
      <s-stack gap="base">
        {data.flowCharts.length === 0 ? (
          <s-paragraph>No charts were created in this setup. You can add charts later from the Charts page.</s-paragraph>
        ) : (
          data.flowCharts.map((c) => (
            <s-stack key={c.handle} direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-stack gap="none">
                <s-text type="strong">{c.name}</s-text>
                <s-text color="subdued">Sizes: {c.sizes}</s-text>
              </s-stack>
              <s-link href={`/app/charts/${c.handle}?returnTo=${encodeURIComponent(onboardingUrl(2, data.handles))}`}>Edit</s-link>
            </s-stack>
          ))
        )}
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" href={next}>
            Continue
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function StepAssign({ data, busy, post }: StepProps) {
  const [off, setOff] = useState<string[]>([]);
  const id = (s: { chartId: string; value: string }) => `${s.chartId}\u0000${s.value}`;
  const chosen = data.suggestions.filter((s) => !off.includes(id(s)));

  return (
    <s-section heading="Assign them">
      <s-stack gap="base">
        {data.suggestions.length === 0 ? (
          <s-paragraph>
            We could not match your product types to these charts. You can assign charts to products from the
            Assignments page.
          </s-paragraph>
        ) : (
          <>
            <s-paragraph>These rules give each product type its chart. Untick any you do not want.</s-paragraph>
            {data.suggestions.map((s) => (
              <s-checkbox
                key={id(s)}
                label={`Product type "${s.value}" gets ${s.chartName}`}
                checked={!off.includes(id(s))}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setOff((o) => (on ? o.filter((x) => x !== id(s)) : [...o, id(s)]));
                }}
              ></s-checkbox>
            ))}
          </>
        )}
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={() =>
              post({
                intent: "rules",
                rules: JSON.stringify(chosen.map((s) => ({ chartId: s.chartId, value: s.value }))),
              })
            }
          >
            Continue
          </s-button>
          <s-button variant="tertiary" href={onboardingUrl(4, data.handles)}>
            Skip
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

const badge = (state: "active" | "available" | "unknown", checked: boolean) =>
  state === "active" ? (
    <s-badge tone="success">On</s-badge>
  ) : state === "available" ? (
    <s-badge tone="caution">Not on yet</s-badge>
  ) : (
    <s-badge>{checked ? "Unknown" : "Checking"}</s-badge>
  );

function StepTurnOn({ data, busy, post }: StepProps) {
  const { status, checked } = useExtensionStatus();
  const links = themeEditorLinks(data.shop, data.apiKey);

  return (
    <s-section heading="Turn it on">
      <s-stack gap="base">
        <s-paragraph>
          Two switches in your theme editor put the size finder on your store. Come back here afterwards and this page
          updates.
        </s-paragraph>
        <s-stack direction="inline" gap="base" alignItems="center">
          {badge(status.embed, checked)}
          <s-text>App embed</s-text>
          <s-link href={links.embed} target="_top">
            Turn on the app embed
          </s-link>
        </s-stack>
        <s-stack direction="inline" gap="base" alignItems="center">
          {badge(status.block, checked)}
          <s-text>Size finder button</s-text>
          <s-link href={links.block} target="_top">
            Add the button to your product page
          </s-link>
        </s-stack>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" loading={busy} disabled={busy} onClick={() => post({ intent: "finish" })}>
            Finish
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
