# True: Size Chart — Design Spec

Date: 2026-10-18 · Status: draft for approval
Reference: [reference-video-analysis.md](../../reference-video-analysis.md)

Decisions are tagged **[user]** when the user made them and **[my call]** when I made them. The user skipped the discovery questions, so most product calls are mine and can be overridden.

---

## 1. Intent

A **public Shopify App Store app** **[user]** that merchants pick because it is **the best size chart app on the store** **[user]**.

"Best" is defined here as **[my call]**:
1. **The shopper experience.** The editorial 3-step size finder from the reference video: two drags, a live estimate, one confident answer with a fit match %, and fit per body area. It replaces a confusing table of numbers.
2. **Fast storefronts.** Zero measurable Lighthouse impact until a shopper opens the finder. This qualifies for Built for Shopify.
3. **Setup in under 5 minutes.** Pick a garment template, adjust numbers, auto-assign by collection/type/tag. No theme code edits.
4. **Privacy as a selling point.** Body data never leaves the shopper's device.

## 2. Goals (v1)

### Storefront (theme app extension)
- **App block "Find my size"**: a button or link placed near the variant picker. On return visits it shows the remembered size (e.g. "Your size: XL").
- **App embed "True: Size Chart drawer"**: loads the finder only on product pages, and only fetches JS on first click/intent.
- **Finder flow** (matches the video, see the analysis doc §2):
  1. *Let's find your fit*: Female/Male, height (cm ↔ ft/in), weight (kg ↔ lbs) sliders with −/+ steppers, a silhouette, and a **live estimate** that updates while dragging.
  2. *Your shape*: chest / stomach / hips, 3 options each, defaulting to Average.
  3. *How do you like it to fit?*: Slim / Regular / Relaxed, defaulting to Regular.
  4. *Result*: a ring with the best size, an animated **fit match %**, a confidence line, an S–XL switcher with a "YOU" marker, a **snug / ideal / roomy** row per area, a fit note, a disclaimer, and **"Add XL to bag"**.
- **Size chart tab**: a classic table (cm / in toggle) plus "how to measure" copy, for shoppers who want numbers. It is reachable from the drawer and from an optional "Size chart" link.
- **Profile saved in `localStorage`**. Every product prefills, and the user can edit or clear it ("Edit details" / "Clear my data").
- **Add to bag** through the theme's AJAX cart (`/cart/add.js`) using the variant that matches the recommended size plus the shopper's other selected options. If that size is sold out, it shows the next-best in-stock size with a note.
- **Desktop**: right-hand drawer. **Mobile**: full-height bottom sheet.
- **Accessibility**: keyboard-operable sliders (`role="slider"`, arrow/PageUp keys), focus trap, ESC to close, `prefers-reduced-motion` respected, WCAG AA contrast.
- **Theming** through block/embed settings: inherit the theme font or use the default, accent color, corner radius, button style, and button label text. The default look is the monochrome editorial style from the video.
- **Strings** are editable through block settings. English ships first. Locale files are structured so more languages can be added (v1.1).

### Merchant admin (embedded app)
- **Onboarding** (3 screens): choose garment categories → review the generated charts → assign them → done, with a "preview on storefront" deep link into the theme editor to enable the embed and add the block.
- **Chart editor**: sizes (rows) × measurements (columns), unit cm/in, measurement basis (**garment** measurements, flat or circumference, or **body** measurements), the designer's intended fit (slim / regular / oversized), and a how-to-measure note. Paste-from-spreadsheet supported.
- **Templates**: starter charts for T-shirt, shirt, hoodie/sweatshirt, jacket, dress, pants/jeans, shorts, skirt, in women's and men's/unisex versions. Brand-neutral averages.
- **Assignment rules**: by product, collection, product type, vendor or tag, with priority order. The app resolves the rules and writes a product metafield (see §5), and keeps it fresh through product webhooks.
- **Size mapping check**: shows products whose "Size" option values don't match chart labels and lets the merchant fix the mapping.
- **Live preview**: the real finder rendered inside the admin with the chart being edited.
- **Analytics**: finder opens, completions, add-to-carts from the finder, add-to-bag rate of finder users (a store-wide comparison was dropped: it needs protected customer data, 2026-10-25), and recommended-size distribution per chart. All events are anonymous.
- **Plans** through **Shopify App Pricing** (hosted plan page, Partner Dashboard), with feature gating by active subscription.

## 3. Non-goals (v1)
Photo/body scanning, AI import of charts from images or URLs (planned v2), footwear/kids/bras, cross-brand "fits like brand X", returns integrations, headless/Hydrogen, POS, a shopper account sync of profiles, and any server-side storage of body data.

## 4. Anti-goals (failure even if it "works")
- The storefront Lighthouse score drops by more than **3** points. Shopify's hard limit is 10; we aim much lower.
- Any network request or JS execution on page load beyond a tiny inline config and a `<button>`.
- Collecting or transmitting shopper height, weight or shape to our servers.
- Requiring merchants to edit theme code.
- Overconfident wrong answers. Low-confidence results must say so ("Between M and L — we'd pick L for Regular fit").
- Looking like a generic Polaris-table size chart app on the storefront.

## 5. Architecture **[my call]**

```
┌──────────── Shopify admin ────────────┐      ┌──────────── Storefront (PDP) ────────────┐
│ Embedded app (React Router template,  │      │ Theme app extension                       │
│ Polaris web components, App Bridge)   │      │  • app block: button (Liquid, no JS)      │
│  • chart editor / templates           │      │  • app embed: inline JSON config +        │
│  • assignment rules                   │      │    deferred loader (<1 KB)                │
│  • analytics, plan gating             │      │  • finder.js (vanilla, ≤15 KB gz) +       │
└──────┬───────────────────────┬────────┘      │    finder.css, CDN-hosted, lazy           │
       │ Admin GraphQL          │ Postgres      └──────┬──────────────────────────┬──────────┘
       ▼                        ▼ (Prisma)            │ Liquid reads metaobject   │ sendBeacon
 metaobjects $app:size_chart   sessions, rules,      │ via product metafield     ▼
 product metafield $app.size_chart  events, plan     │                     App proxy /apps/tsc/e
 app-installation metafield (settings)               ▼
                                             recommendation engine runs in browser
```

- **Scaffold**: `shopify app init` with the **React Router** template (TypeScript, `@shopify/shopify-app-react-router`), Prisma on **PostgreSQL**, admin UI in **Polaris web components** (`polaris-app-home`). Hosting: Render, decided 2026-10-25 [user]: one always-on Docker web service and Render Postgres in Ohio, declared in `render.yaml` (see Plan 5).
- **Monorepo package `packages/engine`**: a pure TypeScript recommendation engine with no DOM. It is used by both the storefront bundle and the admin preview, so there is one source of truth with unit and golden tests.
- **Storefront bundle**: vanilla TS custom element `<true-size-finder>` built with esbuild into the extension's `assets/`. No framework; this keeps it under 15 KB gzipped.

### Data model
Declared in `shopify.app.toml` (TOML definitions, not runtime GraphQL):

- **Metaobject `$app:size_chart`** (`access.storefront = "public_read"`, `access.admin = "merchant_read_write"`), fields:
  - `name`: single_line_text_field (required)
  - `category`: single_line_text_field (tshirt, shirt, hoodie, jacket, dress, pants, shorts, skirt)
  - `audience`: single_line_text_field (women, men, unisex)
  - `unit`: single_line_text_field (cm, in)
  - `basis`: single_line_text_field (garment_flat, garment_circ, body)
  - `intended_fit`: single_line_text_field (slim, regular, oversized)
  - `table`: json, `{ sizes: ["S","M","L","XL"], measurements: { chest: [..], waist: [..], hip: [..], length: [..] } }`
  - `how_to_measure`: multi_line_text_field
- **Product metafield `$app.size_chart`**: `metaobject_reference<$app:size_chart>`. It is written by the app from assignment rules, so the storefront needs only Liquid with no API call.
- **App-installation metafield `$app.settings`**: json (size option names, default audience, style, strings, plan flags), read in Liquid through the `app` object.
- **Postgres**: `Session` (template), `AssignmentRule {shop, chartHandle, type, value, priority}`, `EventDaily {shop, chartHandle, date, opens, completions, addToCarts, sizeCounts json}`, `ShopState {shop, planHandle, onboardedAt}`.

> **Verify first (M0 spike):** the exact Liquid access path for an app-owned product metafield and metaobject inside a theme app extension. If metaobject references don't resolve in the extension, the fallback is that the app writes the chart JSON directly into a product `json` metafield instead of a reference.

### Storefront runtime
1. The embed renders `<script type="application/json" id="tsc-config">` holding the chart table, settings, a variant map `{size → variantId, available}` and the selected-options context. Rendered only when `product.metafields` has a chart.
2. The block renders a `<button data-tsc-open>`. If the button is absent, the embed renders nothing visible.
3. On `pointerenter` / `focus` / `click` of the button, the loader injects `finder.js` + `finder.css` (module, CDN). Nothing loads before that.
4. Profile: `localStorage["tsc:profile:v1"]`, wrapped in try/catch so the finder still works in private mode.
5. Analytics: `navigator.sendBeacon` to the app proxy with `{event, chart, size?}` only. There is no cookie, no IP storage and no body data. Events are aggregated daily per shop.

## 6. Recommendation engine **[my call]**

Inputs: `sex, heightCm, weightKg, shape {chest, stomach, hips ∈ -1|0|1}, fitPref ∈ slim|regular|relaxed, chart`.

1. **Body estimate.** Predict chest, waist, hip girth and torso/inseam length from sex, height and weight using linear regressions (girth ~ a + b·height + c·weight + d·BMI) fitted **offline on the public-domain ANSUR II dataset** and shipped as constants. Apply shape adjustments of ±5% to chest / waist / hip respectively.
2. **Target garment size.** For garment-basis charts, target = body girth × (1 + ease[category][fitPref]) adjusted by the chart's `intended_fit`. Example T-shirt chest ease: slim 6%, regular 12%, relaxed 20%. Flat measurements ×2. For body-basis charts, ease = 0 and the shopper's measurements are compared directly.
3. **Score each size.** Per dimension δ = (garment − target) / target. Weights depend on category: tops chest .5 / waist .3 / length .2; bottoms waist .5 / hip .35 / inseam .15. Error = Σ w·|δ|, plus a penalty of 1.5× on negative δ beyond −4%, because too tight is worse than too loose.
4. **Best size** = lowest error, with ties broken toward the larger size for Relaxed and the smaller for Slim.
5. **Fit match %** = clamp(round(100 − 350·error), 55, 98). Bands: ≥85 "A confident match", 70–84 "A good match", below 70 "Between sizes" with the runner-up named.
6. **Per-area dot**: δ mapped to a position from snug (−10%) through ideal (0) to roomy (+10%). Labels: Snug below −3%, Ideal within ±3%, Roomy above 3%.
7. **Fit note**: "fits true to size" / "runs small, sized up for you" / "runs large", based on how far the chart deviates from the template average.
8. **Live estimate (step 1)**: the same engine with shape = 0 and fitPref = regular.

Golden tests lock the behavior, including the video's observations under the default T-shirt template: male 180/89 → L; 186/92 → XL; 186/40 → S. (Exact boundaries come from the fitted coefficients; the tests protect against regressions, not the video's exact numbers.)

## 7. Plans (Shopify App Pricing)

> **Decided by the user on 2026-10-24 [user]:** one plan, Pro, at $9.99 every 30 days or $99 yearly, with a 14-day trial. There is no Free plan: a shop without an active subscription gets the plan page in the admin and nothing on the storefront. There is no "Powered by True" link. Plus waits for v2 AI import. Dev stores in the Partner org select Pro at no charge. See Plan 4. The draft table below is superseded.

### Original draft **[my call, superseded]**

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | Unlimited size chart tables + finder on up to 3 charts, "Powered by True" link |
| Pro | $9.99/mo (or yearly with a discount) | Unlimited charts, no branding, analytics, assignment rules |
| Plus | $24.99/mo | Everything in Pro plus the v2 AI chart import and priority support |

A 14-day free trial on paid plans. Gating reads the active subscription. A dev store gets the plans free for testing.

## 8. Compliance and quality
- Scopes: `write_products`, `write_metaobjects`, `write_metaobject_definitions`, `write_app_proxy`. No customer scopes, no `read_reports` and no protected customer data.
- Mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are implemented. Analytics data is deleted on `shop/redact`.
- Uninstall: clear the DB rows for the shop. Metaobjects owned by the app are removed with the app.
- Session-token auth and App Bridge (template defaults). The admin passes the Built for Shopify admin performance criteria (LCP, CLS, INP).
- Before submission, run the App Store self-review (`shopify doc fetch` of the review requirements) and fix every ❌.

## 9. Milestones
- **M0 – Scaffold and spike**: init the app, a dev store, the theme app extension, TOML definitions; prove the Liquid access path for a metaobject through a product metafield.
- **M1 – Engine**: fit the ANSUR II regressions, implement the engine, unit and golden tests.
- **M2 – Storefront finder**: block, embed, lazy loader, the 4 screens, size chart tab, profile, add to bag, mobile sheet, a11y. Lighthouse check.
- **M3 – Admin**: onboarding, templates, chart editor, assignment rules + webhooks, size mapping check, live preview.
- **M4 – Analytics and plans**: app proxy events, daily aggregation, dashboard, Shopify App Pricing gating.
- **M5 – Launch readiness**: performance (Lighthouse delta ≤ 3), a11y audit, privacy webhooks, App Store self-review, listing assets (screens, video, copy).

## 10. Open items for the user
1. The pricing tiers and prices in §7.
2. Whether "True: Size Chart" is available as an App Store listing name.
3. Whether the default storefront look should copy the video's monochrome editorial style (assumed yes) or have its own brand look.
