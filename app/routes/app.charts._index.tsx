import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { TEMPLATES } from "@true-size-chart/engine";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteChart, listChartItems, saveChart } from "../lib/charts.server";
import { draftFromTemplate } from "../lib/chart-model";
import { requestSync } from "../lib/assign.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const items = await listChartItems(admin);
  const ruleCounts = await db.assignmentRule.groupBy({
    by: ["chartId"],
    where: { shop: session.shop },
    _count: { _all: true },
  });
  const rules = new Map(ruleCounts.map((r) => [r.chartId, r._count._all]));
  return {
    charts: items.map(({ draft, inUse }) => ({
      id: draft.id ?? "",
      handle: draft.handle ?? "",
      name: draft.name,
      category: draft.category,
      audience: draft.audience,
      sizes: draft.table.sizes.join(", "),
      inUse,
      ruleCount: rules.get(draft.id ?? "") ?? 0,
    })),
    templates: TEMPLATES.map((t) => ({ key: t.key, name: t.name, category: t.category, audience: t.audience })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create-template") {
    const template = TEMPLATES.find((t) => t.key === form.get("templateKey"));
    if (!template) return { error: "That template does not exist." };
    const result = await saveChart(admin, draftFromTemplate(template));
    if (!result.ok) return { error: result.errors.join(" ") };
    return redirect(`/app/charts/${result.draft.handle}`);
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    if (!id) return { error: "Missing chart." };
    try {
      await deleteChart(admin, id);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The chart could not be deleted." };
    }
    await db.assignmentRule.deleteMany({ where: { shop: session.shop, chartId: id } });
    await requestSync(session.shop);
    return { error: null };
  }

  return { error: "Unknown action." };
};

export default function Charts() {
  const { charts, templates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const submit = (data: Record<string, string>) => fetcher.submit(data, { method: "post" });

  return (
    <s-page heading="Size charts">
      <s-button slot="primary-action" variant="primary" href="/app/charts/new">
        New chart
      </s-button>
      <s-button slot="secondary-actions" commandFor="template-modal" command="--show">
        Add from template
      </s-button>

      {error ? (
        <s-banner tone="critical" heading="Something went wrong">
          {error}
        </s-banner>
      ) : null}

      <s-section padding="none">
        {charts.length === 0 ? (
          <s-box padding="large">
            <s-stack gap="base" alignItems="center">
              <s-heading>No size charts yet</s-heading>
              <s-paragraph>Start from a template or create a blank chart.</s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header>Category</s-table-header>
              <s-table-header>Audience</s-table-header>
              <s-table-header>Sizes</s-table-header>
              <s-table-header>Products</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {charts.map((c) => (
                <s-table-row key={c.id}>
                  <s-table-cell>
                    <s-link href={`/app/charts/${c.handle}`}>{c.name}</s-link>
                  </s-table-cell>
                  <s-table-cell>{c.category}</s-table-cell>
                  <s-table-cell>{c.audience}</s-table-cell>
                  <s-table-cell>{c.sizes}</s-table-cell>
                  <s-table-cell>
                    {c.inUse ? <s-badge tone="success">In use</s-badge> : <s-badge>Not assigned</s-badge>}
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      tone="critical"
                      variant="tertiary"
                      commandFor={`delete-${c.handle}`}
                      command="--show"
                      accessibilityLabel={`Delete ${c.name}`}
                    >
                      Delete
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {charts.map((c) => (
        <s-modal key={c.id} id={`delete-${c.handle}`} heading={`Delete ${c.name}?`}>
          <s-paragraph>
            {c.ruleCount === 0
              ? "No assignment rules use this chart."
              : `${c.ruleCount} assignment ${c.ruleCount === 1 ? "rule" : "rules"} will be deleted with it.`}{" "}
            Products that use this chart will lose it after the next sync. This cannot be undone.
          </s-paragraph>
          <s-button slot="secondary-actions" commandFor={`delete-${c.handle}`} command="--hide">
            Cancel
          </s-button>
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            commandFor={`delete-${c.handle}`}
            command="--hide"
            loading={busy}
            onClick={() => submit({ intent: "delete", id: c.id })}
          >
            Delete chart
          </s-button>
        </s-modal>
      ))}

      <s-modal id="template-modal" heading="Add from template">
        <s-stack gap="small-200">
          {templates.map((t) => (
            <s-stack key={t.key} direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-text>
                {t.name} ({t.category}, {t.audience})
              </s-text>
              <s-button
                commandFor="template-modal"
                command="--hide"
                disabled={busy}
                onClick={() => submit({ intent: "create-template", templateKey: t.key })}
              >
                Use
              </s-button>
            </s-stack>
          ))}
        </s-stack>
        <s-button slot="secondary-actions" commandFor="template-modal" command="--hide">
          Close
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
