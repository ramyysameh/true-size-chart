import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getChart, saveChart } from "../lib/charts.server";
import { loadMappingIssues, saveSizeOptionNames } from "../lib/mapping.server";
import { groupIssuesByChart, mergeAliases, parseSizeOptionNames } from "../lib/size-mapping";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const { issues, charts, sizeOptionNames } = await loadMappingIssues(admin, session.shop);
  const byId = new Map(charts.map((c) => [c.id, c]));
  const groups = groupIssuesByChart(issues).flatMap((g) => {
    const chart = byId.get(g.chartId);
    return chart
      ? [{ ...g, handle: chart.handle ?? "", name: chart.name, sizes: chart.table.sizes }]
      : [];
  });
  return { groups, sizeOptionNames, names: parseSizeOptionNames(sizeOptionNames) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "names") {
    await saveSizeOptionNames(session.shop, String(form.get("names") ?? ""));
    return { error: null };
  }

  if (intent === "map") {
    const handle = String(form.get("handle") ?? "");
    let additions: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(String(form.get("aliases") ?? "{}"));
      if (parsed && typeof parsed === "object") {
        additions = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][],
        );
      }
    } catch {
      additions = {};
    }
    if (Object.keys(additions).length === 0) return { error: "Choose a size for at least one value." };
    const chart = await getChart(admin, handle);
    if (!chart) return { error: "That chart no longer exists." };
    const aliases = mergeAliases(chart.table.sizes, chart.table.aliases, additions);
    const result = await saveChart(admin, { ...chart, table: { ...chart.table, aliases } });
    if (!result.ok) return { error: result.errors.join(" ") };
    return { error: null };
  }

  return { error: "Unknown action." };
};

export default function Mapping() {
  const { groups, sizeOptionNames, names } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.error ?? null;

  const [namesText, setNamesText] = useState(sizeOptionNames);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const key = (chartId: string, value: string) => `${chartId}\u0000${value}`;

  const submit = (data: Record<string, string>) => fetcher.submit(data, { method: "post" });

  function saveMapping(g: (typeof groups)[number]) {
    const aliases: Record<string, string> = {};
    for (const v of g.values) {
      const pick = picks[key(g.chartId, v.value)];
      if (pick) aliases[v.value] = pick;
    }
    submit({ intent: "map", handle: g.handle, aliases: JSON.stringify(aliases) });
  }

  return (
    <s-page heading="Size mapping">
      <s-paragraph>
        The size finder recommends a size from your chart, then selects the matching variant. When a variant is
        labelled differently from the chart (for example &quot;Small&quot; instead of &quot;S&quot;), map it here.
      </s-paragraph>

      {error ? (
        <s-banner tone="critical" heading="Something went wrong">
          {error}
        </s-banner>
      ) : null}

      <s-section heading="Size option names">
        <s-stack gap="base">
          <s-text-field
            label="Size option names"
            value={namesText}
            details="Use the same names as the app embed's Size option names setting."
            onInput={(e) => setNamesText(e.currentTarget.value)}
          ></s-text-field>
          <s-stack direction="inline">
            <s-button
              loading={busy}
              disabled={busy || namesText === sizeOptionNames}
              onClick={() => submit({ intent: "names", names: namesText })}
            >
              Save names
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {groups.length === 0 ? (
        <s-section heading="Everything matches">
          <s-paragraph>Every product&apos;s size labels match its chart.</s-paragraph>
        </s-section>
      ) : (
        groups.map((g) => (
          <s-section key={g.chartId} heading={g.name}>
            <s-stack gap="base">
              <s-text color="subdued">Chart sizes: {g.sizes.join(", ")}</s-text>

              {g.values.map((v) => (
                <s-stack key={v.value} gap="small-200">
                  <s-select
                    label={`"${v.value}" is the same as`}
                    placeholder="Choose a chart size"
                    value={picks[key(g.chartId, v.value)] ?? ""}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setPicks((p) => ({ ...p, [key(g.chartId, v.value)]: value }));
                    }}
                  >
                    {g.sizes.map((s) => (
                      <s-option key={s} value={s}>
                        {s}
                      </s-option>
                    ))}
                  </s-select>
                  <s-text color="subdued">Used by {v.products.join(", ")}</s-text>
                </s-stack>
              ))}

              {g.noSizeOption.map((p) => (
                <s-text key={p.productId} tone="caution">
                  {p.productTitle}: No option named {names.join(", ")}
                </s-text>
              ))}

              {g.values.length > 0 ? (
                <s-stack direction="inline">
                  <s-button
                    variant="primary"
                    loading={busy}
                    disabled={busy || !g.values.some((v) => picks[key(g.chartId, v.value)])}
                    onClick={() => saveMapping(g)}
                  >
                    Save mapping
                  </s-button>
                </s-stack>
              ) : null}
            </s-stack>
          </s-section>
        ))
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
