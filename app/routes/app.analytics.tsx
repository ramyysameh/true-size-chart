import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import type { RangeDays } from "../lib/analytics";
import { loadSummary } from "../lib/analytics.server";
import { proxyStatus } from "../lib/proxy-check.server";
import { ProxyBanner } from "../components/ProxyBanner";

const RANGES: RangeDays[] = [7, 30, 90];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get("days"));
  const days: RangeDays = RANGES.find((r) => r === raw) ?? 30;
  const [summary, proxy] = await Promise.all([
    loadSummary(session.shop, admin, days),
    proxyStatus(session.shop, { recheck: url.searchParams.get("proxy") === "recheck" }),
  ]);
  return { days, summary, proxy };
};

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

export default function Analytics() {
  const { days, summary, proxy } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { totals, charts } = summary;
  const empty = totals.opens === 0 && totals.completions === 0 && totals.addToCarts === 0;

  return (
    <s-page heading="Analytics">
      <ProxyBanner status={proxy} />
      <s-section>
        <s-select
          label="Period"
          name="days"
          value={String(days)}
          onChange={(e) => navigate(`?days=${e.currentTarget.value}`)}
        >
          {RANGES.map((r) => (
            <s-option key={r} value={String(r)}>
              {`Last ${r} days`}
            </s-option>
          ))}
        </s-select>
      </s-section>

      {empty ? (
        <s-section>
          <s-paragraph>No finder activity in this period yet. Counts appear here after shoppers open the finder.</s-paragraph>
        </s-section>
      ) : (
        <>
          <s-section>
            <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
              <s-stack gap="small-200">
                <s-text color="subdued">Finder opens</s-text>
                <s-heading>{totals.opens.toLocaleString()}</s-heading>
              </s-stack>
              <s-stack gap="small-200">
                <s-text color="subdued">Completed</s-text>
                <s-heading>{totals.completions.toLocaleString()}</s-heading>
                <s-text color="subdued">{pct(totals.completionRate)} of opens</s-text>
              </s-stack>
              <s-stack gap="small-200">
                <s-text color="subdued">Added to bag from the finder</s-text>
                <s-heading>{totals.addToCarts.toLocaleString()}</s-heading>
                <s-text color="subdued">{pct(totals.cartRate)} of completed</s-text>
              </s-stack>
            </s-grid>
          </s-section>

          <s-section heading="By chart">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Chart</s-table-header>
                <s-table-header format="numeric">Opens</s-table-header>
                <s-table-header format="numeric">Completed</s-table-header>
                <s-table-header format="numeric">Added to bag</s-table-header>
                <s-table-header format="numeric">Completion %</s-table-header>
                <s-table-header format="numeric">Add-to-bag %</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {charts.map((c) => (
                  <s-table-row key={c.chartKey}>
                    <s-table-cell>{c.name}</s-table-cell>
                    <s-table-cell>{c.opens.toLocaleString()}</s-table-cell>
                    <s-table-cell>{c.completions.toLocaleString()}</s-table-cell>
                    <s-table-cell>{c.addToCarts.toLocaleString()}</s-table-cell>
                    <s-table-cell>{pct(c.completionRate)}</s-table-cell>
                    <s-table-cell>{pct(c.cartRate)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>

          {charts
            .filter((c) => c.sizes.length > 0)
            .map((c) => (
              <s-section key={c.chartKey} heading={`Recommended sizes: ${c.name}`}>
                <s-stack gap="small-200">
                  {c.sizes.map((s) => (
                    <s-grid key={s.size} gridTemplateColumns="4rem 1fr 6rem" gap="base" alignItems="center">
                      <s-text>{s.size}</s-text>
                      <s-box background="subdued" borderRadius="base">
                        <div
                          role="img"
                          aria-label={`${s.size}: ${pct(s.share)}`}
                          style={{
                            width: `${s.share * 100}%`,
                            minWidth: "2px",
                            height: "12px",
                            borderRadius: "6px",
                            background: "var(--s-color-bg-fill-brand, #303030)",
                          }}
                        />
                      </s-box>
                      <s-text color="subdued">{`${s.count.toLocaleString()} (${pct(s.share)})`}</s-text>
                    </s-grid>
                  ))}
                </s-stack>
              </s-section>
            ))}
        </>
      )}

      <s-section>
        <s-text color="subdued">{"Anonymous counts only. Shoppers' measurements never leave their device."}</s-text>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
