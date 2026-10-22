import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { listCharts } from "../lib/charts.server";
import { loadMappingIssues } from "../lib/mapping.server";
import { setupChecklist } from "../lib/onboarding";
import { relativeTime, syncStatus } from "../lib/sync-status";
import { useExtensionStatus } from "../components/useExtensionStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const state = await db.shopState.findUnique({ where: { shop: session.shop } });
  if (!state?.onboardedAt) throw redirect("/app/onboarding");

  const charts = await listCharts(admin);
  const [ruleCount, mapping] = await Promise.all([
    db.assignmentRule.count({ where: { shop: session.shop } }),
    loadMappingIssues(admin, session.shop, charts),
  ]);
  const now = new Date();
  const status = syncStatus(state, now);
  return {
    charts: charts.length,
    rules: ruleCount,
    issues: mapping.issues.length,
    sync:
      status.kind === "done"
        ? `Last synced ${relativeTime(status.finishedAt, now)}: ${status.set} assigned, ${status.unset} cleared`
        : status.kind === "syncing"
          ? "Syncing…"
          : status.kind === "stalled"
            ? "Sync stalled. Start it again from the Assignments page."
            : status.kind === "error"
              ? `The last sync failed: ${status.message}`
              : "Not synced yet.",
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const { status } = useExtensionStatus();
  const items = setupChecklist({
    embed: status.embed,
    block: status.block,
    charts: data.charts,
    rules: data.rules,
    issues: data.issues,
  });
  const remaining = items.filter((i) => !i.done).length;

  return (
    <s-page heading="True: Size Chart">
      <s-section heading="Setup checklist">
        <s-stack gap="base">
          <s-text color="subdued">
            {remaining === 0 ? "Everything is set up." : `${remaining} of ${items.length} steps left.`}
          </s-text>
          {items.map((i) => (
            <s-stack key={i.key} direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                {i.done ? <s-badge tone="success">Done</s-badge> : <s-badge tone="caution">To do</s-badge>}
                <s-text>{i.label}</s-text>
              </s-stack>
              {i.done ? null : <s-link href={i.href}>Fix</s-link>}
            </s-stack>
          ))}
          {data.issues > 0 ? (
            <s-text color="subdued">
              {data.issues} {data.issues === 1 ? "product has" : "products have"} sizes that do not match their chart.
            </s-text>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Sync">
        <s-text>{data.sync}</s-text>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
