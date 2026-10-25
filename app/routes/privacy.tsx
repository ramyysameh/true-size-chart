import type { MetaFunction } from "react-router";
import { APP_NAME, DEVELOPER, SUPPORT_EMAIL } from "../lib/brand";

export const meta: MetaFunction = () => [{ title: `Privacy policy · ${APP_NAME}` }];

const page = { maxWidth: "42rem", margin: "0 auto", padding: "2rem 1rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif" };

export default function PrivacyPolicy() {
  return (
    <main style={page}>
      <h1>Privacy policy</h1>
      <p>
        {APP_NAME} is a Shopify app by {DEVELOPER}. This policy explains what the app stores for the merchants who
        install it and what it never collects about their shoppers. Effective 2026-10-25.
      </p>

      <h2>What the app stores</h2>
      <ul>
        <li>The shop&apos;s myshopify domain and the access tokens Shopify issues to the app.</li>
        <li>The size charts and assignment rules the merchant creates, and the app&apos;s settings for the shop.</li>
        <li>The shop&apos;s plan status from Shopify App Pricing.</li>
        <li>
          Anonymous daily counts of size finder opens, completions, add-to-bags and recommended sizes, per chart.
          A count is a number per day; it is not tied to any shopper.
        </li>
      </ul>

      <h2>What the app never collects</h2>
      <p>
        The app never collects shopper names, email addresses, IP addresses or cookies, and it never receives a
        shopper&apos;s height, weight or body shape. Those measurements stay in the shopper&apos;s own browser
        (localStorage) so the finder can remember them, and the shopper can remove them at any time with
        &quot;Clear my data&quot; in the finder. The app requests no customer or order access from Shopify.
      </p>

      <h2>Where the data lives</h2>
      <p>The app and its database run on Render, in the United States.</p>

      <h2>Retention and deletion</h2>
      <p>
        Everything the app stores for a shop is deleted when the app is uninstalled, and again when Shopify sends its
        shop/redact request 48 hours later. Because the app holds no customer data, Shopify&apos;s customer data
        requests have nothing to return or delete.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </main>
  );
}
