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
import { proxyStatus } from "../lib/proxy-check.server";
import { loadTotals } from "../lib/analytics.server";

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
import { ProxyBanner } from "../components/ProxyBanner";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const state = await db.shopState.findUnique({ where: { shop: session.shop } });
  if (!state?.onboardedAt) throw await redirect("/app/onboarding");

  const recheck = new URL(request.url).searchParams.get("proxy") === "recheck";
  const [charts, ruleCount, proxy, activity] = await Promise.all([
    listCharts(admin),
    db.assignmentRule.count({ where: { shop: session.shop } }),
    proxyStatus(session.shop, { recheck }),
    loadTotals(session.shop, 7),
  ]);
  const now = new Date();
  const status = syncStatus(state, now);
  return {
    plan: planSummary(state, now),
    planUrl: planPageUrl(session.shop, appHandle()),
    proxy,
    activity,
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
      <ProxyBanner status={data.proxy} />
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
          <s-text color="subdued">
            Checks your published theme. Changes in a theme you haven&apos;t published show here after you publish it.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Finder activity, last 7 days">
        <s-stack gap="base">
          {data.activity.opens === 0 ? (
            <s-paragraph>No finder activity yet. Counts appear after shoppers open the finder.</s-paragraph>
          ) : (
            <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
              <s-stack gap="small-200">
                <s-text color="subdued">Finder opens</s-text>
                <s-heading>{data.activity.opens.toLocaleString()}</s-heading>
              </s-stack>
              <s-stack gap="small-200">
                <s-text color="subdued">Completed</s-text>
                <s-heading>{data.activity.completions.toLocaleString()}</s-heading>
                <s-text color="subdued">{pct(data.activity.completionRate)} of opens</s-text>
              </s-stack>
              <s-stack gap="small-200">
                <s-text color="subdued">Added to bag from the finder</s-text>
                <s-heading>{data.activity.addToCarts.toLocaleString()}</s-heading>
                <s-text color="subdued">{pct(data.activity.cartRate)} of completed</s-text>
              </s-stack>
            </s-grid>
          )}
          <s-link href="/app/analytics">View analytics</s-link>
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
