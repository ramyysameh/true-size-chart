# True: Size Chart — Plan 4: Analytics and Pricing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant sees how shoppers use the finder (opens, completions, add-to-bags, recommended sizes per chart), and the app charges through Shopify App Pricing: one Pro plan, with the storefront switched off for any shop without an active subscription.

**Architecture:** The finder bundle (`tsc-finder.js`, never the inline loader) sends anonymous `navigator.sendBeacon` events to the app proxy `/apps/tsc/e`. The proxy route verifies Shopify's signature with `authenticate.public.appProxy`, validates the tiny payload and increments per-day counters in Prisma (`EventDaily`, `EventSizeDaily`). Raw events are never stored. Entitlement comes from the Partner API's `activeSubscription`; the app mirrors it into a boolean app-data metafield `tsc.active` that the block and embed read through `available_if`, so Liquid alone turns the storefront off. The admin redirects shops without a subscription to Shopify's hosted plan page.

**Tech Stack:** TypeScript, React Router 7 (`@shopify/shopify-app-react-router`), Polaris web components, Prisma (SQLite until Plan 5), Vitest, Admin GraphQL 2026-07, Partner API 2026-07, ShopifyQL (`shopifyqlQuery`).

**Spec:** `docs/superpowers/specs/2026-10-18-true-size-chart-design.md` (§2 Merchant admin: Analytics, Plans; §4; §5 Storefront runtime step 5, Data model `EventDaily` / `ShopState.planHandle`; §7 as revised 2026-10-24; §8; §9 M4). Format and contracts: `docs/superpowers/plans/2026-10-22-plan-3-merchant-admin.md`.

**Later plans:** 5 Launch readiness (Postgres + hosting, privacy webhooks incl. `shop/redact` deleting events, App Store review, listing assets).

## Pricing decision (user, 2026-10-24)

Replaces spec §7's draft table:

| Plan | Price | Includes |
|---|---|---|
| Pro (handle `pro`) | $9.99 every 30 days, or $99 yearly | Everything: unlimited charts, finder, assignment rules, size mapping, analytics |

- 14-day free trial (configured on the plan in the Partner Dashboard).
- **No Free plan.** Without an active subscription the admin sends the merchant to the hosted plan page, and the block and embed render nothing on the storefront.
- **No "Powered by True" link.** It existed only for the Free plan, so it is dropped.
- **No Plus plan at launch.** It waits for v2 AI chart import, because App Store review rejects plans that list features the app doesn't have.
- **Dev stores:** a dev store in the Zendo Labs org can select Pro at no charge (Shopify App Pricing does this; no code). No bypass code ships to production.

## Global Constraints

- **Body data never leaves the device.** Event payloads are exactly `{"e":"open"|"complete"|"atc","c":<chart key>,"s"?:<size label>}`. No height, weight, shape, fit preference, profile, URL, referrer, user agent or timestamp from the client.
- **Nothing loads before intent.** Event code lives in `tsc-finder.js` only. `packages/storefront/src/loader.ts` and `extensions/true-size-chart/snippets/tsc-loader.liquid` must not change in this plan (loader stays 858 B gz / 1 502 B raw, budget 1 024 / 1 536).
- **No cookies, no IP.** The app sets no cookies. Shopify's app proxy strips cookies before forwarding. The proxy route never reads or stores the IP, headers, `logged_in_customer_id` or any query parameter besides what `authenticate.public.appProxy` uses. No request logging in that route.
- **Storefront budgets** (`npm run build:storefront` fails otherwise): `tsc-finder.js` ≤ 15 360 B gz (now 13.1 KB), CSS ≤ 4 096 B gz, loader as above.
- **No theme code edits.** Gating uses `available_if` in the extension's own block schemas.
- **Definitions stay in `shopify.app.toml`.** The `tsc.active` app-data metafield is a value on the app installation and needs no definition. No `metafieldDefinitionCreate` at runtime.
- **Billing:** Shopify App Pricing only. Never generate `appSubscriptionCreate`, `billing.request`, `billing.require`, `BillingInterval` or a `billing` block in `shopifyApp()`. Subscription state comes only from the Partner API `activeSubscription(appId, shopId)`. App Pricing sends no Billing API webhooks, so state changes are picked up by the admin check and the 6-hourly refresher (Task 3).
- **Plan page URL:** `https://admin.shopify.com/store/{store handle}/charges/{app handle}/pricing_plans`, opened with `redirect(url, { target: "_top" })` from `authenticate.admin`.
- **Partner API:** `POST https://partners.shopify.com/{SHOPIFY_PARTNER_ORG_ID}/api/2026-07/graphql.json`, header `X-Shopify-Access-Token: {SHOPIFY_PARTNER_API_ACCESS_TOKEN}`, `appId = SHOPIFY_APP_GID` (`gid://shopify/App/{numeric id}`), `shopId` = the shop's Admin GID. Rate limit: 4 requests/s per client. Throttling or errors throw; they are never read as "no subscription".
- **Scopes** become `write_products,write_metaobjects,write_metaobject_definitions,write_app_proxy` (Task 2), plus `read_reports` (Task 6). A scope change makes the dev store re-consent on next admin load.
- **Admin GraphQL** goes through `gql()` (`app/lib/admin.server.ts`). Every operation in Appendix A was validated against Admin API 2026-07 and Partner API 2026-07 with the Shopify skill's `scripts/validate.mjs`. Re-validate any new or edited operation the same way.
- **Polaris:** route JSX uses only the `s-*` components Plan 3 lists. The toolkit's Polaris validator can't run on this machine, so check with `npm run typecheck && npm run lint`. Liquid: `shopify theme check --path extensions/true-size-chart`.
- **[my call] Counters, not an event log.** Events increment day rows at write time ("daily aggregation" with nothing to aggregate later). Spec §5's `sizeCounts json` becomes a separate `EventSizeDaily` table, so every increment is one atomic upsert (no read-modify-write of JSON).
- **[my call] Days are shop-local** (`shop.ianaTimezone`, stored in `ShopState.timezone`; UTC until known).
- **[my call] SQLite stays** until Plan 5; schemas use no SQLite-only features.
- Windows + PowerShell; never commit CRLF-only noise (`tsc-finder.css`, the engine golden snapshot); never `git stash`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Test baselines before this plan: app 148, storefront 168, engine 104.

## Manual setup (the user, before Task 3's live check)

1. Partner Dashboard (Zendo Labs) → Settings → Partner API clients → create a client with **Manage apps**. Put `SHOPIFY_PARTNER_ORG_ID`, `SHOPIFY_PARTNER_API_ACCESS_TOKEN` and `SHOPIFY_APP_GID` in `.env` (never committed).
2. App → Distribution → Shopify App Store listing → Pricing content: one plan, display name "Pro", handle `pro`, $9.99 every 30 days plus a $99 yearly option, 14-day free trial, welcome link `/app`, and top features. Save it as a draft if the listing isn't submitted yet.
3. Confirm the app handle on the plan page URL (Partner Dashboard app URL). The code reads `SHOPIFY_APP_HANDLE`, default `true-size-chart`.

## Review Focus

1. **Junk or flood on the proxy.** Shopify signs every request that passes through the proxy, so any visitor can POST anything: bad JSON, a 50 KB body, `{"e":"open","c":"x","height":180}`, 1 000 requests a second, or 500 different sizes. Expect the route to always answer 204 and never 500, to store only the allowed fields, to drop over the per-shop rate cap, and to keep at most 30 distinct sizes per chart and day. → Task 2.
2. **The Partner API is down or throttled for a paying merchant.** Expect no redirect to the plan page while the last confirmed check is under 24 h old. A shop never confirmed sees the error boundary, not a redirect loop. → Task 3.
3. **A merchant cancels from Shopify admin and never reopens the app.** Expect `tsc.active` to turn false (storefront off) within 6 h through the refresher. → Task 3.
4. **One shopper, many renders.** Expect one `open` and one `complete` per page view. That holds when the finder is reopened after closing, sizes are switched on the result, or the shopper goes Edit details → back to the result. Each successful add sends one `atc`, a failed add none, and the admin preview nothing. → Task 1.
5. **Day boundaries and first-event races.** 06:30 UTC on 2026-10-24 for an `America/Los_Angeles` shop counts on `2026-10-23`. An invalid time zone counts in UTC. Two first events of a new day arriving together both count (no lost increment on the unique-key race). → Task 2.

---

## File Structure

```
packages/storefront/src/events.ts            create  createTracker (sendBeacon, once-per-page rules)
packages/storefront/src/config.ts            modify  FinderConfig.events?
packages/storefront/src/finder/element.ts    modify  FinderContext.track; open() tracks
packages/storefront/src/finder/screens/result.ts  modify  complete + atc
packages/storefront/test/events.test.ts      create
extensions/true-size-chart/blocks/tsc-embed.liquid   modify  "events" in config; available_if
extensions/true-size-chart/blocks/tsc-button.liquid  modify  available_if
extensions/true-size-chart/assets/tsc-finder.js      regenerated (committed)
app/lib/events.ts               parseEvent, localDate, RateLimiter (pure)
app/lib/events.server.ts        recordEvent (Prisma counters)
app/routes/proxy.e.tsx          app proxy action: POST /apps/tsc/e → /proxy/e
app/lib/entitlement.ts          Subscription, planPageUrl, cache + grace rules (pure)
app/lib/partner.server.ts       fetchActiveSubscription, PartnerError
app/lib/entitlement.server.ts   checkEntitlement, refreshEntitlements, startEntitlementRefresher
app/lib/analytics.ts            dateRange, summarize (pure)
app/lib/analytics.server.ts     loadSummary, storeCartRate (ShopifyQL)
app/routes/app.analytics.tsx    dashboard
app/routes/app.tsx              modify  entitlement gate + nav "Analytics"
app/routes/app._index.tsx       modify  plan card
app/routes/webhooks.app.uninstalled.tsx  modify  delete events
app/entry.server.tsx            modify  startEntitlementRefresher()
app/lib/assign.server.ts        modify  fetchAllFacts cursor guard
app/lib/*.test.ts               Vitest
prisma/schema.prisma            EventDaily, EventSizeDaily, ShopState fields (+ 2 migrations)
shopify.app.toml                [app_proxy], scopes
docs/superpowers/specs/2026-10-18-true-size-chart-design.md  modify §7 (done with this plan)
```

---

### Task 1: Finder events (storefront)

**Files:**
- Create: `packages/storefront/src/events.ts`, `packages/storefront/test/events.test.ts`
- Modify: `packages/storefront/src/config.ts`, `src/finder/element.ts`, `src/finder/screens/result.ts`, `extensions/true-size-chart/blocks/tsc-embed.liquid`
- Test: also `test/element.test.ts`, `test/result.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // config.ts
  FinderConfig.events?: string;            // proxy URL; absent = no events (the admin preview never sets it)
  // events.ts
  export type EventName = 'open' | 'complete' | 'atc';
  export interface Tracker { open(): void; complete(size: string): void; addToCart(size: string): void }
  export function createTracker(
    config: Pick<FinderConfig, 'events' | 'preview' | 'chart'>,
    nav?: { sendBeacon?(url: string, data: string): boolean },   // default: globalThis.navigator
  ): Tracker;
  // element.ts
  FinderContext.track: Tracker;            // one tracker per <true-size-finder> instance, made in setup()
  ```
- Rules:
  - Body is the string `JSON.stringify({ e, c: config.chart.key, s })`, with `s` omitted for `open`. Sent with `nav.sendBeacon(config.events, body)`; a string body goes as `text/plain`, so no CORS preflight.
  - No-op when `config.events` is falsy, `config.preview` is true, or `sendBeacon` is missing. A throwing `sendBeacon` is swallowed.
  - `open` and `complete` send at most once per tracker (= per page view). `addToCart` sends every call.
  - `element.ts`: `open()` calls `ctx.track.open()` after the first screen rendered without throwing (on both tabs).
  - `result.ts`: `ctx.track.complete(rec.size)` right after `saveProfile`; `ctx.track.addToCart(pick.size)` only when `addToCart` resolved `ok: true` (drawer or not).
  - Embed Liquid adds `"events": "/apps/tsc/e",` to the config object (after `"assets"`).

- [ ] **Step 1: Write failing tests** in `events.test.ts` with a fake `nav` that records `(url, data)`:
  - `open(); open()` → 1 call, `('/apps/tsc/e', '{"e":"open","c":"tee"}')`.
  - `complete('L'); complete('M')` → 1 call, data `{"e":"complete","c":"tee","s":"L"}`.
  - `addToCart('L'); addToCart('L')` → 2 calls with `"e":"atc"`.
  - no `events` → 0 calls; `preview: true` → 0 calls; `nav = {}` → no throw; `sendBeacon` throwing → no throw.
  - Every payload parses to an object whose keys ⊆ `['e','c','s']`.
  - Review Focus 4 in `element.test.ts` / `result.test.ts` (stub `navigator.sendBeacon`): open → close → open sends one `open`; result render sends one `complete` with the recommended size, and clicking two other size buttons sends no more; Edit details → back to result sends no second `complete`; a successful add sends `atc` with the added size; a failed add (fetch 422) sends none; a `preview: true` config sends nothing at all.
- [ ] **Step 2:** `npm run test:storefront`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `events.ts` and the wiring; add the Liquid line.
- [ ] **Step 4:** `npm run test:storefront && npm run build:storefront && shopify theme check --path extensions/true-size-chart`. Expected: PASS; finder JS under 15 360 B gz; loader still 858 / 1 502; `git diff --stat` shows no change to `tsc-loader.liquid`; theme check has no new offenses.
- [ ] **Step 5: Commit** `feat(storefront): anonymous finder events via sendBeacon`

### Task 2: Event ingestion through the app proxy

**Files:**
- Create: `app/lib/events.ts`, `app/lib/events.test.ts`, `app/lib/events.server.ts`, `app/lib/events.server.test.ts`, `app/routes/proxy.e.tsx`, `app/lib/proxy.e.test.ts`
- Modify: `prisma/schema.prisma` (+ migration `plan4_events`), `shopify.app.toml`, `app/routes/webhooks.app.uninstalled.tsx`, `app/lib/webhooks.uninstalled.test.ts`

**Interfaces:**
- Prisma:
  ```prisma
  model EventDaily {
    shop        String
    chartKey    String   // metaobject handle (FinderConfig.chart.key)
    date        String   // YYYY-MM-DD, shop-local
    opens       Int      @default(0)
    completions Int      @default(0)
    addToCarts  Int      @default(0)
    @@id([shop, chartKey, date])
  }
  model EventSizeDaily {
    shop     String
    chartKey String
    date     String
    size     String     // recommended size label, as sent
    count    Int        @default(0)
    @@id([shop, chartKey, date, size])
  }
  // ShopState gains:
  timezone String?     // shop.ianaTimezone (written by Task 3)
  ```
- Produces:
  ```ts
  // events.ts
  export type ParsedEvent = { e: 'open'; c: string } | { e: 'complete' | 'atc'; c: string; s: string };
  export function parseEvent(body: string): ParsedEvent | null;
  export function localDate(now: Date, timeZone: string | null | undefined): string;   // 'YYYY-MM-DD'
  export class RateLimiter {
    constructor(opts?: { perSecond?: number; burst?: number; now?: () => number });   // defaults 10, 60
    allow(shop: string): boolean;
  }
  // events.server.ts
  export interface EventDb { eventDaily: Prisma.EventDailyDelegate; eventSizeDaily: Prisma.EventSizeDailyDelegate }
  export const MAX_SIZES_PER_DAY = 30;
  export function recordEvent(db: EventDb, shop: string, ev: ParsedEvent, date: string): Promise<void>;
  ```
- Rules:
  - `parseEvent`: `null` when the body is over 512 bytes, isn't JSON, isn't an object, `e` isn't one of the three names, or `c` doesn't match `/^[a-z0-9_-]{1,64}$/`. For `complete`/`atc`, `s` must be a string that is 1–16 chars after `trim()` with no control characters (`/[\u0000-\u001f\u007f]/`); it's returned trimmed. `open` ignores `s`. Extra keys are dropped, never stored.
  - `localDate`: `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`; a missing or invalid zone (RangeError) → UTC.
  - `RateLimiter`: token bucket per shop, in memory (one process until Plan 5).
  - `recordEvent`: `open` → `opens +1`, `complete` → `completions +1` and the size row `+1`, `atc` → `addToCarts +1`. Atc sizes go into no table. Each counter is one `upsert` with `{ increment: 1 }` (create with 1). A Prisma `P2002` on the create path retries once as an update (Review Focus 5). A size row that doesn't exist yet is skipped when the chart-day already has `MAX_SIZES_PER_DAY` sizes.
  - Route `proxy.e.tsx` (`action` only): `await authenticate.public.appProxy(request)`; a signature failure keeps the library's response. No session (app uninstalled) → 204. Otherwise `shop` from the session, `parseEvent(await request.text())`, `RateLimiter.allow(shop)`, then `localDate(new Date(), ShopState.timezone)` and `recordEvent`. Always `new Response(null, { status: 204 })`; a DB error is caught and answered 204 (beacons can't retry). A `loader` returns 405.
  - TOML: `[app_proxy] url = "/proxy"`, `prefix = "apps"`, `subpath = "tsc"`; add `write_app_proxy` to scopes.
  - Uninstall also deletes the shop's `EventDaily` and `EventSizeDaily` rows.

- [ ] **Step 1: Write failing tests**:
  - `parseEvent`: the three valid shapes; Review Focus 1 (600-byte body, `"{"`, `[]`, `{"e":"view"}`, `c` = `"Tee Shirt"`, `s` = `""` / 17 chars / `"L\n"`, extra `height` key dropped from the result).
  - `localDate(new Date('2026-10-24T06:30:00Z'), 'America/Los_Angeles') === '2026-10-23'`; `'Not/AZone'` and `null` → `'2026-10-24'`.
  - `RateLimiter` with a fake clock: 60 allowed, the 61st refused, allowed again after 100 ms.
  - `recordEvent` with a fake `EventDb`: each event hits the right counter. The P2002 path retries and the increment lands. The 31st distinct size is skipped, but an existing size still increments.
  - Route (mock `authenticate.public.appProxy` and the db): a valid body → `recordEvent` called with the session's shop, 204; junk → 204, no write; a throwing db → 204; no session → 204, no write.
  - Uninstall test: event rows deleted.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement; `npx prisma migrate dev --name plan4_events`.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Live check** (`shopify app dev`, accept the new scope): on the dev store, open the finder on TSC Test Tee, complete it, and add to bag. `npx prisma studio` shows the tee chart's row with `opens 1, completions 1, addToCarts 1` plus one size row. A reload and second open adds `opens 2`. `curl -X POST <tunnel>/proxy/e -d '{}'` without a signature is refused (4xx).
- [ ] **Step 6: Commit** `feat(admin): app proxy event ingestion into daily counters`

### Task 3: Entitlement from Shopify App Pricing

**Files:**
- Create: `app/lib/entitlement.ts`, `app/lib/entitlement.test.ts`, `app/lib/partner.server.ts`, `app/lib/partner.server.test.ts`, `app/lib/entitlement.server.ts`, `app/lib/entitlement.server.test.ts`
- Modify: `prisma/schema.prisma` (+ migration `plan4_entitlement`), `app/entry.server.tsx`

**Interfaces:**
- Prisma, `ShopState` gains:
  ```prisma
  shopGid              String?    // gid://shopify/Shop/…
  installationId       String?    // currentAppInstallation.id
  planHandle           String?    // spec §5; activeSubscription.items[0].handle
  billingPeriod        String?    // e.g. EVERY_30_DAYS, ANNUAL
  trialEndsAt          DateTime?
  entitled             Boolean    @default(false)
  entitlementCheckedAt DateTime?  // last confirmed Partner answer
  entitlementWritten   Boolean?   // last value written to tsc.active (null = never)
  ```
- Produces:
  ```ts
  // entitlement.ts
  export interface Subscription {
    billingPeriod: string; cancelAtEndOfCycle: boolean; trialEndsAt: string | null;
    currentBillingCycle: { startTime: string; endTime: string } | null; items: { handle: string }[];
  }
  export type Entitlement = { active: true; source: 'partner' | 'cache' | 'grace' | 'override' } | { active: false };
  export const CACHE_MS = 5 * 60_000, GRACE_MS = 24 * 3_600_000, REFRESH_MS = 6 * 3_600_000;
  export function planPageUrl(shopDomain: string, appHandle: string): string;
  export function cachedActive(state: { entitled: boolean; entitlementCheckedAt: Date | null }, now: Date): boolean;   // entitled && age < CACHE_MS
  export function withinGrace(state: { entitled: boolean; entitlementCheckedAt: Date | null }, now: Date): boolean;   // entitled && age < GRACE_MS
  // partner.server.ts
  export class PartnerError extends Error {}
  export function fetchActiveSubscription(shopGid: string, fetchImpl?: typeof fetch): Promise<Subscription | null>;
  // entitlement.server.ts
  export interface EntitlementDeps { fetchSubscription: (shopGid: string) => Promise<Subscription | null>; db: typeof prisma; now: () => Date }
  export function checkEntitlement(admin: AdminClient, shop: string, opts?: { fresh?: boolean; deps?: Partial<EntitlementDeps> }): Promise<Entitlement>;
  export function refreshEntitlements(deps?: Partial<EntitlementDeps> & { adminFor?: (shop: string) => Promise<AdminClient> }): Promise<{ checked: number; changed: number }>;
  export function startEntitlementRefresher(): void;
  ```
- Rules:
  - `planPageUrl('cool-shop.myshopify.com', 'true-size-chart')` → `https://admin.shopify.com/store/cool-shop/charges/true-size-chart/pricing_plans`.
  - `fetchActiveSubscription`: missing env → `PartnerError('Partner API is not configured')`; sends the Appendix A `ActiveSubscription` query to the Constraints URL; non-2xx, a top-level `errors` array, or a 429 → `PartnerError`; returns `data.activeSubscription` (null = no subscription).
  - `checkEntitlement`:
    1. `ENTITLEMENT_OVERRIDE === 'active'` and `NODE_ENV !== 'production'` → `{ active: true, source: 'override' }` with no calls and no writes.
    2. Not `fresh` and `cachedActive` → `{ active: true, source: 'cache' }` with no calls. Inactive results are never cached.
    3. Run `ShopContext` when `shopGid`, `installationId` or `timezone` is missing, and store them.
    4. `fetchSubscription(shopGid)`. On `PartnerError`, return `grace` if `withinGrace`, else rethrow. Never treat the error as inactive.
    5. Store `entitled`, `planHandle`, `billingPeriod`, `trialEndsAt` and `entitlementCheckedAt = now`.
    6. When the result ≠ `entitlementWritten`, call `SetEntitlement` with `{ ownerId: installationId, namespace: "tsc", key: "active", type: "boolean", value: "true"|"false" }` and store `entitlementWritten`. A `userErrors` reply throws `AdminError`.
  - `refreshEntitlements`: shops with `entitled = true` and `entitlementCheckedAt` older than `REFRESH_MS`, one at a time, ≥ 300 ms apart (Partner limit 4/s shared with admin loads). It calls `checkEntitlement(await adminFor(shop), shop, { fresh: true })`, where `adminFor` defaults to `unauthenticated.admin(shop).admin`. One shop's error is logged without body data and doesn't stop the loop.
  - `startEntitlementRefresher`: once per process (guard on `globalThis.__tscRefresher`), `setInterval(refreshEntitlements, 30 * 60_000)` plus one run 60 s after start; never in tests. Called at module scope in `entry.server.tsx`.

- [ ] **Step 1: Write failing tests**:
  - `planPageUrl` exact string; `cachedActive` / `withinGrace` at 4 min / 6 min / 23 h / 25 h.
  - `fetchActiveSubscription` with a fake fetch: URL `https://partners.shopify.com/123/api/2026-07/graphql.json`, header, variables `{ appId: 'gid://shopify/App/9', shopId }`; `null` passes through; `{ errors: [...] }` → `PartnerError`; status 429 → `PartnerError`; no env → `PartnerError`.
  - `checkEntitlement` with a fake admin, fake Partner, in-memory db stub:
    - A cached active shop makes no calls.
    - An inactive shop asks the Partner API on every call.
    - false → true writes `tsc.active = "true"` to the installation id once; a second fresh check with no change writes nothing.
    - Review Focus 2: a `PartnerError` with the last confirmation 2 h ago → `grace`; with no confirmation → throws.
    - The override gives active in test, but is ignored when `NODE_ENV = 'production'`.
  - Review Focus 3: `refreshEntitlements` with a shop checked 7 h ago whose Partner answer is now `null` → writes `"false"`, `entitled = false`, `changed: 1`; a shop checked 1 h ago isn't asked.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement; `npx prisma migrate dev --name plan4_entitlement`.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): entitlement from Shopify App Pricing via the Partner API`

### Task 4: Gate the admin and the storefront; plan card

**Files:**
- Modify: `app/routes/app.tsx`, `app/routes/app._index.tsx`, `extensions/true-size-chart/blocks/tsc-embed.liquid`, `extensions/true-size-chart/blocks/tsc-button.liquid`
- Test: `app/lib/entitlement.test.ts` (plan card copy)

**Interfaces:**
- Consumes: `checkEntitlement`, `planPageUrl` (Task 3).
- Produces:
  ```ts
  export function planSummary(state: { planHandle: string | null; billingPeriod: string | null; trialEndsAt: Date | null }, now: Date): string;   // entitlement.ts
  ```
- Rules:
  - `app.tsx` loader: `const { admin, redirect, session } = await authenticate.admin(request)`; `checkEntitlement(admin, session.shop, { fresh: url.searchParams.has('plan_handle') })` (the welcome link adds `plan_handle`). When not active → `redirect(planPageUrl(session.shop, process.env.SHOPIFY_APP_HANDLE ?? 'true-size-chart'), { target: '_top' })`. A thrown `PartnerError` goes to the existing error boundary.
  - Both block schemas gain `"available_if": "{{ app.metafields.tsc.active }}"`. A missing metafield (a new install that hasn't subscribed) means the blocks render nothing.
  - `planSummary`: trial running → `"Pro · free trial until {d MMM yyyy}"`; `EVERY_30_DAYS` → `"Pro · monthly"`; `ANNUAL` → `"Pro · yearly"`; anything else → `"Pro"`.
  - Home: a "Plan" `s-section` showing `planSummary` and an `s-link` "Change plan" to `planPageUrl` with `target="_top"`.

- [ ] **Step 1: Write failing tests** for `planSummary` (trial in the future, trial in the past with `ANNUAL`, unknown period).
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint && shopify theme check --path extensions/true-size-chart`. Expected: clean.
- [ ] **Step 5: Live check** (after Manual setup):
  - With no plan, opening the app lands on Shopify's plan page.
  - Choose Pro (free on the dev store). The welcome link returns to `/app`, Home shows "Pro · free trial until …", and the TSC Test Tee page shows the button and the finder.
  - In the app's GraphiQL (`g` in `shopify app dev`), run `SetEntitlement` with `"false"`. The product page now has no button and no `#tsc-config`, and the theme editor lists the blocks as unavailable.
  - Set it back to `"true"` and both return.
- [ ] **Step 6: Commit** `feat(admin): gate admin and storefront on the Pro subscription`

### Task 5: Analytics dashboard

**Files:**
- Create: `app/lib/analytics.ts`, `app/lib/analytics.test.ts`, `app/lib/analytics.server.ts`, `app/routes/app.analytics.tsx`
- Modify: `app/routes/app.tsx` (nav: Home, Charts, Assignments, Size mapping, **Analytics**)

**Interfaces:**
- Consumes: `listCharts(admin): Promise<ChartDraft[]>` (`charts.server.ts`; maps to `{ handle: d.handle!, name: d.name, sizes: d.table.sizes }`), `localDate` (Task 2) with `ShopState.timezone` for "today", Prisma rows.
- Produces:
  ```ts
  export type RangeDays = 7 | 30 | 90;
  export interface DailyRow { chartKey: string; date: string; opens: number; completions: number; addToCarts: number }
  export interface SizeRow { chartKey: string; date: string; size: string; count: number }
  export interface Totals { opens: number; completions: number; addToCarts: number; completionRate: number | null; cartRate: number | null }
  export interface ChartStats extends Totals { chartKey: string; name: string; deleted: boolean; sizes: { size: string; count: number; share: number }[] }
  export interface Summary { from: string; to: string; totals: Totals; charts: ChartStats[]; daily: ({ date: string } & Omit<Totals, 'completionRate' | 'cartRate'>)[] }
  export function dateRange(today: string, days: RangeDays): { from: string; to: string };   // inclusive, `days` dates ending today
  export function summarize(daily: DailyRow[], sizes: SizeRow[], charts: { handle: string; name: string; sizes: string[] }[], range: { from: string; to: string }): Summary;
  export function loadSummary(shop: string, admin: AdminClient, days: RangeDays): Promise<Summary>;   // analytics.server.ts
  ```
- Rules:
  - `completionRate = completions / opens`, `cartRate = addToCarts / completions`, `null` when the denominator is 0.
  - `sizes` follow the chart's own size order; labels no longer in the chart come after, alphabetically. `share = count / sum`.
  - `charts` sorted by `opens` desc, then name. A key with no current chart → `name: 'Deleted chart'`, `deleted: true`.
  - `daily` holds every date in the range, zero-filled.
  - Page: `?days=7|30|90` (default 30, anything else 30) via `s-select`.
    - Three figures: "Finder opens", "Completed", "Added to bag from the finder", each with its rate underneath.
    - An `s-table` per chart (Chart, Opens, Completed, Added to bag, Completion %, Add-to-bag %).
    - Per chart, a "Recommended sizes" list with a plain `div` bar per size (width = share).
    - Empty state: "No finder activity in this period yet. Counts appear here after shoppers open the finder."
    - Footer note: "Anonymous counts only. Shoppers' measurements never leave their device."

- [ ] **Step 1: Write failing tests**: `dateRange('2026-10-24', 7)` → `{ from: '2026-10-18', to: '2026-10-24' }` and across a month and year boundary; `summarize` totals and rates (0 opens → `null` rates); size order with an unknown label `"XXXL"` last; a deleted chart key; zero-filled daily series of length 7.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement the libs and the route.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 5: Live check**: after Task 2's live events, the page shows them under today's date for the tee chart, the 7/30/90 switch works, and a chart deleted afterwards shows as "Deleted chart".
- [ ] **Step 6: Commit** `feat(admin): analytics dashboard`

### Task 6: Finder versus all shoppers (ShopifyQL)

**Files:**
- Modify: `app/lib/analytics.server.ts`, `app/lib/analytics.ts`, `app/lib/analytics.test.ts`, `app/routes/app.analytics.tsx`, `shopify.app.toml` (scope `read_reports`)

**Interfaces:**
- Produces:
  ```ts
  export function shopifyqlFor(days: RangeDays): string;   // analytics.ts
  export function parseStoreRate(tableData: { columns: { name: string }[]; rows: unknown } | null, parseErrors: unknown): { sessions: number; withCart: number; rate: number | null } | null;
  export function storeCartRate(admin: AdminClient, days: RangeDays): Promise<{ sessions: number; withCart: number; rate: number | null } | null>;   // analytics.server.ts
  ```
- Rules:
  - `shopifyqlFor(30)` → `FROM sessions SHOW sessions, sessions_with_cart_additions WHERE human_or_bot_session = 'human' SINCE -30d UNTIL today`.
  - `parseStoreRate`: non-empty `parseErrors`, a missing column, or no rows → `null`. `rows` may be an array of objects keyed by column name or of arrays in column order; accept both. Values may be numeric strings.
  - `storeCartRate` runs `StoreSessions`; an `AdminError` (e.g. access denied) → `null`.
  - The page adds one comparison card when not null: "Shoppers who completed the finder: {cartRate}% added to bag from the finder · All store sessions: {rate}% added anything to cart". Caption: "A rough comparison, not a controlled test: finder users are already interested shoppers." `null` hides the card.

- [ ] **Step 1: Write failing tests**: `shopifyqlFor` strings for 7/30/90; `parseStoreRate` with object rows, array rows, string numbers, `parseErrors: ['x']`, `rows: []`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`, then live: accept the new scope; the card shows on the dev store (or stays hidden with zero sessions, with no error); the query returns no `parseErrors` (log them once if it does, then fix the ShopifyQL text against the `sessions` schema docs).
- [ ] **Step 5: Commit** `feat(admin): compare finder add-to-bag rate with store sessions`

### Task 7: Plan 3 follow-up: product paging guard

**Files:**
- Modify: `app/lib/assign.server.ts:81-92`, `app/lib/assign.server.test.ts`

- Rule: in `fetchAllFacts`, `hasNextPage` with a null `endCursor` throws `new AdminError('The product list came back incomplete (next page without a cursor).')`, the same as `listChartItems` in `charts.server.ts`. `requestSync` already turns a throw into `syncError`.

- [ ] **Step 1: Write the failing test**: a fake admin returning `{ hasNextPage: true, endCursor: null }` makes `syncProducts(admin, rules)` reject with that message and send no mutation.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL (today it loops with `after: null`).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(admin): stop product paging on a next page without a cursor`

---

## Appendix A: GraphQL operations (validated 2026-10-24)

Admin API 2026-07:

```graphql
query ShopContext {
  shop { id myshopifyDomain ianaTimezone }
  currentAppInstallation { id }
}
mutation SetEntitlement($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { namespace key value } userErrors { field message code } }
}
query StoreSessions($q: String!) {          # needs read_reports
  shopifyqlQuery(query: $q) { tableData { columns { name dataType } rows } parseErrors }
}
```

Partner API 2026-07 (`partners.shopify.com/{org}/api/2026-07/graphql.json`):

```graphql
query ActiveSubscription($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    billingPeriod cancelAtEndOfCycle trialEndsAt
    currentBillingCycle { startTime endTime }
    items { handle }
  }
}
```

The ShopifyQL text in Task 6 has no validator in the toolkit. Task 6's live step checks it via `parseErrors`.

## Not in this plan

- "Powered by True" link, Free plan, Plus plan: dropped by the 2026-10-24 pricing decision.
- Merchants can rename the app proxy prefix and subpath in their admin. Beacons to `/apps/tsc/e` then 404 silently and the dashboard shows zero. Detecting this needs a design pass (Plan 5).
- Event retention or purge, and `shop/redact` deletion of events (Plan 5, with the privacy webhooks).
- The refresher and the rate limiter assume one long-lived server process. Plan 5's hosting must keep that, or move both to a scheduled job and the DB.
- Per-product analytics, CSV export, and a daily trend chart (the `daily` series is computed and unused beyond the table).
