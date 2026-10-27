# App Store AI self-review: True: Size Chart

Run 2026-10-25 on branch `claude/plan-5-launch-readiness-99b0b8` at the end of Plan 5. The requirements came from `shopify doc fetch --url https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements` the same day. Each requirement was checked against the codebase, following the Shopify AI Toolkit's `app-store-review` instructions.

## Summary

✅ **Likely passing:** 30
❌ **Likely failing:** 0
⚠️ **Needs review:** 5 _(one of them, 5.1.2, is from the full App Store requirements, not the self-review list)_
⏭️ **Groups skipped:** 9 _(see below)_

**Note:** Shopify selected these requirements because they can be checked against a local codebase without a browser. Shopify reviews these and more requirements when the app is submitted to the Shopify App Store.

Each of these would have been ❌ before Plan 5; all are fixed now:
- **2.3.1 Initiate installation from a Shopify-owned surface.** The template's landing page asked for a shop domain. It is now a static page (`app/routes/_index/route.tsx`), and `app/lib/public-pages.test.ts` guards it.
- **3.1.1 Use a valid TLS/SSL certificate.** `application_url` was `https://example.com`. It is now `https://true-size-chart.vercel.app`, which serves Vercel's managed TLS.
- **1.2.2 Implement Shopify App Pricing correctly.** Resubscribing after a reinstall wrote `tsc.active` to the old installation. `afterAuth` now refreshes the installation id (Task 3).
- **Mandatory compliance webhooks.** These are not in the self-review list but are required at submission. They are now handled at `/webhooks/compliance` and configured in `shopify.app.toml` (Task 6).

### ⚠️ Requirements that need review

⚠️ **1.2.2 Implement Shopify App Pricing correctly (accept, decline, resubscribe)**

**Why this needs attention:** Declining or resubscribing happens on Shopify's hosted plan page. The code can only show that the app sends a shop without a subscription there and re-checks when the merchant comes back.

**What was detected:** `authenticatePro` (`app/lib/gate.server.ts`) redirects to `/charges/true-size-chart/pricing_plans` with `target: _top`. The welcome link's `plan_handle` forces a fresh Partner check. `refreshShopContext` covers a reinstall. Verify live: decline on the plan page, then come back (you should see the plan page again); uninstall, reinstall and choose Pro (you should see Home, and the storefront button returns).

⚠️ **3.1.1 Use a valid TLS/SSL certificate**

**Why this needs attention:** TLS terminates at Vercel, so the certificate exists only once the project is deployed.

**What was detected:** Vercel serves `https://true-size-chart.vercel.app` over HTTPS only, and there is no HTTP-only path in the app. Verify after the deploy that `https://true-size-chart.vercel.app/healthz` loads with a valid certificate.

⚠️ **5.1.2 Properly show theme app extension in the storefront**

**Why this needs attention:** This needs the theme editor and a live storefront.

**What was detected:** The block and embed use `available_if: {{ app.metafields.tsc.active }}`. Theme check is clean (Plan 4). Verify in the theme editor of the published theme that both render without errors.

⚠️ **5.1.3 Include detailed onboarding instructions for theme app extensions**

**Why this needs attention:** Deep links and step-by-step copy exist, but how clear they are is a human judgment.

**What was detected:** `app/lib/theme-links.ts` builds `/admin/themes/current/editor?context=apps&activateAppId=…/tsc-embed` and `…addAppBlockId=…/tsc-button&target=mainSection`. Onboarding step 4 and the Home checklist link to them. Home shows the published-theme status from `app.extensions()`.

⚠️ **5.1.5 Send collected data back to the merchant**

**Why this needs attention:** The app collects no customer data, so the requirement is satisfied by absence. A reviewer may still ask.

**What was detected:** There are no customer scopes. Storefront beacons carry only `{e, c, s}`. Anonymous counts appear on Home ("Finder activity, last 7 days") and on Analytics. Shopper measurements stay in the shopper's `localStorage`.

### ❌ Requirements that are likely failing

None.

### Skipped groups

These groups weren't evaluated because they don't appear to apply to this codebase, or they are opt-in. If you'd like me to check any of them anyway, just ask.

- **5.2 Payment** — no `type = "payment"` extension and no `write_payment_gateway` scope
- **5.3 Payment facilitator** — opt-in only
- **5.4 Purchase option** — no subscription or payment-mandate scopes
- **5.5 Product sourcing** — opt-in only
- **5.6 Checkout customization** — no checkout UI extension
- **5.7 Sales channel** — no `channel_config` extension
- **5.8 Post purchase** — no `checkout_post_purchase` extension
- **5.9 Mobile app builders** — opt-in only
- **5.10 Donation** — opt-in only

### Passing (counted, not listed in detail)

- 1.1.1 to 1.1.16
- 1.2.1 and 1.2.3, with one plan and App Pricing only
- 2.2.1 GraphQL Admin API only, with no REST calls
- 2.2.3 `@shopify/app-bridge-react` 4
- 2.2.4
- 2.2.6 no admin UI extensions
- 2.2.7 no Max modal
- 2.3.1 to 2.3.4, with React Router template token exchange and an `afterAuth` hook that never blocks auth
- 3.2.1 to 3.2.5: none of those scopes; the app requests four write scopes, all used
- 5.1.1 theme app extension only, with no Asset API or ScriptTag

## Built for Shopify: the cheap checks (Plan 5 Task 13 Step 2)

| Criterion | Status | Notes |
|---|---|---|
| 4.1.2 Mobile-friendly admin | Live check pending | Check Home, Charts, the editor, Assignments, Mapping and Analytics at 375 px with no horizontal page scroll |
| 4.1.3 Concise app name | ✅ | "True: Size Chart" (16 characters) |
| 4.1.4 Nav menu | ✅ | `s-app-nav` in `app/routes/app.tsx`, no emoji |
| 4.1.5 Contextual save bar | ✅ editor / ⚠️ others | The chart editor uses `ui-save-bar`. Mapping and Assignments save per row through explicit buttons; no free form stays dirty |
| 4.2.3 Helpful homepage | ✅ | Extension status from `app.extensions()`, 7-day finder metrics, plan and sync status |
| 4.2.4 Helpful error messages | ✅ / ⚠️ | Errors are red `s-banner tone="critical"` and never toasts. Some page-level banners describe a row action rather than sitting beside a field |
| 4.3.7 Label premium features | ✅ | A single plan, so there are no gated tiers |
| 2.1 Admin Web Vitals | Later | Measured by Shopify after 100 loads in 28 days |

## Storefront performance and accessibility on production (Task 13 Step 3)

Run 2026-10-28 on `ui-testing-em0ppgsc.myshopify.com/products/tsc-test-tee` (theme "test-data", published) with the app served from `https://true-size-chart.vercel.app`, extension version `true-size-chart-4`.

**Lighthouse delta: ✅ 2 points (budget 3).** `scripts/perf/lighthouse.mjs`, Lighthouse 12.8.2, mobile, performance only, 5 runs each. It ran with `--port` against a separate Chrome where the store was unlocked.

| State | Runs | Median |
|---|---|---|
| Off (app embed off, "Find my size" block hidden) | 74, 70, 73, 65, 76 | 73 |
| On (both enabled) | 73, 70, 79, 69, 71 | 71 |

`--compare off on` exited 0. A check audit confirmed the final URL was the product page, not `/password`. Before the "off" runs, the page had no trace of the app (`true-size-chart` appeared 0 times in the HTML); before the "on" runs and after the restore, the button was present. No finder assets download on page load: the bundle loads only when a shopper opens the finder. Run-to-run spread is about ±5 points on this dev store, larger than the delta itself.

**axe-core 4.10.2: ✅ no violations.** axe ran on the whole document with the finder open and visible, and only the nodes inside the `true-size-finder` shadow root were kept:

| Finder state | Rules that checked finder nodes | Finder nodes checked | Violations | Incomplete |
|---|---|---|---|---|
| Result (remembered from an earlier visit) | 22 | 197 | 0 | 0 |
| Step 1, height and weight | 22 | 239 | 0 | 0 |
| Step 2, shape | 22 | 282 | 0 | 0 |
| Step 3, fit | 21 | 172 | 0 | 0 |
| Result (fresh) | 23 | 203 | 0 | 0 |
| Size chart tab, cm | 27 | 158 | 0 | 0 |
| Size chart tab, in | 27 | 158 | 0 | 0 |

There were two page-level findings outside the app: `frame-title` (serious) on an untitled iframe and `region` (moderate). Neither was inside the finder, so the theme or the store's other scripts own them.

**Keyboard pass:** not run yet. It should cover Tab order, the sliders with the arrow keys and PageUp/PageDown, ESC to close, focus returning to the button, and reduced motion.

## Resources

- [App Store requirements documentation](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Best practices for apps](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- [About billing for your app](https://shopify.dev/docs/apps/launch/billing)
- [Submitting your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
