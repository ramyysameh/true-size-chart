# True: Size Chart — Plan 5: Launch Readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app runs in production on Postgres, meets every App Store requirement that applies to it (privacy compliance webhooks, no shop-domain form, honest listing, working install and reinstall), closes the Plan 3 and Plan 4 follow-ups, and is ready for the user to press "Submit for review".

**Architecture:** One always-on web instance on Render (Docker) with a Render Postgres database. The entitlement refresher keeps running in-process, but a DB lease makes sure only one process runs it, including while a deploy briefly overlaps two instances. The proxy rate limiter stays in memory, which is sound with one instance. Privacy webhooks share one route and one shop-data deletion helper with uninstall. The ShopifyQL comparison and `read_reports` go away, so the app touches no protected customer data. Submission work (listing copy, icon, self-review report) lives in `docs/launch/`.

**Tech Stack:** TypeScript, React Router 7 (`@shopify/shopify-app-react-router` 3.0.2), Polaris web components, Prisma 6 on PostgreSQL, Vitest, Admin GraphQL 2026-07, Partner API 2026-07, Render Blueprint (`render.yaml`), Docker, Shopify CLI 4.9.

**Spec:** `docs/superpowers/specs/2026-10-18-true-size-chart-design.md` (§1 privacy, §4 anti-goals, §5 architecture and data model, §7 as revised 2026-10-24, §8 compliance, §9 M5, §10 open items). Format and contracts: `docs/superpowers/plans/2026-10-24-plan-4-analytics-and-pricing.md`.

**Later plans:** v1.1 more languages, v2 AI chart import and the Plus plan.

## Decisions for the user to confirm before Task 2

1. **Host [my call, please confirm]: Render.** A Docker web service on the Starter plan (always on, 1 instance, region Ohio) plus Render Postgres (the smallest paid plan, region Ohio, private network only), both declared in `render.yaml`. That is roughly $7 + $6 a month; the Blueprint sync screen shows the exact plans and prices before anything is created. I chose it over Fly.io (spec §5 allows either) because it deploys from GitHub with no CLI on this Windows machine, keeps secrets in its dashboard, and runs Postgres next to the app. The alternative is Fly.io with one machine plus Neon Postgres; only Task 11 would change.
2. **Single process [my call].** We keep one web instance (`numInstances: 1`). The refresher stays in `entry.server.tsx` behind a DB lease (Task 2). The `RateLimiter` stays in memory: during a deploy's few seconds of overlap the per-shop cap can briefly double, and that is acceptable for anonymous counters. Moving to a cron job or shared storage is only needed if we ever scale out, so it is listed under "Not in this plan".
3. **Dev database [my call].** Local development also moves to Postgres, so dev and production run the same SQL. Any Postgres 16+ URL works. My suggestion is a free Neon project named `tsc-dev`. Tests never touch a database (they mock `db.server`), so CI needs none.
4. **Support and API contact email [user].** Proposed: `zendolabs@gmail.com` (it must not contain "shopify"). It appears on the public landing page, the privacy policy and the listing.
5. **Listing name [user, spec §10.2].** "True: Size Chart". Task 13 checks that the submission form accepts it.

## Manual setup (the user)

- **Before Task 2:** create the dev Postgres database and put `DATABASE_URL="postgresql://…?sslmode=require"` in the git-ignored `.env` at the main checkout root. Copy it into the worktree's `.env` if the work runs in a worktree. If `prisma migrate dev` complains that it can't create a shadow database, also set `SHADOW_DATABASE_URL` to a second empty database.
- **Before Task 11:** a Render account connected to GitHub `ramyysameh/true-size-chart`. The agent never signs in or types secrets. The user pastes `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` and the three `SHOPIFY_PARTNER_*` values into the Render dashboard.
- **Before Task 10's live checks:** unlock the dev store's storefront password in the browser pane (the agent never types it), and in the theme editor set the dev theme's cart type to **Drawer**.
- **During Task 13:** in the Partner Dashboard, the emergency developer contact, the API contact email, the app icon upload, protected customer data ("not needed"), the listing form, the screencast recording, and the final **Submit**. The agent prepares every input; the user enters and submits them.

## Global Constraints

- **Body data never leaves the device.** Event payloads stay exactly `{"e":"open"|"complete"|"atc","c":<chart key>,"s"?:<size label>}`. No cookies and no IP. The proxy reads only the body, the `content-length` header (Task 5) and what `authenticate.public.appProxy` uses.
- **No protected customer data.** After Task 1 the scopes are exactly `write_products,write_metaobjects,write_metaobject_definitions,write_app_proxy`. There are no customer or order scopes and no `read_reports`. Compliance webhooks still exist, because every App Store app must have them.
- **Nothing loads before intent; the loader is frozen.** `extensions/true-size-chart/snippets/tsc-loader.liquid` must be byte-identical after every task (858 B gz / 1 502 B raw). Task 9 changes types only.
- **Storefront budgets** (`npm run build:storefront` fails otherwise): `tsc-finder.js` ≤ 15 360 B gz (now 13 251), `tsc-finder.css` ≤ 4 096 B gz (now 2 251), loader ≤ 1 024 B gz / 1 536 B raw.
- **Definitions live only in `shopify.app.toml`.** Webhook subscriptions too, including `compliance_topics`. There are no runtime `webhookSubscriptionCreate` or `metafieldDefinitionCreate` calls.
- **Billing:** Shopify App Pricing only. Never `appSubscriptionCreate`, `billing.*` or a `billing` block. The plan page URL and the Partner API contract are as in Plan 4.
- **Pricing (spec §7):** one plan, Pro, handle `pro`, $9.99 every 30 days or $99 yearly, 14-day trial. No Free plan, no Plus plan and no "Powered by" link. Prices appear only in the listing's Pricing details (App Store requirement 4.2).
- **Listing copy (requirements 4.3.3 and 4.4):** no statistics, no guarantees, and no "best", "first" or "only". The spec's "best size chart app" (§1) is an internal goal, never listing text. No Shopify trademarks in the icon or images, and no prices in images.
- **URLs:** the production domain must not contain "shopify" or "example". `true-size-chart.onrender.com` is fine.
- **Admin GraphQL** goes through `gql()` (`app/lib/admin.server.ts`). Appendix A lists every operation this plan uses, each validated against Admin API 2026-07 or Partner API 2026-07 with the Shopify skill's `scripts/validate.mjs`. Re-validate any edited operation the same way.
- **Polaris:** only `s-*` components already used in `app/routes` plus `s-banner`. Check with `npm run typecheck && npm run lint`. Liquid: `shopify theme check --path extensions/true-size-chart`. Config: `shopify app config validate`.
- **Outward-facing steps need the user's yes in chat first:** `shopify app deploy`, the Render Blueprint sync, publishing a theme, pushing, opening a PR and submitting the listing.
- Windows + PowerShell for `shopify app dev`, `shopify app deploy` and `npx`, because `npx` in Git Bash is broken. Check that port 9293 is free before `shopify app dev`. Never commit CRLF-only noise (`tsc-finder.css`, the engine golden snapshot). Never use bare `git stash`. Never print or commit tokens. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Test baselines before this plan: app 244, storefront 187, engine 104.

## Review Focus

1. **Reinstall after an uninstall webhook that never ran.** `ShopState` keeps the old `installationId` and `entitlementWritten: true`, so `tsc.active` keeps going to the dead installation, and a paying merchant's storefront stays dark. Expect the first auth after the reinstall to store the new installation id, and the next admin load to write `tsc.active` to it. → Task 3.
2. **`shop/redact` for a shop that has reinstalled.** Shopify sends it 48 h after an uninstall. If the merchant reinstalled within those 48 h, the rows belong to the new installation, because uninstall already deleted the old ones. Expect the shop's data to be kept and the event logged when an offline session exists; otherwise everything for the shop is deleted. → Task 6.
3. **The proxy probe on a password-protected or offline storefront.** Dev stores and pre-launch shops redirect `/apps/tsc/ping` to `/password`. Expect status `unknown` and no "proxy moved" banner. Only a real 404 from Shopify's proxy counts as moved. → Task 7.
4. **A lapsed merchant posts to an action directly** (an old tab, a fetcher, a replayed form). Expect a redirect to the plan page and no write. No `app.*` route may export an `action` that skips the gate. → Task 4.
5. **Two processes during a deploy, or a crash mid-run.** Expect exactly one refresher run per interval across instances. A lease left by a crashed holder must free itself after 25 min, and the refresher must never throw out of `setInterval`. → Task 2.

---

## File Structure

```
app/lib/analytics.ts, analytics.server.ts, analytics.test.ts   modify  drop ShopifyQL (Task 1)
app/routes/app.analytics.tsx         modify  drop store card; proxy banner (Tasks 1, 7)
app/lib/app-config.test.ts           create  shopify.app.toml + embed guards (Tasks 1, 6, 7, 11)
prisma/schema.prisma                 modify  postgresql, JobLease, ShopState proxy fields (Tasks 2, 7)
prisma/migrations/                   replace one Postgres baseline 0_init (+ later migrate dev)
app/lib/lease.server.ts (+test)      create  acquireLease / releaseLease (Task 2)
app/lib/entitlement.server.ts (+test) modify refresher lease; refreshShopContext (Tasks 2, 3)
app/shopify.server.ts                modify  hooks.afterAuth (Task 3)
app/lib/gate.server.ts, gate.test.ts create  authenticatePro (Task 4)
app/routes/app.tsx, app.charts.$handle.tsx, app.charts._index.tsx, app.mapping.tsx,
  app.onboarding.tsx, app.rules.tsx  modify  actions through authenticatePro (Task 4)
app/lib/events.ts (+test), app/routes/proxy.e.tsx, app/lib/proxy.e.test.ts  modify  readCapped (Task 5)
app/lib/shop-data.server.ts          create  deleteShopData (Task 6)
app/routes/webhooks.compliance.tsx   create  privacy webhooks (Task 6)
app/lib/webhooks.compliance.test.ts  create
app/routes/webhooks.app.uninstalled.tsx  modify  uses deleteShopData (Task 6)
app/routes/proxy.ping.tsx            create  proxy liveness answer (Task 7)
app/lib/proxy-check.server.ts (+test) create probeProxy, proxyStatus (Task 7)
app/components/ProxyBanner.tsx       create  (Task 7)
app/routes/app._index.tsx            modify  proxy banner, 7-day activity, published-theme copy (Tasks 7, 8)
app/lib/onboarding.ts (+test), app/lib/analytics.server.ts  modify  (Task 8)
packages/storefront/src/loader.ts, package.json; package.json  modify  type-only fix, typecheck script (Task 9)
packages/storefront/src/styles/finder.css  modify  compact mobile chrome (Task 10)
extensions/true-size-chart/assets/tsc-finder.css  regenerated (Task 10)
app/routes/_index/route.tsx, styles.module.css; delete error.server.tsx  landing without shop form (Task 12)
app/routes/privacy.tsx, app/lib/brand.ts, app/lib/public-pages.test.ts  create (Task 12)
app/routes/healthz.tsx, app/lib/healthz.test.ts  create (Task 11)
Dockerfile, .dockerignore, render.yaml, shopify.app.toml  modify/create (Task 11)
docs/launch/listing.md, docs/launch/self-review.md, docs/launch/assets/icon.svg, icon.html  create (Task 13)
docs/superpowers/specs/2026-10-18-true-size-chart-design.md  modify  §2, §5, §8, §10 (Tasks 1, 11)
```

---

### Task 1: Remove the ShopifyQL comparison and `read_reports`

Live testing showed that `shopifyqlQuery` needs Level 2 protected customer data access, which conflicts with the app's no-personal-data stance. The card already hides itself when the query fails; this task removes the code and the scope.

**Files:**
- Modify: `app/lib/analytics.ts:117-166` (remove `StoreRate`, `shopifyqlFor`, `parseStoreRate`), `app/lib/analytics.server.ts:22-40` (remove `STORE_SESSIONS`, `storeCartRate`, the `AdminError`/`gql` imports if unused), `app/lib/analytics.test.ts` (remove the `shopifyqlFor` and `parseStoreRate` blocks), `app/routes/app.analytics.tsx` (loader returns `{ days, summary }`; delete the "Finder versus all shoppers" section), `shopify.app.toml:10`, spec §2 Analytics and §8 Scopes
- Create: `app/lib/app-config.test.ts`

**Interfaces:**
- Produces: `app/lib/app-config.test.ts` reads `shopify.app.toml` as text. Later tasks add cases to it. Helper inside the test file: `const toml = readFileSync('shopify.app.toml', 'utf8')`.

- [ ] **Step 1: Write the failing test** in `app-config.test.ts`:
  - `scopes` line equals `scopes = "write_products,write_metaobjects,write_metaobject_definitions,write_app_proxy"`.
  - No source file under `app/` contains `shopifyqlQuery` or `read_reports` (walk `app/` with `readdirSync(…, { recursive: true })`, skipping `*.test.ts`).
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL (both cases).
- [ ] **Step 3:** Remove the code, the tests for it, the route section and the scope. Spec edits:
  - §2 Analytics: replace "conversion versus non-users" with "add-to-bag rate of finder users (a store-wide comparison was dropped: it needs protected customer data, 2026-10-25)".
  - §8: the scopes become the four above.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint && shopify app config validate`. Expected: PASS. The app test count drops by the removed ShopifyQL tests; note the new count.
- [ ] **Step 5: Live check** (`shopify app dev`): `/app/analytics` loads with no comparison card and no error. Partner Dashboard → API access → Protected customer data shows nothing requested; if a request was started for `read_reports`, withdraw it (user step).
- [ ] **Step 6: Commit** `refactor(admin): drop the ShopifyQL store comparison and read_reports`

### Task 2: Postgres and a lease for the refresher

**Files:**
- Modify: `prisma/schema.prisma:11-14`, `app/lib/entitlement.server.ts:184-202`, `app/lib/entitlement.server.test.ts`
- Replace: `prisma/migrations/*` with `prisma/migrations/0_init/migration.sql` and `migration_lock.toml` (`provider = "postgresql"`)
- Create: `app/lib/lease.server.ts`, `app/lib/lease.server.test.ts`

**Interfaces:**
- Prisma:
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  // A named lock with an expiry, so one process at a time runs a background job.
  model JobLease {
    name        String   @id
    holder      String
    lockedUntil DateTime
  }
  ```
- Produces:
  ```ts
  // lease.server.ts
  export interface LeaseDb { jobLease: Pick<Prisma.JobLeaseDelegate, 'updateMany' | 'create'> }
  export function acquireLease(db: LeaseDb, name: string, holder: string, ttlMs: number, now: Date): Promise<boolean>;
  export function releaseLease(db: LeaseDb, name: string, holder: string, now: Date): Promise<void>;
  // entitlement.server.ts
  export const REFRESH_LEASE = 'entitlement-refresh';
  export const LEASE_MS = 25 * 60_000;    // shorter than the 30 min interval
  /** One timer tick: lease, refreshEntitlements, release. Exported for tests; startEntitlementRefresher calls it. */
  export function runRefresh(deps: Partial<EntitlementDeps> & { lease: LeaseDb; holder: string }): Promise<void>;
  ```
- Rules:
  - `acquireLease`: one `updateMany({ where: { name, lockedUntil: { lt: now } }, data: { holder, lockedUntil: now + ttlMs } })`. A count of 1 means acquired. A count of 0 tries `create({ data: { name, holder, lockedUntil } })`: success means acquired, and a Prisma `P2002` means another process holds it (`false`). Other errors propagate.
  - `releaseLease`: `updateMany({ where: { name, holder }, data: { lockedUntil: now } })`. It never throws (catch and ignore).
  - `runRefresh`: `acquireLease(lease, REFRESH_LEASE, holder, LEASE_MS, now())` and return when that is false; otherwise `refreshEntitlements(deps)` and `releaseLease` in `finally`. A lease or refresh error is logged with `describeError`; it never rejects. `startEntitlementRefresher` makes one `holder = crypto.randomUUID()` per process and its timer calls `runRefresh` (the in-process `running` flag stays).
  - Baseline migration: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/0_init/migration.sql`, run from PowerShell. The file must be UTF-8 without a BOM (check: its first bytes are `-- CreateTable`). The SQLite migrations are deleted: nothing was ever deployed, so no production data exists.
  - `app/lib/events.ts` `RateLimiter`: only its comment changes, to "in memory: one web instance (render.yaml numInstances 1); a deploy's overlap can briefly double the cap".

- [ ] **Step 1: Write failing tests** with an in-memory fake `jobLease` that honours the `where` filters:
  - The first acquire on an empty table → `true` (create path).
  - A second holder at `now + 1 min` → `false`.
  - The same name at `now + 26 min` (expired) → `true` for the second holder, and the row's holder changes.
  - A `create` throwing `{ code: 'P2002' }` → `false`; any other error → rejects.
  - `releaseLease` by the holder lets another holder acquire at once; release by a non-holder changes nothing.
  - Review Focus 5 in `entitlement.server.test.ts`: two concurrent `runRefresh` calls with different holders on one fake lease db → the Partner fake is asked for the due shops once. A `jobLease.updateMany` that rejects → `runRefresh` resolves, logs once, refreshes nothing.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement. Switch the datasource. Replace the migrations. Then `npx prisma migrate deploy` and `npx prisma migrate status` against the dev `DATABASE_URL`.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`. Expected: PASS. `npx prisma migrate status` → "Database schema is up to date".
- [ ] **Step 5: Live check** (`shopify app dev`; open the app once so the session lands in Postgres): Home, Charts, Assignments and Analytics load; a finder open on TSC Test Tee adds an `EventDaily` row (`npx prisma studio`). Uninstalling and reinstalling the app on the dev store works.
- [ ] **Step 6: Commit** `feat(admin): move to Postgres; lease the entitlement refresher`

### Task 3: Refresh shop context after auth (Plan 4 follow-up)

**Files:**
- Modify: `app/lib/entitlement.server.ts`, `app/lib/entitlement.server.test.ts`, `app/shopify.server.ts`

**Interfaces:**
- Consumes: `SHOP_CONTEXT` (Appendix A), `checkEntitlement` (Plan 4).
- Produces:
  ```ts
  export function refreshShopContext(admin: AdminClient, shop: string, deps?: Partial<Pick<EntitlementDeps, 'db'>>): Promise<void>;
  ```
- Rules:
  - Run `ShopContext` and upsert `{ shopGid, installationId, timezone }`. Always set `entitlementWritten: null`, so the next real check rewrites `tsc.active`. When the stored `installationId` differs from the new one (or there was no row), also set `entitlementCheckedAt: null`, so the next admin load skips the cache and the grace window. A reinstall can mean a different subscription.
  - It never throws: errors are logged as `Shop context refresh for ${shop} failed (${describeError(e)})`. An auth must never fail because of it.
  - `shopify.server.ts`: `hooks: { afterAuth: async ({ session, admin }) => { await refreshShopContext(admin, session.shop); } }`, with a static import of `refreshShopContext`.

- [ ] **Step 1: Write failing tests** (fake admin, in-memory `shopState`):
  - Stored `AppInstallation/1` and `ShopContext` returns `/2` → the row has `/2`, `entitlementWritten: null` and `entitlementCheckedAt: null`.
  - Same id → `entitlementWritten: null` and `entitlementCheckedAt` unchanged.
  - No row → created with the three fields.
  - `gql` rejecting → resolves; `console.error` was called once with no response body.
  - Review Focus 1 end to end: start with `{ installationId: '/1', entitled: true, entitlementWritten: true, entitlementCheckedAt: 1 min ago }`. Run `refreshShopContext` (now `/2`), then `checkEntitlement` with a Partner fake returning a subscription. Expect exactly one `SetEntitlement` with `ownerId: 'gid://shopify/AppInstallation/2'` and `value: 'true'`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire the hook.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Live check:** stop `shopify app dev`, so the uninstall webhook can't arrive. Uninstall the app from the dev store, start dev again and reinstall. Then `ShopState.installationId` matches `currentAppInstallation.id` in GraphiQL, and the TSC Test Tee page shows the button.
- [ ] **Step 6: Commit** `fix(admin): refresh the installation id after auth and rewrite tsc.active`

### Task 4: Gate every admin action (Plan 4 follow-up)

React Router runs only the action of the route that receives the POST, so the paywall in `app.tsx`'s loader never sees it.

**Files:**
- Create: `app/lib/gate.server.ts`, `app/lib/gate.test.ts`
- Modify: `app/routes/app.tsx` (loader uses `authenticatePro`), the `action` of `app.charts.$handle.tsx:80`, `app.charts._index.tsx:36`, `app.mapping.tsx:27`, `app.onboarding.tsx:65` and `app.rules.tsx:59`; `app/lib/app-gate.test.ts` (mock path)

**Interfaces:**
- Produces:
  ```ts
  export type AdminContext = Awaited<ReturnType<typeof authenticate.admin>>;
  export function authenticatePro(request: Request, opts?: { fresh?: boolean }): Promise<AdminContext>;
  ```
- Rules:
  - `authenticate.admin(request)`, then `checkEntitlement(ctx.admin, ctx.session.shop, { fresh: opts?.fresh ?? false })`. Inactive → `throw ctx.redirect(planPageUrl(ctx.session.shop, appHandle()), { target: '_top' })`. A thrown `PartnerError` propagates to the error boundary.
  - `app.tsx`: `authenticatePro(request, { fresh: url.searchParams.has('plan_handle') })`, then return `{ apiKey }`. Behaviour is unchanged, so `app-gate.test.ts` still passes after its mocks are pointed at `gate.server`'s imports.
  - Each listed action replaces `authenticate.admin(request)` with `authenticatePro(request)` and uses the same destructured fields.

- [ ] **Step 1: Write failing tests** in `gate.test.ts` (mock `../shopify.server` and `../lib/entitlement.server`):
  - Inactive → rejects with a `Response` whose `Location` is the plan page, and `checkEntitlement` was called with `{ fresh: false }`.
  - Active → resolves with the auth context.
  - `checkEntitlement` rejecting → rejects with the same error.
  - Review Focus 4, a static guard: for every `app/routes/app.*.tsx` whose source contains `export const action`, the text from that line to the next `export` contains `authenticatePro(request` and not `authenticate.admin(`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL (the guard lists the five routes).
- [ ] **Step 3:** Implement and swap the calls.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Live check:** run `SetEntitlement` with `"false"` in GraphiQL and set the shop's `entitled` to false in Prisma Studio. Then saving a chart from an open editor tab lands on the plan page and the chart is unchanged. Restore both.
- [ ] **Step 6: Commit** `fix(admin): gate admin actions on the Pro subscription`

### Task 5: Cap the proxy body before reading it (Plan 4 follow-up)

**Files:**
- Modify: `app/lib/events.ts`, `app/lib/events.test.ts`, `app/routes/proxy.e.tsx`, `app/lib/proxy.e.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_EVENT_BYTES = 512;       // parseEvent's own limit uses it too
  export function readCapped(request: Request, max: number): Promise<string | null>;
  ```
- Rules:
  - A `content-length` header that parses to a number over `max` → `null` without touching the body.
  - Otherwise read `request.body` chunk by chunk. Once the running byte total passes `max`, `reader.cancel()` and return `null`. At the end, decode as UTF-8 (`TextDecoder` with `fatal: false`). A null body → `''`.
  - Route: `const body = await readCapped(request, MAX_EVENT_BYTES); const ev = body === null ? null : parseEvent(body);`. The header comment adds `content-length` to what is read.

- [ ] **Step 1: Write failing tests**:
  - `content-length: 100000` with a body stream whose `pull` throws → `null` and `pull` never called.
  - No `content-length` and a 600-byte stream in 100-byte chunks → `null`, and the stream was cancelled before the last chunk.
  - A 100-byte JSON body → the same string.
  - A lying `content-length: 10` with 600 bytes → `null`.
  - Multi-byte UTF-8 is counted in bytes, not characters: 200 × `"é"` (400 B) → string; 300 × `"é"` (600 B) → `null`.
  - Route: a 50 KB body → 204 and no `recordEvent`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(admin): cap app proxy bodies before reading them`

### Task 6: Mandatory privacy compliance webhooks

**Files:**
- Create: `app/lib/shop-data.server.ts`, `app/routes/webhooks.compliance.tsx`, `app/lib/webhooks.compliance.test.ts`
- Modify: `app/routes/webhooks.app.uninstalled.tsx`, `app/lib/webhooks.uninstalled.test.ts`, `shopify.app.toml` (webhooks), `app/lib/app-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // shop-data.server.ts
  export function deleteShopData(db: typeof prisma, shop: string): Promise<void>;   // AssignmentRule, ShopState, EventDaily, EventSizeDaily, Session
  ```
- TOML (added to `[webhooks]`):
  ```toml
    [[webhooks.subscriptions]]
    uri = "/webhooks/compliance"
    compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
  ```
- Rules:
  - `deleteShopData` deletes the five tables' rows `where: { shop }` in one `db.$transaction([...])`. Uninstall calls it instead of its own five `deleteMany`s. Its comment keeps the reason it runs whether or not a session is left.
  - Route `action`: `const { shop, topic } = await authenticate.webhook(request)`. An invalid HMAC throws the library's 401 `Response`, which propagates; Shopify requires a 401 there.
    - `SHOP_REDACT`: if `db.session.count({ where: { shop, isOnline: false } }) > 0`, the shop has reinstalled. Keep its data and log `shop/redact for ${shop} skipped: the app is installed again` (Review Focus 2). Otherwise `deleteShopData`.
    - `CUSTOMERS_DATA_REQUEST` and `CUSTOMERS_REDACT`: the app stores no customer data, so there is nothing to export or delete. Acknowledge with a comment saying so.
    - Any topic → `new Response(null, { status: 200 })`. Logs carry the topic and shop only, never the payload (it holds customer emails and phones).

- [ ] **Step 1: Write failing tests** (mock `authenticate.webhook` and the db):
  - `SHOP_REDACT` with no offline session → `$transaction` called with all five deletes for that shop; 200.
  - `SHOP_REDACT` with an offline session → no deletes; 200.
  - `CUSTOMERS_REDACT` and `CUSTOMERS_DATA_REQUEST` → no db calls; 200; `console.log` arguments don't include the payload's email.
  - `authenticate.webhook` throwing `new Response(null, { status: 401 })` → the action rejects with that 401.
  - Uninstall test updated: `deleteShopData` path deletes the five tables.
  - `app-config.test.ts`: the TOML has a subscription with `uri = "/webhooks/compliance"` and `compliance_topics` holding all three topics.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && shopify app config validate`. Expected: PASS.
- [ ] **Step 5: Live check** (`shopify app dev`, from PowerShell):
  - `shopify app webhook trigger --topic shop/redact --api-version 2026-07 --delivery-method http --address <tunnel>/webhooks/compliance`. Expected: 200 and a "skipped" log line, because the dev store has the app installed. A triggered delivery carries a test shop, not ours, so no rows change.
  - The same for both `customers/*` topics → 200.
  - `curl -X POST <tunnel>/webhooks/compliance -H "Content-Type: application/json" -d "{}"` with no HMAC → 401.
- [ ] **Step 6: Commit** `feat(admin): privacy compliance webhooks; shop/redact deletes shop data`

### Task 7: Detect a renamed app proxy (Plan 4 follow-up)

Merchants can change the proxy prefix and subpath under Settings → Apps → True: Size Chart → App proxy. Beacons to `/apps/tsc/e` then 404 silently, and Analytics shows zero.

**Files:**
- Create: `app/routes/proxy.ping.tsx`, `app/lib/proxy-check.server.ts`, `app/lib/proxy-check.server.test.ts`, `app/components/ProxyBanner.tsx`
- Modify: `prisma/schema.prisma` (+ migration `plan5_proxy_check`), `app/routes/app._index.tsx`, `app/routes/app.analytics.tsx`, `app/lib/app-config.test.ts`

**Interfaces:**
- Prisma, `ShopState` gains `proxyStatus String?` (`ok | moved | unknown`) and `proxyCheckedAt DateTime?`.
- Produces:
  ```ts
  export const PROXY_PATH = '/apps/tsc';
  export const PROXY_TTL_MS = 6 * 3_600_000;
  export type ProxyStatus = 'ok' | 'moved' | 'unknown';
  export function probeProxy(shopDomain: string, fetchImpl?: typeof fetch): Promise<ProxyStatus>;
  export function proxyStatus(shop: string, opts?: { recheck?: boolean; db?: typeof prisma; now?: () => Date; probe?: typeof probeProxy }): Promise<ProxyStatus>;
  // ProxyBanner.tsx
  export function ProxyBanner(props: { status: ProxyStatus }): JSX.Element | null;   // only for 'moved'
  ```
- Rules:
  - `proxy.ping.tsx` `loader`: `await authenticate.public.appProxy(request)`, then `new Response('tsc-ok', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })`. It has no `action`.
  - `probeProxy`: `GET https://${shopDomain}${PROXY_PATH}/ping` with `redirect: 'follow'` and `signal: AbortSignal.timeout(5000)`.
    - Final status 200 with a trimmed body of `tsc-ok` → `ok`.
    - A final URL whose pathname starts with `/password` → `unknown` (Review Focus 3).
    - Final status 404 → `moved`.
    - Anything else, or a throw → `unknown`.
  - `proxyStatus`: return the stored status while `proxyCheckedAt` is younger than `PROXY_TTL_MS` and `recheck` is false. Otherwise probe, store the status and time, and return it.
  - Home and Analytics loaders call `proxyStatus(session.shop, { recheck: url.searchParams.get('proxy') === 'recheck' })`.
  - `ProxyBanner` for `moved`: `<s-banner tone="warning" heading="Finder analytics can't reach the app">` with the text "The app proxy URL for True: Size Chart was changed in your store settings, so finder activity isn't counted. Go to Settings → Apps → True: Size Chart → App proxy and set it back to apps / tsc." It has an `s-link` "Check again" to `?proxy=recheck`.
  - `app-config.test.ts`: TOML `prefix = "apps"` and `subpath = "tsc"` together equal `PROXY_PATH`. `tsc-embed.liquid` contains `"events": "/apps/tsc/e"`.

- [ ] **Step 1: Write failing tests** with a fake fetch returning `{ ok, status, url, text() }`:
  - 200 `tsc-ok` → `ok`; 200 other body → `unknown`; 404 → `moved`; final url `https://s.myshopify.com/password` with 200 → `unknown`; a rejecting fetch → `unknown`.
  - `proxyStatus`: a fresh stored `ok` makes no probe; a stale one probes and stores; `recheck: true` probes even when fresh.
  - The two config guards above.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement; `npx prisma migrate dev --name plan5_proxy_check`.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Live check:**
  - On the unlocked dev store, `/apps/tsc/ping` in the browser shows `tsc-ok`.
  - Home shows no banner.
  - In the dev store admin, change the proxy subpath to `tsc2`, then open `/app?proxy=recheck`. The banner shows. (On a password-protected store the probe sees `/password`; if so, confirm the banner stays hidden, then test `moved` with the store unlocked to visitors, or by temporarily pointing `PROXY_PATH` at a bogus subpath.)
  - Set the subpath back to `tsc`. "Check again" clears the banner.
- [ ] **Step 6: Commit** `feat(admin): warn when the app proxy path was renamed`

### Task 8: Home: published-theme status and recent activity (Plan 3 follow-up, BFS 4.2.3)

`shopify.app.extensions()` reports activation for the store's **published** theme only (App Home API docs). An embed turned on in an unpublished theme shows "To do".

**Files:**
- Modify: `app/lib/onboarding.ts:44-57`, `app/lib/onboarding.test.ts`, `app/lib/analytics.server.ts`, `app/routes/app._index.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function loadTotals(shop: string, days: RangeDays): Promise<Totals>;   // analytics.server.ts, DB only (no listCharts)
  ```
- Rules:
  - Checklist labels: `embed` → "Turn on the app embed in your live theme"; `block` → "Place the size finder button in your live theme". Below the checklist, `s-text color="subdued"`: "Checks your published theme. Changes in a theme you haven't published show here after you publish it."
  - `loadTotals` reads `EventDaily` over `dateRange(localDate(new Date(), timezone), days)` and returns `summarize(rows, [], [], range).totals`, so the rates use the existing formula.
  - Home adds a section "Finder activity, last 7 days" with the three figures from `loadTotals(shop, 7)` and an `s-link` "View analytics" to `/app/analytics`. With zero opens it shows "No finder activity yet. Counts appear after shoppers open the finder."

- [ ] **Step 1: Write failing tests**: the two label strings; `loadTotals` against a mocked `db.eventDaily.findMany` (sum and rates; zero → `null` rates; the `where` uses the 7-day range in the shop's zone).
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Live check (user publishes):**
  - With the embed and block only in the unpublished App Ext. Host theme, Home shows both as To do.
  - Ask the user to enable the embed and add the block in the **published** theme, or to publish the dev theme. Both then show Done after the window regains focus.
  - Disabling the embed in the published theme turns it back to To do.
- [ ] **Step 6: Commit** `feat(admin): published-theme checklist copy and recent finder activity on Home`

### Task 9: Storefront type errors in the loader (Plan 4 follow-up)

`tsc -p packages/storefront/tsconfig.json` reports TS2339 at `loader.ts:40` (`MutationObserver` doesn't exist on `Window`) and TS7006 at `40` and `41`. The root `typecheck` excludes `packages`, so nothing caught it.

**Files:**
- Modify: `packages/storefront/src/loader.ts:17`, `packages/storefront/package.json` (script), `package.json` (`typecheck`)

- Rules:
  - `export function boot(doc: Document, win: Window & typeof globalThis): void`. This is a type-only change: the emitted loader must be byte-identical.
  - Storefront `"typecheck": "tsc -p tsconfig.json"`. Root `typecheck` becomes `react-router typegen && tsc --noEmit && npm run typecheck -w @true-size-chart/storefront`.

- [ ] **Step 1:** `npm run typecheck -w @true-size-chart/storefront` (after adding the script). Expected: FAIL with the three errors above.
- [ ] **Step 2:** Change the signature.
- [ ] **Step 3:** `npm run typecheck && npm run test:storefront && npm run build:storefront && git diff --exit-code extensions/true-size-chart/snippets/tsc-loader.liquid`. Expected: no type errors; 187 storefront tests pass; loader 858 B gz / 1 502 B raw; the snippet is unchanged.
- [ ] **Step 4: Commit** `fix(storefront): type the loader's window; typecheck the storefront package`

### Task 10: Mobile drawer room and the Dawn cart drawer (Plan 3 follow-ups)

At 375×610 the drawer's chrome (header, product card, tabs, progress bar, footer and body padding) leaves about 280 px for step content.

**Files:**
- Modify: `packages/storefront/src/styles/finder.css` (the `@media (max-width: 749px)` block); regenerate `extensions/true-size-chart/assets/tsc-finder.css`
- Test: `packages/storefront/test/build.test.ts` (CSS guard)

- Rules (CSS only; no markup or JS change; the desktop look is unchanged):
  ```
  @media (max-width: 749px):
    .tsc-head        padding 12px 16px 8px
    .tsc-product     margin 0 16px; padding 8px
    .tsc-product img width 32px; height 40px
    .tsc-tabs        margin 12px 16px 0;   [role="tab"] padding 8px 0
    .tsc-progress    margin 12px 16px 0
    .tsc-body        padding 16px
    .tsc-foot        padding 12px 16px calc(12px + env(safe-area-inset-bottom))
    .tsc-back, .tsc-primary  height 48px
  ```
  Target: the step content box (`.tsc-body` clientHeight minus padding) is **≥ 330 px** at 375×610 with the product card shown, against about 280 today. If a screen still overflows, `.tsc-body` scrolls as it does today.

- [ ] **Step 1: Write the failing test** in `build.test.ts`: the built `tsc-finder.css` contains a `max-width:749px` block with `.tsc-body{padding:16px}` and `env(safe-area-inset-bottom)` (match after whitespace removal).
- [ ] **Step 2:** `npm run test:storefront`. Expected: FAIL.
- [ ] **Step 3:** Edit the CSS and `npm run build:storefront`.
- [ ] **Step 4:** `npm run test:storefront && npm run build:storefront`. Expected: PASS; CSS ≤ 4 096 B gz; the loader is unchanged.
- [ ] **Step 5: Live check** (browser pane at 375×610, store unlocked by the user):
  - Open the finder on TSC Test Tee. For each of the 4 steps, run `const b = document.querySelector('true-size-finder').shadowRoot.querySelector('.tsc-body'); b.clientHeight - 32` and record it. Expected: ≥ 330 everywhere.
  - Take screenshots at 375×610 and 1280×800 and **show them to the user for approval** of the design pass before committing.
  - Then the cart drawer (cart type set to Drawer by the user): Find my size → Add to bag. The drawer opens once with the item; clicking the overlay closes it; the cart bubble count went up by 1; the finder is closed.
  - If the overlay doesn't close: follow superpowers:systematic-debugging in `packages/storefront/src/cart.ts`, add a regression test to `test/cart.test.ts`, and fix it within this task.
- [ ] **Step 6: Commit** `fix(storefront): compact mobile drawer chrome` (and `fix(storefront): …` for any cart drawer fix)

### Task 11: Production hosting on Render

**Files:**
- Create: `render.yaml`, `app/routes/healthz.tsx`, `app/lib/healthz.test.ts`
- Modify: `Dockerfile`, `.dockerignore`, `shopify.app.toml` (`name`, `application_url`, `[auth] redirect_urls`), `app/lib/app-config.test.ts`, spec §5 (Hosting: "Render, decided 2026-10-25")

**Interfaces:**
- `render.yaml`:
  ```yaml
  services:
    - type: web
      name: true-size-chart
      runtime: docker
      region: ohio
      plan: starter
      numInstances: 1          # the in-memory RateLimiter assumes one instance
      healthCheckPath: /healthz
      envVars:
        - key: NODE_ENV
          value: production
        - key: SHOPIFY_APP_URL
          value: https://true-size-chart.onrender.com
        - key: SCOPES
          value: write_products,write_metaobjects,write_metaobject_definitions,write_app_proxy
        - key: SHOPIFY_APP_HANDLE
          value: true-size-chart
        - key: DATABASE_URL
          fromDatabase:
            name: true-size-chart-db
            property: connectionString
        - key: SHOPIFY_API_KEY
          sync: false
        - key: SHOPIFY_API_SECRET
          sync: false
        - key: SHOPIFY_PARTNER_ORG_ID
          sync: false
        - key: SHOPIFY_PARTNER_API_ACCESS_TOKEN
          sync: false
        - key: SHOPIFY_APP_GID
          sync: false
  databases:
    - name: true-size-chart-db
      region: ohio
      postgresMajorVersion: "17"
      databaseName: tsc
      user: tsc
      ipAllowList: []          # private network only
  ```
  The plan names are confirmed on the Blueprint sync screen. If Render rejects `starter`, pick the smallest always-on web plan it lists. The database takes the smallest paid plan, never the free one, because free databases expire.
- `Dockerfile` (multi-stage; today's single stage runs `npm ci --omit=dev`, then needs `vite`, a devDependency, to build, and installs before the workspace `packages/*/package.json` files are copied):
  ```dockerfile
  FROM node:22-alpine AS build
  RUN apk add --no-cache openssl
  WORKDIR /app
  COPY . .
  RUN npm ci && npm run build && npm prune --omit=dev

  FROM node:22-alpine
  RUN apk add --no-cache openssl
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=build /app /app
  EXPOSE 3000
  CMD ["npm", "run", "docker-start"]
  ```
  `docker-start` runs `prisma generate && prisma migrate deploy`, then `react-router-serve`, which listens on `PORT` (Render sets it). `.dockerignore` must list `.env`, `.env.*`, `node_modules`, `.shopify`, `build` and `prisma/dev.sqlite*`.
- `healthz.tsx` `loader`: `await db.$queryRaw\`SELECT 1\`` → `200 "ok"`; on any error → `503 "db"`. No auth, no other output.
- TOML:
  - `name = "True: Size Chart"` (App Store 4.1.1: the dashboard name matches the listing).
  - `application_url = "https://true-size-chart.onrender.com"`.
  - `redirect_urls = [ "https://true-size-chart.onrender.com/auth/callback" ]`.
  - `app-config.test.ts`: no `example.com` anywhere in the TOML, and `application_url` starts with `https://` and contains neither "shopify" nor "example".

- [ ] **Step 1: Write failing tests**: `healthz` returns 200 `ok` with a resolving `$queryRaw` mock and 503 with a rejecting one; the TOML guards.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement the files. If Docker is installed, `docker build -t tsc .`. Expected: success; skip if Docker is absent and rely on Render's build log in Step 5.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint && shopify app config validate`. Expected: PASS.
- [ ] **Step 5: Deploy (each bullet needs the user's yes in chat):**
  1. Push the branch, then in Render: New → Blueprint → this repo and branch. Review the plans and prices on the sync screen. The user enters the five `sync: false` secrets.
  2. Wait for the deploy. `https://true-size-chart.onrender.com/healthz` → `ok`. The Render log shows `prisma migrate deploy` applying `0_init` and `plan5_proxy_check`.
  3. Stop `shopify app dev`. From PowerShell, `shopify app deploy` releases the new config (URLs, name, compliance webhooks, scopes).
  4. On the dev store, open the app from Shopify admin: it loads from Render (the network tab shows `true-size-chart.onrender.com`), Home renders, and the Partner check works (`ShopState.entitlementCheckedAt` updates). In the Render log there are no errors, and within 2 h the refresher logs nothing alarming.
  5. The storefront finder still sends events: an open adds to today's count on `/app/analytics`.
  6. `shopify app webhook trigger --topic shop/redact --api-version 2026-07 --delivery-method http --address https://true-size-chart.onrender.com/webhooks/compliance` → 200.
- [ ] **Step 6: Commit** `feat(ops): Render hosting with Postgres; production URLs`

### Task 12: Public landing page and privacy policy

The template's `_index` page asks for a shop domain, which fails App Store requirement 2.3.1 ("must not request the manual entry of a myshopify.com URL"). The listing also needs a privacy policy URL.

**Files:**
- Modify: `app/routes/_index/route.tsx`, `app/routes/_index/styles.module.css`
- Delete: `app/routes/_index/error.server.tsx`
- Create: `app/lib/brand.ts`, `app/routes/privacy.tsx`, `app/lib/public-pages.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // brand.ts
  export const APP_NAME = 'True: Size Chart';
  export const SUPPORT_EMAIL = 'zendolabs@gmail.com';   // Decision 4; change here only
  export const DEVELOPER = 'Zendo Labs';
  ```
- Rules:
  - `_index` keeps the `?shop=` redirect to `/app` and drops the `action`, the `login` import and the form. Content: an `h1` with `APP_NAME`; a tagline "A size finder for your product pages: shoppers get one clear size from their height and weight."; three feature lines (finder, size chart tab, assignment rules); and links to `/privacy` and `mailto:SUPPORT_EMAIL`. It has no prices.
  - `privacy.tsx`: a static page (component with no loader) titled "Privacy policy". Its sections say:
    - What the app stores: the shop domain, access tokens, size charts and rules the merchant creates, the plan status, and anonymous daily counts of finder opens, completions, add-to-bags and recommended sizes.
    - What it never collects: shopper names, emails, IPs, cookies, height, weight or body shape. The measurements stay in the shopper's browser (`localStorage`), and the shopper can clear them with "Clear my data".
    - Where the data lives: Render, in the United States.
    - Retention: everything for a shop is deleted when the app is uninstalled, and again on Shopify's `shop/redact` request.
    - Contact: `SUPPORT_EMAIL`, effective 2026-10-25.

- [ ] **Step 1: Write failing tests** in `public-pages.test.ts`: the `_index/route.tsx` source has no `name="shop"`, no `login` and no `Form`; `renderToString(<PrivacyPolicy />)` contains "never", "localStorage", "uninstalled", "shop/redact" and `SUPPORT_EMAIL`; neither the privacy markup nor the landing route source matches `/\$\s?\d/` (no prices outside Pricing details).
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint`. Expected: PASS. Open `/` and `/privacy` on the dev tunnel; both render without a login form.
- [ ] **Step 5: Commit** `feat(app): public landing page without a shop form; privacy policy`

*(If Task 11 already deployed, redeploy through Render after this commit so `/privacy` is live before Task 13.)*

### Task 13: App Store submission readiness

**Files:**
- Create: `docs/launch/listing.md`, `docs/launch/self-review.md`, `docs/launch/assets/icon.svg`, `docs/launch/assets/icon.html`, `docs/launch/assets/icon-1200.png`, `docs/launch/assets/screens/*.png`
- Modify: whatever the self-review marks ❌ (each fix with its own test, in its own commit)

**Steps:**

- [ ] **Step 1: AI self-review.** Follow the Shopify skill's `app-store-review` topic exactly:
  - Fetch the requirements with `shopify doc fetch --url https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements --output <scratchpad>/review-reqs.md`.
  - Evaluate each requirement against the codebase (one pass per requirement). Skip groups whose "Applies if" signal is absent: payments, purchase options, checkout, sales channel, post-purchase, mobile app builders and donations. Evaluate 5.1 Online store, because the theme extension exists.
  - Write the report to `docs/launch/self-review.md` in the skill's output format.
  - Expected attention points to check by hand: 1.1.1 session tokens (template default), 1.2.2 resubscribe after reinstall (Task 3), 2.3.1 (Task 12), 3.1.1 TLS (Render), 5.1.3 deep links (`theme-links.ts`), 5.1.5 (no customer data collected), and 3.2 scopes (four, all used).
  - Fix every ❌ before moving on. A ⚠️ gets a line in the report saying how it was verified.
- [ ] **Step 2: Built for Shopify, the cheap ones.** Check, and fix if the fix is small (≤ ~30 lines with a test); otherwise list it in `self-review.md` under "Later":
  - 4.1.2 mobile admin at 375 px wide: no horizontal page scroll on Home, Charts, the chart editor, Assignments, Mapping and Analytics.
  - 4.1.3 the app name in the admin nav isn't truncated.
  - 4.1.5 the chart editor uses the contextual save bar (`ui-save-bar` in `app.charts.$handle.tsx`); check the mapping and rules forms too, and that leaving with unsaved changes is blocked.
  - 4.2.3 Home shows extension status and metrics (Task 8).
  - 4.2.4 errors are red, sit by their field and don't auto-dismiss.
  - 2.1 admin Web Vitals are visible in the Partner Dashboard after 100 loads (later; noted).
- [ ] **Step 3: Storefront performance and accessibility on production** (spec §4, §9 M5):
  - `node scripts/perf/lighthouse.mjs` with `--label on` and `--label off` on the published theme, then `--compare off on`. Expected: delta ≤ 3, exit 0. The user toggles the embed and block.
  - Accessibility: in the browser pane, open the finder, inject `axe-core@4.10.2` from cdnjs, and run `axe.run(document.querySelector('true-size-finder').shadowRoot)` on each step and on the size chart tab. Expected: no `serious` or `critical` violations; fix any found with a storefront test.
  - Keyboard pass: Tab reaches every control, the sliders move with the arrows and PageUp/PageDown, ESC closes, focus returns to the button. Also check `prefers-reduced-motion`.
  - Record both medians and the axe summary in `self-review.md`.
- [ ] **Step 4: Listing content** in `docs/launch/listing.md`, ready to paste. Every field must fit the form's character counter and follow Global Constraints "Listing copy":
  - App name: `True: Size Chart`.
  - App card subtitle (draft): "Size finder that turns height and weight into one clear size".
  - App introduction (≤ 100 characters, draft): "Shoppers find their size in two steps and add it to the bag with confidence." (no outcome claims such as fewer returns)
  - App details: what the finder does, the size chart tab, templates, assignment rules, size mapping, analytics, and privacy (measurements stay on the shopper's device). Prose, no prices, no numbers.
  - Feature list (up to the form's limit): the five Pro features.
  - **Pricing details:** plan display name `Pro`. Description: "Everything in True: Size Chart: unlimited size charts, the size finder on product pages, assignment rules, size mapping check and finder analytics." Pricing $9.99 every 30 days or $99 per year, 14-day free trial. This must match the Partner Dashboard plan from Plan 4; check it there.
  - Category (proposed; the user confirms from the form's list): Store design › Product display. Tags that describe a size chart and size finder.
  - Languages: English only (4.3.2). Sales channel requirement: "Merchant must have online store" (4.3.1). Geographic requirements: none.
  - Privacy policy URL: `https://true-size-chart.onrender.com/privacy`. Support: `SUPPORT_EMAIL`.
  - Testing instructions for reviewers: install → plan page → choose Pro (test charge) → onboarding steps 1–4 → enable the embed and add the block through the deep links → open TSC Test Tee → finder → Add to bag → Analytics. Include the demo store URL and its storefront password (the user fills in the password).
  - Screencast script (English, 2–3 min): the same path.
- [ ] **Step 5: Assets.**
  - Icon: a simple monochrome mark (a tape-measure ring around a check) in `icon.svg`, with no text, no Shopify marks and no price. Inside 1200×1200 it keeps a 75 px margin and fills 750–900 px. Render it to `icon-1200.png` by opening `icon.html` (the SVG at 1200×1200) in headless Chrome: `chrome --headless --screenshot=icon-1200.png --window-size=1200,1200 icon.html`. Show the icon to the user for approval.
  - Screenshots: 3–6 unique 1600×900 captures of real UI with no browser chrome (4.4.4, 4.4.5): the finder result on desktop, the finder on mobile, the chart editor with live preview, assignment rules, and Analytics. Each gets alt text in `listing.md`.
  - Feature image: 1600×900, optional.
- [ ] **Step 6: Partner Dashboard (the user, with this plan's inputs):**
  - App icon upload.
  - API contact email = `SUPPORT_EMAIL`.
  - Emergency developer contact (email and phone).
  - Compliance webhooks show as configured (from TOML).
  - Protected customer data: not needed.
  - The listing form filled from `listing.md`.
  - Screencast uploaded.
  - Run the **automated checks** on the submission page. Expected: all pass (embedded app loads, OAuth immediately after install and reinstall, redirect to the app UI, TLS, compliance webhooks reachable, HMAC 401). Fix any failure in a new commit and re-run.
- [ ] **Step 7: Spec.** Spec §9: mark M5 done. Spec §10: record the answers to 2 (name) and 3 (look). Update `self-review.md` with the final summary counts.
- [ ] **Step 8: Commit** `docs(launch): listing, assets and self-review report`. Then stop: the user presses **Submit for review**.

---

## Appendix A: GraphQL operations (validated 2026-10-25)

Admin API 2026-07, unchanged from Plan 4 and reused by Task 3:

```graphql
query ShopContext {
  shop { id myshopifyDomain ianaTimezone }
  currentAppInstallation { id }
}
mutation SetEntitlement($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { namespace key value } userErrors { field message code } }
}
```

Partner API 2026-07 (`partners.shopify.com/{org}/api/2026-07/graphql.json`), unchanged:

```graphql
query ActiveSubscription($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    billingPeriod cancelAtEndOfCycle trialEndsAt
    currentBillingCycle { startTime endTime }
    items { handle }
  }
}
```

Removed in Task 1: `StoreSessions` (`shopifyqlQuery`, needs `read_reports` and Level 2 protected customer data). Tasks 5–8 and 11–12 add no GraphQL: the proxy probe is a plain HTTPS GET to the storefront, and the compliance webhooks use `authenticate.webhook`.

## Not in this plan

- Scaling past one web instance: that needs the refresher as a Render cron job and the rate limiter in Postgres or Redis.
- Event retention and purging beyond uninstall and `shop/redact`: the counters are anonymous, small and per day.
- Letting merchants keep a renamed proxy path (an app-data `tsc.proxy` read by the embed). Task 7 only detects the rename and asks for `apps/tsc`, because no shopper ever sees that URL.
- Size option names in `$app.settings` (Plan 3 note), more storefront languages (v1.1), Plus and AI import (v2).
- Built for Shopify application itself: it needs 50 installs, 5 reviews and 100 admin Web Vitals samples first.
