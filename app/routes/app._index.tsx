import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { listCharts } from "../lib/charts.server";
import { setupChecklist } from "../lib/onboarding";
import { appHandle, planPageUrl, planSummary } from "../lib/entitlement";
import { relativeTime, syncStatus } from "../lib/sync-status";
import { useExtensionStatus } from "../components/useExtensionStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const state = await db.shopState.findUnique({ where: { shop: session.shop } });
  if (!state?.onboardedAt) throw await redirect("/app/onboarding");

  const [charts, ruleCount] = await Promise.all([
    listCharts(admin),
    db.assignmentRule.count({ where: { shop: session.shop } }),
  ]);
  const now = new Date();
  const status = syncStatus(state, now);
  return {
    plan: planSummary(state, now),
    planUrl: planPageUrl(session.shop, appHandle()),
    charts: charts.length,
    rules: ruleCount,
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
  });
  const remaining = items.filter((i) => !i.done && i.key !== "mapping").length;
  const countable = items.length - 1;

  return (
    <s-page heading="True: Size Chart">
      <s-section heading="Setup checklist">
        <s-stack gap="base">
          <s-text color="subdued">
            {remaining === 0 ? "Everything is set up." : `${remaining} of ${countable} steps left.`}
          </s-text>
          {items.map((i) => (
            <s-stack key={i.key} direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                {i.done ? <s-badge tone="success">Done</s-badge> : i.key === "mapping" ? <s-badge>Check</s-badge> : <s-badge tone="caution">To do</s-badge>}
                <s-text>{i.label}</s-text>
              </s-stack>
              {i.done ? null : <s-link href={i.href}>{i.key === "mapping" ? "Open" : "Fix"}</s-link>}
            </s-stack>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Plan">
        <s-stack gap="small-200">
          <s-text>{data.plan}</s-text>
          <s-link href={data.planUrl} target="_top">Change plan</s-link>
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
