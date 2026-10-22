import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { gql } from "../lib/admin.server";
import { listCharts } from "../lib/charts.server";
import { requestSync } from "../lib/assign.server";
import type { RuleType } from "../lib/rules";
import { relativeTime, syncStatus } from "../lib/sync-status";

const TYPE_LABELS: Record<RuleType, string> = {
  product: "Specific products",
  collection: "Collection",
  product_type: "Product type",
  vendor: "Vendor",
  tag: "Tag",
};
const TYPES = Object.keys(TYPE_LABELS) as RuleType[];
const isRuleType = (v: unknown): v is RuleType => TYPES.includes(v as RuleType);

const PRODUCT_TYPES = `#graphql
  query ProductTypes { productTypes(first: 250) { nodes } }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [charts, rules, state, types] = await Promise.all([
    listCharts(admin),
    db.assignmentRule.findMany({ where: { shop: session.shop }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    db.shopState.findUnique({ where: { shop: session.shop } }),
    gql<{ productTypes: { nodes: string[] } }>(admin, PRODUCT_TYPES).catch(() => null),
  ]);
  const names = new Map(charts.map((c) => [c.id, c.name]));
  const now = new Date();
  const status = syncStatus(state, now);
  return {
    charts: charts.map((c) => ({ id: c.id ?? "", name: c.name })),
    rules: rules.map((r) => ({
      id: r.id,
      chart: names.get(r.chartId) ?? "Deleted chart",
      type: r.type,
      label: r.label,
    })),
    productTypes: (types?.productTypes.nodes ?? []).filter((t) => t.trim() !== ""),
    syncing: status.kind === "syncing",
    stalled: status.kind === "stalled",
    error: status.kind === "error" ? status.message : null,
    lastSynced:
      status.kind === "done"
        ? { ago: relativeTime(status.finishedAt, now), set: status.set, unset: status.unset }
        : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "add") {
    const type = form.get("type");
    const chartId = String(form.get("chartId") ?? "");
    if (!isRuleType(type)) return { error: "Choose a rule type." };
    let values: { value: string; label: string }[] = [];
    try {
      const parsed: unknown = JSON.parse(String(form.get("values") ?? "[]"));
      if (Array.isArray(parsed)) {
        values = parsed
          .map((v) => ({ value: String(v?.value ?? "").trim(), label: String(v?.label ?? v?.value ?? "").trim() }))
          .filter((v) => v.value);
      }
    } catch {
      values = [];
    }
    if (values.length === 0) return { error: "Choose or enter a value for the rule." };
    if (!(await listCharts(admin)).some((c) => c.id === chartId)) return { error: "That chart no longer exists." };

    const last = await db.assignmentRule.aggregate({ where: { shop }, _max: { priority: true } });
    const start = (last._max.priority ?? 0) + 1;
    await db.assignmentRule.createMany({
      data: values.map((v, i) => ({ shop, chartId, type, value: v.value, label: v.label || v.value, priority: start + i })),
    });
  } else if (intent === "delete") {
    await db.assignmentRule.deleteMany({ where: { id: String(form.get("id") ?? ""), shop } });
  } else if (intent === "move") {
    const id = String(form.get("id") ?? "");
    const delta = form.get("direction") === "up" ? -1 : 1;
    const rules = await db.assignmentRule.findMany({ where: { shop }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    const i = rules.findIndex((r) => r.id === id);
    const other = rules[i + delta];
    if (i >= 0 && other) {
      const a = rules[i];
      await db.$transaction([
        db.assignmentRule.update({ where: { id: a.id }, data: { priority: other.priority } }),
        db.assignmentRule.update({ where: { id: other.id }, data: { priority: a.priority } }),
      ]);
    }
  } else if (intent !== "sync") {
    return { error: "Unknown action." };
  }

  await requestSync(shop);
  return { error: null };
};

export default function Rules() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  const [chartId, setChartId] = useState("");
  const [type, setType] = useState<RuleType>("product_type");
  const [text, setText] = useState("");
  const [productType, setProductType] = useState("");

  useEffect(() => {
    if (!data.syncing) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") void revalidator.revalidate();
    }, 3000);
    return () => clearInterval(timer);
  }, [data.syncing, revalidator]);

  const selectedChart = chartId || data.charts[0]?.id || "";
  const submit = (payload: Record<string, string>) => fetcher.submit(payload, { method: "post" });
  const addRule = (values: { value: string; label: string }[]) =>
    submit({ intent: "add", chartId: selectedChart, type, values: JSON.stringify(values) });

  async function pick() {
    const selection = await shopify.resourcePicker({ type: type === "product" ? "product" : "collection", multiple: true });
    if (!selection || selection.length === 0) return;
    addRule(selection.map((s) => ({ value: s.id, label: s.title })));
  }

  const error = fetcher.data?.error ?? null;

  return (
    <s-page heading="Assignments">
      <s-paragraph>
        Rules decide which size chart each product gets. The first matching rule from the top wins.
      </s-paragraph>

      {error ? <s-banner tone="critical">{error}</s-banner> : null}
      {data.error ? (
        <s-banner tone="critical" heading="The last sync failed">
          <s-paragraph>{data.error}</s-paragraph>
          <s-button slot="secondary-actions" onClick={() => submit({ intent: "sync" })} loading={busy}>
            Sync now
          </s-button>
        </s-banner>
      ) : null}

      <s-section heading="Sync status">
        {data.syncing ? (
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-spinner accessibilityLabel="Syncing" size="base"></s-spinner>
            <s-text>Syncing…</s-text>
          </s-stack>
        ) : data.stalled ? (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-text>Sync stalled — start it again</s-text>
            <s-button onClick={() => submit({ intent: "sync" })} loading={busy}>
              Sync now
            </s-button>
          </s-stack>
        ) : data.lastSynced ? (
          <s-text>
            Last synced {data.lastSynced.ago}: {data.lastSynced.set} assigned, {data.lastSynced.unset} cleared
          </s-text>
        ) : (
          <s-text>Not synced yet. Add a rule to start.</s-text>
        )}
      </s-section>

      <s-section heading="Rules" padding="none">
        {data.rules.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>No rules yet. Add one below.</s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Applies to</s-table-header>
              <s-table-header>Rule</s-table-header>
              <s-table-header>Chart</s-table-header>
              <s-table-header>Order</s-table-header>
              <s-table-header>Delete</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.rules.map((r, i) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.label}</s-table-cell>
                  <s-table-cell>{TYPE_LABELS[r.type as RuleType] ?? r.type}</s-table-cell>
                  <s-table-cell>{r.chart}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        icon="arrow-up"
                        variant="tertiary"
                        accessibilityLabel={`Move ${r.label} up`}
                        disabled={i === 0 || busy}
                        onClick={() => submit({ intent: "move", id: r.id, direction: "up" })}
                      ></s-button>
                      <s-button
                        icon="arrow-down"
                        variant="tertiary"
                        accessibilityLabel={`Move ${r.label} down`}
                        disabled={i === data.rules.length - 1 || busy}
                        onClick={() => submit({ intent: "move", id: r.id, direction: "down" })}
                      ></s-button>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      icon="delete"
                      tone="critical"
                      variant="tertiary"
                      accessibilityLabel={`Delete rule ${r.label}`}
                      disabled={busy}
                      onClick={() => submit({ intent: "delete", id: r.id })}
                    ></s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Add rule">
        {data.charts.length === 0 ? (
          <s-paragraph>Create a size chart first, then assign it to products here.</s-paragraph>
        ) : (
          <s-stack gap="base">
            <s-select
              label="Size chart"
              value={selectedChart}
              onChange={(e) => setChartId(e.currentTarget.value)}
            >
              {data.charts.map((c) => (
                <s-option key={c.id} value={c.id}>
                  {c.name}
                </s-option>
              ))}
            </s-select>
            <s-select
              label="Assign to"
              value={type}
              onChange={(e) => setType(e.currentTarget.value as RuleType)}
            >
              {TYPES.map((t) => (
                <s-option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </s-option>
              ))}
            </s-select>

            {type === "product" || type === "collection" ? (
              <s-button onClick={() => void pick()} disabled={busy}>
                {type === "product" ? "Choose products" : "Choose collections"}
              </s-button>
            ) : type === "product_type" ? (
              <s-stack gap="base">
                {data.productTypes.length > 0 ? (
                  <s-select
                    label="Product type"
                    value={productType}
                    placeholder="Select a product type"
                    onChange={(e) => setProductType(e.currentTarget.value)}
                  >
                    {data.productTypes.map((t) => (
                      <s-option key={t} value={t}>
                        {t}
                      </s-option>
                    ))}
                  </s-select>
                ) : (
                  <s-text-field
                    label="Product type"
                    value={productType}
                    onInput={(e) => setProductType(e.currentTarget.value)}
                  ></s-text-field>
                )}
                <s-button
                  variant="primary"
                  disabled={busy || !productType.trim()}
                  onClick={() => {
                    addRule([{ value: productType, label: productType }]);
                    setProductType("");
                  }}
                >
                  Add rule
                </s-button>
              </s-stack>
            ) : (
              <s-stack gap="base">
                <s-text-field
                  label={type === "vendor" ? "Vendor" : "Tag"}
                  value={text}
                  onInput={(e) => setText(e.currentTarget.value)}
                ></s-text-field>
                <s-button
                  variant="primary"
                  disabled={busy || !text.trim()}
                  onClick={() => {
                    addRule([{ value: text, label: text }]);
                    setText("");
                  }}
                >
                  Add rule
                </s-button>
              </s-stack>
            )}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
