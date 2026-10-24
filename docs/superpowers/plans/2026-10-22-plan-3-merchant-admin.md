# True: Size Chart — Plan 3: Merchant Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant installs the app, picks garment categories, gets realistic starter charts, assigns them to products by rule, fixes size-label mismatches and switches the storefront on, all in under 5 minutes and without touching theme code.

**Architecture:** The embedded admin (React Router template, Polaris web components, App Bridge) reads and writes `$app:size_chart` metaobjects through Admin GraphQL. Assignment rules live in Prisma; a resolver turns them into the `$app.size_chart` product metafield, kept fresh by a background sync and by `products/create|update` webhooks. Pure logic (chart fields, paste parsing, rule resolution, size mapping, preview document) lives in `app/lib/*.ts` with Vitest tests; Admin I/O lives in `app/lib/*.server.ts`. The live preview is the real storefront bundle in a sandboxed `<iframe srcdoc>`.

**Tech Stack:** TypeScript, React Router 7 (`@shopify/shopify-app-react-router`), Polaris web components (`s-*`), App Bridge (`shopify.app.extensions()`, `shopify.resourcePicker`, `data-save-bar`), Prisma, Vitest, Admin GraphQL.

**Spec:** `docs/superpowers/specs/2026-10-18-true-size-chart-design.md` (§1.3, §2 Merchant admin, §4, §5 Data model, §8, §9 M3). Liquid path: `docs/decisions/0001-liquid-chart-access.md`. Format and storefront contracts: `docs/superpowers/plans/2026-10-19-plan-2-storefront-finder.md`.

**Later plans:** 4 Analytics & App Pricing (events, `EventDaily`, plan gating, "Powered by True") · 5 Launch readiness (Postgres + hosting, privacy webhooks, App Store review).

## Global Constraints

- **No theme code edits.** The admin only deep-links into the theme editor; it never writes theme files and needs no `read_themes` scope (embed/block status comes from App Bridge `shopify.app.extensions()`, which "requires no additional access scopes").
- **Definitions stay in `shopify.app.toml`.** No `metafieldDefinitionCreate` / `metaobjectDefinitionCreate` at runtime. Type strings: metaobject `"$app:size_chart"`, metafield namespace `"$app"`, key `"size_chart"`.
- **Metaobject field keys** (TOML): `name`, `category`, `audience`, `unit`, `basis`, `intended_fit`, `table` (json), `how_to_measure`. `table` = engine `ChartTable` plus optional `aliases` (Task 2).
- **The app owns `$app.size_chart` only when the shop has rules.** A shop with zero rules gets no metafield writes or deletes, ever.
- **Body data never reaches the admin or our DB.** The preview runs the finder inside an iframe with `sandbox="allow-scripts"` (opaque origin, so `localStorage` throws and nothing persists).
- **Storefront budgets still hold** (`npm run build:storefront` fails otherwise): `tsc-finder.js` ≤ 15 360 B gz, CSS ≤ 4 096 B gz, loader ≤ 1 024 B gz / 1 536 B raw.
- **Admin GraphQL** goes through `gql()` (Task 4). Every operation below was validated against Admin API 2026-07 (the version `app/shopify.server.ts` uses); re-validate any new or edited operation with the Shopify skill: `scripts/validate.mjs --api admin --version 2026-07`. Batches: `metafieldsSet` / `metafieldsDelete` ≤ 25 per call. Product pages `first: 25` with `collections(first: 25)` to stay under the 1 000-point query cost.
- **Polaris:** every route's JSX is validated with `scripts/validate.mjs --api polaris-app-home`. Use only `s-*` components the validator accepts (`s-page`, `s-section`, `s-table*`, `s-number-field`, `s-text-field`, `s-text-area`, `s-select`/`s-option`, `s-checkbox`, `s-choice-list`, `s-button`, `s-banner`, `s-badge`, `s-drop-zone`, `s-link`, `s-stack`, `s-grid`, `s-box`, `s-heading`, `s-paragraph`, `s-text`, `s-modal`, `s-spinner`).
- **[my call] SQLite stays for Plan 3.** The spec wants PostgreSQL; the switch lands with hosting in Plan 5. Schemas here use nothing SQLite-specific (no raw SQL, `Json` avoided, strings for enums).
- **[my call] 14 templates, not 16.** Dress and skirt ship women-only; every other category ships `women` and `unisex` (the spec's "men's/unisex").
- **Size labels match after `trim().toLowerCase()`** everywhere (admin and storefront use the same `norm`).
- Windows + PowerShell; never commit `packages/engine/test/__snapshots__/golden.test.ts.snap` CRLF-only noise. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Shop with no rules, or a merchant who set the chart by hand in Shopify admin.** Expect no write or delete of `$app.size_chart`. → Task 5.
2. **Our own metafield write fires `products/update` again.** Expect the second delivery to compare and write nothing (no loop). → Task 5.
3. **A messy spreadsheet paste:** sizes across the top instead of down, `52,5` decimals, ranges `86–90` (en dash) or `86-90`, `34"`, blank cells, `BUST`/`Hips`/`Inside leg` headers. Expect a correct table or one clear error, never a silent wrong column. → Task 3.
4. **Chart text that breaks HTML:** a name or how-to-measure note containing `</script>`, quotes or `&`. Expect the preview to render the text literally. → Task 8.
5. **A chart deleted or resized after assignment:** rules pointing at it, aliases pointing at sizes that no longer exist. Expect rules removed and products cleared by the next sync, and stale aliases dropped on save. → Tasks 3 + 6.

---

## File Structure

```
packages/engine/src/templates/charts.ts     create  TEMPLATE_CHARTS, referenceFor()  (storefront-safe, no copy)
packages/engine/src/templates/copy.ts       create  TEMPLATES (key, name, audience, chart, howToMeasure)  (admin only)
packages/engine/src/templates/tshirt.ts     keep    TSHIRT_UNISEX (re-exported, values unchanged)
packages/engine/src/ease.ts, body.ts        modify  bottoms calibration (Task 1)
packages/engine/src/types.ts                modify  ChartTable.aliases?
packages/storefront/src/model.ts            modify  REFERENCES → referenceFor()
packages/storefront/src/variants.ts         modify  alias-aware size matching
packages/storefront/src/config.ts           modify  FinderConfig.preview?
packages/storefront/src/finder/screens/result.ts  modify  preview add-to-bag
packages/storefront/src/cart.ts, loader.ts  modify  Plan 2 follow-ups (Task 10)
app/lib/chart-model.ts      ChartDraft, fields ↔ draft, validation, unit conversion, handles
app/lib/paste.ts            spreadsheet paste → ChartTable
app/lib/rules.ts            Rule, ProductFacts, resolveChart, planWrites, suggestRules
app/lib/size-mapping.ts     size option values, unmatched values, aliases
app/lib/preview.ts          previewConfig, previewDocument
app/lib/theme-links.ts      theme editor deep links, extension status
app/lib/admin.server.ts     AdminClient, gql(), AdminError
app/lib/charts.server.ts    list/get/save/delete charts (metaobjects)
app/lib/assign.server.ts    syncProducts, requestSync, fetchFacts
app/lib/*.test.ts           Vitest (node)
app/routes/app.tsx                  modify nav
app/routes/app._index.tsx           replace template demo: setup checklist
app/routes/app.onboarding.tsx       3 screens + done
app/routes/app.charts._index.tsx    chart list
app/routes/app.charts.$handle.tsx   editor + live preview
app/routes/app.rules.tsx            assignment rules + sync status
app/routes/app.mapping.tsx          size mapping check
app/routes/webhooks.products.tsx    products/create + products/update
app/routes/webhooks.app.uninstalled.tsx  modify: delete rules + ShopState
app/routes/app.additional.tsx       delete (template demo)
prisma/schema.prisma                AssignmentRule, ShopState
shopify.app.toml                    webhooks; remove template demo definitions
vitest.app.config.ts                root Vitest config for app/lib
```

---

### Task 1: Starter templates and bottoms calibration (engine)

**Files:**
- Create: `packages/engine/src/templates/charts.ts`, `packages/engine/src/templates/copy.ts`, `packages/engine/test/templates.test.ts`
- Modify: `packages/engine/src/ease.ts`, `packages/engine/src/body.ts`, `packages/engine/src/index.ts`, `packages/storefront/src/model.ts`

**Interfaces:**
- Produces:
  ```ts
  // charts.ts
  export type TemplateAudience = 'women' | 'unisex';
  export type TemplateKey = `${Category}-${TemplateAudience}`;
  export const TEMPLATE_CHARTS: Readonly<Partial<Record<TemplateKey, ChartInput>>>;   // 14 entries
  /** women → the women template; men/unisex/null → unisex; falls back to whichever exists. */
  export function referenceFor(category: Category, audience: 'women' | 'men' | 'unisex' | null): ChartInput | undefined;
  // copy.ts
  export interface Template { key: TemplateKey; name: string; category: Category; audience: TemplateAudience; chart: ChartInput; howToMeasure: string }
  export const TEMPLATES: readonly Template[];   // same 14, in CATEGORIES order, women first
  ```
- `BodyEstimate` gains `sex: Sex`. `index.ts` exports `charts.ts` and `copy.ts`.

All templates: `unit: 'cm'`, `intendedFit: 'regular'`, sizes `XS S M L XL XXL`. Values (calibrated against the engine on 2026-10-22):

| key | basis | measurements |
|---|---|---|
| tshirt-women | garment_flat | chest 44 47 50 53 56 59 · length 60 62 64 66 68 70 |
| tshirt-unisex | — | `TSHIRT_UNISEX` unchanged (goldens depend on it) |
| shirt-women | garment_flat | chest 44 47 50 53 56 59 · length 64 66 68 70 72 74 |
| shirt-unisex | garment_flat | chest 50 53 56 59 62 65 · length 72 74 76 78 80 82 |
| hoodie-women | garment_flat | chest 47 50 53 56 59 62 · length 60 62 64 66 68 70 |
| hoodie-unisex | garment_flat | chest 52 55 58 61 64 67 · length 66 68 70 72 74 76 |
| jacket-women | garment_flat | chest 48 51 54 57 60 63 · length 60 62 64 66 68 70 |
| jacket-unisex | garment_flat | chest 54 57 60 63 66 69 · length 68 70 72 74 76 78 |
| dress-women | body | chest 80 84 88 94 100 106 · waist 62 66 70 76 82 88 · hip 88 92 96 102 108 114 |
| pants-women | garment_circ | waist 68 72 76 80 86 92 · hip 92 96 100 104 110 116 · inseam 76 77 78 79 80 81 |
| pants-unisex | garment_circ | waist 76 81 86 91 97 103 · hip 92 97 102 107 113 119 · inseam 80 81 82 83 84 85 |
| shorts-women / shorts-unisex | garment_circ | pants waist + hip of the same audience, no inseam |
| skirt-women | garment_circ | pants-women waist + hip · length 45 46 47 48 49 50 |

Names: `"T-shirt (women)"`, `"T-shirt (unisex)"`, `"Shirt (women)"` … `"Skirt (women)"` (category labels: T-shirt, Shirt, Hoodie & sweatshirt, Jacket, Dress, Pants & jeans, Shorts, Skirt). How-to-measure copy, by basis:
- garment_flat: `"Lay the garment flat. Chest: measure straight across, 2 cm below the armholes. Length: from the highest point of the shoulder to the hem."`
- body: `"Measure your body, not a garment. Bust: around the fullest part. Waist: around the narrowest part. Hips: around the fullest part, feet together."`
- garment_circ: `"Measure all the way around. Waist: along the top of the waistband. Hips: around the fullest part. Inseam: from the crotch seam to the hem."` (skirt: replace the inseam sentence with `"Length: from the top of the waistband to the hem."`)

**Bottoms calibration [my call].** ANSUR measures the waist at the navel, which runs larger than where pants sit; with realistic retail charts the old constants sized a 165 cm / 65 kg woman two sizes up (XL). Change:
- `EASE.bottoms` → `slim { waist: -0.04, hip: -0.02 }`, `regular { waist: -0.02, hip: 0.01 }`, `relaxed { waist: 0.01, hip: 0.05 }`.
- In `targetFor`, for bottoms only, multiply the body waist by `WAISTBAND: Record<Sex, number> = { female: 0.95, male: 1 }` (exported from `ease.ts`).
- Tops, dress and every existing T-shirt golden must not change; if a bottoms golden changes, update it deliberately in the same commit and say so in the message.

- [ ] **Step 1: Write failing tests** in `test/templates.test.ts`. Shoppers: women small 155/48, median 165/65, large 175/95; unisex small 165/58 (male), median 178/80, large 190/110; shape 0, `regular`.
  - `TEMPLATES.length === 14`; keys unique; every `chart` passes `normalizeChart`; `TEMPLATE_CHARTS[t.key] === t.chart`.
  - For every template: median → `M` or `L` with `band !== 'between'`; small → `XS` or `S`; large → `XL` or `XXL`.
  - `pants-unisex`, median male: `slim` → `M`, `relaxed` → `L` (fit preference still moves the answer).
  - `referenceFor('dress', 'men')` → the dress-women chart; `referenceFor('pants', 'women')` → pants-women; `referenceFor('tshirt', null)` → `TSHIRT_UNISEX`.
- [ ] **Step 2:** `npm run test:engine`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `charts.ts`, `copy.ts`, the calibration; switch `packages/storefront/src/model.ts` from `REFERENCES[...]` to `referenceFor(chart.category, config.chart.audience)` (`finalRecommendation` takes the config's audience).
- [ ] **Step 4:** `npm run test:engine && npm run test:storefront && npm run build:storefront`. Expected: PASS, budgets print under their limits (copy.ts must not reach the bundle; check `tsc-finder.js` has no `"Lay the garment flat"`).
- [ ] **Step 5: Commit** `feat(engine): 14 starter templates, referenceFor, bottoms waistband calibration`

### Task 2: Storefront size aliases and preview mode

**Files:**
- Modify: `packages/engine/src/types.ts`, `packages/storefront/src/variants.ts`, `src/config.ts`, `src/strings.ts`, `src/finder/screens/result.ts`
- Test: `packages/storefront/test/variants.test.ts`, `test/result.test.ts`

**Interfaces:**
- `ChartTable` gains `aliases?: Record<string, string>`: key = a variant's size option value normalized (`trim().toLowerCase()`), value = a chart size label. The engine ignores it.
- `FinderConfig` gains `preview?: boolean`. `Strings` gains `previewAdded: "Preview only — nothing was added to a cart."`
- Rules: in `variantForSize`, an option value matches size `s` when `norm(value) === norm(s)` or `norm(aliases[norm(value)] ?? '') === norm(s)`. With `preview: true`, the result screen's add button shows `previewAdded` in its status line and never calls `addToCart`.

- [ ] **Step 1: Write failing tests**
  - Variants `Small/Medium/Large` with `aliases: { small: 'S', medium: 'M', large: 'L' }` → `variantForSize(config, 'M', …)` returns the Medium variant; without aliases → `null`.
  - An alias to a size not in the chart matches nothing.
  - Result screen with `preview: true`: clicking "Add M to bag" leaves `fetch` uncalled and shows `previewAdded`.
- [ ] **Step 2:** `npm run test:storefront`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:storefront && npm run build:storefront`. Expected: PASS, budgets hold.
- [ ] **Step 5: Commit** `feat(storefront): size aliases and an admin preview mode`

### Task 3: Chart model and spreadsheet paste (pure)

**Files:**
- Create: `app/lib/chart-model.ts`, `app/lib/paste.ts`, `app/lib/chart-model.test.ts`, `app/lib/paste.test.ts`, `vitest.app.config.ts`
- Modify: `package.json` (root: `"test:app": "vitest run --config vitest.app.config.ts"`, devDependency `vitest`, dependency `"@true-size-chart/engine": "*"`)

**Interfaces:**
- Consumes: `TEMPLATES`, `Template`, `normalizeChart`, `recommend`, `ChartError`, `ChartInput`, `ChartTable` (engine).
- Produces:
  ```ts
  export type Audience = 'women' | 'men' | 'unisex';
  export interface ChartDraft {
    id: string | null; handle: string | null; name: string; category: Category; audience: Audience;
    unit: 'cm' | 'in'; basis: ChartInput['basis']; intendedFit: ChartInput['intendedFit'];
    table: ChartTable; howToMeasure: string;
  }
  export const norm: (label: string) => string;                      // trim().toLowerCase()
  export function draftFromTemplate(t: Template): ChartDraft;         // id/handle null, deep copy
  export function blankDraft(): ChartDraft;                           // tshirt/unisex/cm/garment_flat/regular, sizes S M L XL, chest + length empty (null)
  export function toFields(d: ChartDraft): { key: string; value: string }[];   // 8 TOML keys; table = JSON.stringify
  export function fromFields(id: string, handle: string, fields: { key: string; value: string | null }[]): ChartDraft;
  export function toChartInput(d: ChartDraft): ChartInput;
  export function validateDraft(d: ChartDraft): { errors: string[]; warnings: string[] };
  export function convertUnit(d: ChartDraft, to: 'cm' | 'in'): ChartDraft;
  export function pruneAliases(table: ChartTable): ChartTable;
  export function newHandle(name: string, now?: number): string;
  // paste.ts
  export type PasteResult = { ok: true; table: ChartTable; ignored: string[] } | { ok: false; error: string };
  export function parsePastedTable(text: string): PasteResult;
  ```
- Rules:
  - `fromFields` never throws: bad `table` JSON → `{ sizes: [], measurements: {} }`; unknown choice values fall back to `blankDraft()`'s.
  - `validateDraft` errors: empty name; no sizes; duplicate sizes after `norm`; any `ChartError` from `normalizeChart(toChartInput(d))` (its message). Warning (not an error) when a dry-run `recommend` of a default profile throws `ChartError`: `"The finder can't score this chart, so shoppers will only see the size chart. Add a chest column (tops/dresses) or a waist column (bottoms)."`
  - `convertUnit` multiplies by 2.54 or divides, rounds to the nearest 0.5, leaves `null`s.
  - `pruneAliases` drops aliases whose value is not a current size (by `norm`); `toFields` always prunes.
  - `newHandle('T-shirt (women)', 1730000000000)` → `'t-shirt-women-' + (1730000000000).toString(36)`; slug = lowercase, non-alphanumerics → `-`, collapsed, trimmed, ≤ 40 chars; empty slug → `'chart'`.
  - `parsePastedTable`: rows split on `\r?\n`, cells on tab, else `;`, else `,` (comma only when no tab/`;` and no cell looks like `52,5`). Header synonyms (case-insensitive, trimmed, trailing `(cm)`/`(in)` ignored): chest|bust|chest width|pit to pit → chest; waist → waist; hip|hips → hip; length|body length|total length → length; inseam|inside leg|inner leg → inseam. Layout: if the first column's cells (below row 1) map to dims, transpose. Values: `52,5` → 52.5; `86-90`/`86–90` → 88; strip `"`, `cm`, `in`; blank → `null`. Unknown columns go to `ignored`. Errors: fewer than 2 rows, no size column, no recognised measurement column.

- [ ] **Step 1: Write failing tests** covering every rule above, including the Review Focus 3 paste set (each with its expected table) and Review Focus 5 (`pruneAliases` with a removed size). Round-trip: `fromFields(id, h, toFields(d))` deep-equals `d` with `id`/`handle` set.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement. `vitest.app.config.ts`: `include: ['app/**/*.test.ts']`, `environment: 'node'`.
- [ ] **Step 4:** `npm run test:app`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): chart draft model and spreadsheet paste parser`

### Task 4: Admin shell, data model and chart storage

**Files:**
- Create: `app/lib/admin.server.ts`, `app/lib/charts.server.ts`, `app/lib/charts.server.test.ts`
- Modify: `prisma/schema.prisma` (+ migration), `shopify.app.toml`, `app/routes/app.tsx`, `app/routes/webhooks.app.uninstalled.tsx`, `vite.config.ts`
- Delete: `app/routes/app.additional.tsx`; TOML `[product.metafields.app.demo_info]` and `[metaobjects.app.example]`

**Interfaces:**
- Produces:
  ```ts
  // admin.server.ts
  export interface AdminClient { graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response> }
  export class AdminError extends Error { constructor(message: string, readonly userErrors?: { field?: string[] | null; message: string }[]) }
  export function gql<T>(admin: AdminClient, query: string, variables?: Record<string, unknown>): Promise<T>;
  // charts.server.ts
  export function listCharts(admin: AdminClient): Promise<ChartDraft[]>;          // all pages, name order
  export function getChart(admin: AdminClient, handle: string): Promise<ChartDraft | null>;
  export function saveChart(admin: AdminClient, d: ChartDraft): Promise<{ ok: true; draft: ChartDraft } | { ok: false; errors: string[] }>;
  export function deleteChart(admin: AdminClient, id: string): Promise<void>;   // metaobject only; Task 6's route also deletes its rules and calls requestSync
  ```
- Prisma:
  ```prisma
  model AssignmentRule {
    id        String   @id @default(cuid())
    shop      String
    chartId   String   // metaobject GID
    type      String   // product | collection | product_type | vendor | tag
    value     String   // GID for product/collection, text otherwise
    label     String   // what the merchant sees (product title, collection title, the text)
    priority  Int
    createdAt DateTime @default(now())
    @@index([shop, priority])
  }
  model ShopState {
    shop            String    @id
    onboardedAt     DateTime?
    sizeOptionNames String    @default("Size")
    syncRequestedAt DateTime?
    syncStartedAt   DateTime?
    syncFinishedAt  DateTime?
    syncError       String?
    syncCounts      String?   // JSON {checked,set,unset}
  }
  ```
- Rules:
  - `gql` throws `AdminError` on top-level `errors`; on an error with `extensions.code === 'THROTTLED'` it waits `1000 × attempt` ms and retries, 3 attempts.
  - `saveChart` runs `validateDraft` first (errors → `{ ok: false }` without a request); new drafts get `newHandle(name)`; maps `userErrors` to `errors`.
  - Operations (validated): `ChartUpsert`, `Charts`, `Chart`, `ChartDelete` — see Appendix A.
  - TOML adds `[[webhooks.subscriptions]] uri = "/webhooks/products"`, `topics = ["products/create", "products/update"]`. Scopes stay `write_products,write_metaobjects,write_metaobject_definitions`.
  - Nav: Home `/app`, Charts `/app/charts`, Assignments `/app/rules`, Size mapping `/app/mapping`.
  - Uninstall deletes the shop's `AssignmentRule` and `ShopState` rows alongside sessions.
  - `vite.config.ts`: `ssr.noExternal: ['@true-size-chart/engine']` (the engine ships TS source).

- [ ] **Step 1: Write failing tests** with a fake `AdminClient` that records calls and returns canned JSON: `saveChart` posts `metaobjectUpsert` with `type: "$app:size_chart"` and the 8 fields; invalid draft → no request; `userErrors` surface; `gql` retries a THROTTLED response then succeeds; `listCharts` follows `endCursor`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement; `npx prisma migrate dev --name plan3_admin`.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`, then `shopify app dev` starts with no config errors and the nav shows the four pages. Expected: PASS / clean start.
- [ ] **Step 5: Commit** `feat(admin): data model, GraphQL client, chart storage, nav`

### Task 5: Assignment rules, sync and product webhooks

**Files:**
- Create: `app/lib/rules.ts`, `app/lib/rules.test.ts`, `app/lib/assign.server.ts`, `app/lib/assign.server.test.ts`, `app/routes/webhooks.products.tsx`

**Interfaces:**
- Consumes: `AdminClient`, `gql` (Task 4).
- Produces:
  ```ts
  // rules.ts
  export type RuleType = 'product' | 'collection' | 'product_type' | 'vendor' | 'tag';
  export interface Rule { id: string; chartId: string; type: RuleType; value: string; priority: number }
  export interface ProductFacts {
    id: string; title: string; productType: string; vendor: string; tags: string[];
    collectionIds: string[]; options: { name: string; values: string[] }[]; chartId: string | null;
  }
  export function resolveChart(p: ProductFacts, rules: Rule[]): string | null;
  export function planWrites(products: ProductFacts[], rules: Rule[]): { set: { ownerId: string; chartId: string }[]; unset: string[] };
  export function suggestRules(charts: { id: string; category: Category }[], productTypes: string[]): { chartId: string; type: 'product_type'; value: string }[];
  // assign.server.ts
  export function toFacts(node: unknown): ProductFacts;
  export function syncProducts(admin: AdminClient, rules: Rule[], opts?: { productId?: string }): Promise<{ checked: number; set: number; unset: number }>;
  export function requestSync(shop: string): Promise<void>;
  ```
- Rules:
  - `resolveChart`: rules by `priority` ascending (ties: input order); first match wins. `product`/`collection` compare GIDs; `product_type`, `vendor`, `tag` compare with `norm`.
  - `planWrites`: empty `rules` → `{ set: [], unset: [] }`. Otherwise `set` when resolved ≠ `chartId`; `unset` when resolved is `null` and `chartId` is not.
  - `suggestRules` keywords (match `norm(productType)` containing the word; `shirt` must not match `t-shirt`): tshirt `t-shirt|tee|tshirt`; shirt `shirt|blouse`; hoodie `hoodie|sweatshirt|sweater`; jacket `jacket|coat`; dress `dress`; pants `pants|jeans|trousers|chinos|leggings`; shorts `shorts`; skirt `skirt`. One suggestion per (chart, product type); with two charts of one category, the first wins.
  - `syncProducts` pages `ProductFacts` (one product with `opts.productId`, via `OneProductFacts`), runs `planWrites`, sends `AssignCharts` / `UnassignCharts` in batches of 25 (`namespace: "$app"`, `key: "size_chart"`, `type: "metaobject_reference"`, `value: chartId`).
  - `requestSync(shop)` sets `syncRequestedAt = now`; if no sync started in the last 10 min is still unfinished, it starts one in the background (not awaited) with `unauthenticated.admin(shop)`, loading rules from Prisma; the loop reruns while `syncRequestedAt > syncStartedAt`, then writes `syncFinishedAt`, `syncCounts`, or `syncError`.
  - Webhook route: `authenticate.webhook`; skip when the shop has no rules; else `syncProducts(admin, rules, { productId: payload.admin_graphql_api_id })`; always `200`.

- [ ] **Step 1: Write failing tests**: priority order; tag/type/vendor case-insensitive; collection by GID; Review Focus 1 (no rules → nothing, even when `chartId` is set); unset when no rule matches; Review Focus 2 (`syncProducts` for a product whose metafield already equals the resolved chart sends no mutation); 60 changed products → 3 `metafieldsSet` calls (25/25/10); `suggestRules(['T-Shirts','Shirts','Denim Jeans'])` maps to tshirt, shirt, pants.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): assignment rules, product sync and product webhooks`

### Task 6: Charts list, assignments page

**Files:**
- Create: `app/routes/app.charts._index.tsx`, `app/routes/app.rules.tsx`

**Interfaces:**
- Consumes: `listCharts`, `deleteChart`, `saveChart`, `draftFromTemplate`, `TEMPLATES`, `requestSync`, Prisma `AssignmentRule`/`ShopState`.
- Charts page: `s-table` of charts (name, category, audience, sizes, products using it via `referencedBy`), "New chart" (blank) and "Add from template" (`s-modal` listing `TEMPLATES`, creates via `saveChart`, navigates to the editor), delete with a confirm `s-modal` stating how many rules go with it; the delete action calls `deleteChart`, deletes that chart's `AssignmentRule` rows, then `requestSync(shop)`.
- Assignments page: rules table in priority order (chart, type, label, ↑/↓ reorder, delete); "Add rule": chart `s-select`, type `s-select`; product/collection values come from `shopify.resourcePicker({ type, multiple: true })` (one rule per pick, label = title); text types use `s-text-field`; product types offer the `ProductTypes` query result. Every change calls `requestSync`. A status line from `ShopState`: "Syncing…" / "Last synced {time}: {set} assigned, {unset} cleared" / the error with a "Sync now" button. The loader revalidates every 3 s while a sync runs.

- [ ] **Step 1:** Build both routes; validate their JSX with `validate.mjs --api polaris-app-home`.
- [ ] **Step 2:** `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 3: Live check** (`shopify app dev`, dev store): add a "T-shirt (unisex)" chart; rule `product_type = <TSC Test Tee's type>` (set a type on the product first if empty); status reaches "Last synced"; the product's metafield points at the new chart (Admin → product → Metafields). Delete the rule → after sync the metafield is cleared. Delete a chart with a rule → the rule is gone.
- [ ] **Step 4: Commit** `feat(admin): charts list and assignment rules UI`

### Task 7: Chart editor

**Files:**
- Create: `app/routes/app.charts.$handle.tsx`

**Interfaces:**
- Consumes: `getChart`, `saveChart`, `blankDraft`, `draftFromTemplate`, `validateDraft`, `convertUnit`, `parsePastedTable`, Task 8's `<ChartPreview>`.
- `$handle = "new"` → `blankDraft()`, or `draftFromTemplate` when `?template=<key>`.
- Layout: `s-page` with the name as heading; two columns at ≥ 1000 px (editor | preview), stacked below. Editor sections:
  1. Details: name, category, audience, intended fit, "Measured as" (Garment, flat / Garment, all the way around / Body), unit (cm/in, switching runs `convertUnit`).
  2. Measurements: `s-table` with a size column (`s-text-field`) and one `s-number-field` column per dim present; add/remove size rows and dim columns (dims not present offered in an "Add measurement" `s-select`); "Paste from spreadsheet" opens an `s-modal` with an `s-text-area`; a successful parse replaces the table and lists `ignored` columns; an error shows in an `s-banner`.
  3. How to measure: `s-text-area`.
- The form uses App Bridge's contextual save bar (`<form data-save-bar>`); Save posts the draft JSON; errors from `validateDraft`/`saveChart` show in an `s-banner tone="critical"`, warnings in `tone="warning"`. A new chart redirects to its handle after the first save.

- [ ] **Step 1:** Build the route; validate JSX with `validate.mjs --api polaris-app-home`.
- [ ] **Step 2:** `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 3: Live check:** create from the pants-women template, switch to inches and back (values return within 0.5), paste a 3-column TSV from a spreadsheet, save, reload: values persist; the storefront finder for an assigned product reflects the edit after a page reload.
- [ ] **Step 4: Commit** `feat(admin): chart editor with paste and unit switch`

### Task 8: Live preview

**Files:**
- Create: `app/lib/preview.ts`, `app/lib/preview.test.ts`, `app/components/ChartPreview.tsx`

**Interfaces:**
- Consumes: `FinderConfig` (`import type` from `packages/storefront/src/config`), `ChartDraft`.
- Produces:
  ```ts
  export function previewConfig(d: ChartDraft, assets: { js: string; css: string }): FinderConfig;
  export function previewDocument(config: FinderConfig): string;
  export function ChartPreview(props: { draft: ChartDraft }): JSX.Element;
  ```
- Rules:
  - `previewConfig`: `chart.key = d.handle ?? 'preview'`; product `{ title: 'Preview product', image: null, price: '' }`; one available variant per size (ids 1…n, `options: [size]`), `sizeOptionIndex: 0`, `selectedVariantId: 1`; `routes: { cartAdd: '/cart/add', cart: '/cart' }`; `settings: { font: 'editorial', accent: '#111111', radius: 0 }`; `strings: {}`; `preview: true`.
  - `previewDocument`: full HTML with `<script type="application/json" id="tsc-config">` whose JSON has `<`, `>`, `&`, U+2028, U+2029 escaped as `\uXXXX`; `<script src="{assets.js}">`; a "Find my size" button with `data-tsc-open`; an inline script that, once `true-size-finder` is defined, appends one and calls `open()`, and reopens it on button click.
  - Assets: `import js from '../../extensions/true-size-chart/assets/tsc-finder.js?url'` (and `.css?url`), so Vite serves the committed bundle.
  - `ChartPreview`: an `<iframe sandbox="allow-scripts" srcDoc={...}>`, rebuilt 400 ms after the last draft change, with a Desktop / Mobile toggle (iframe width 100% / 375 px, height 640 px). An invalid draft shows `"Fix the errors to see the preview."` instead.

- [ ] **Step 1: Write failing tests**: Review Focus 4 (a name `</script><b>"x" & y</b>` round-trips: `JSON.parse` of the config element's text, read from the parsed document, gives the exact name; the document contains no literal `</script><b>`); variants follow the sizes; `preview: true`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement; mount `<ChartPreview>` in the editor.
- [ ] **Step 4:** `npm run test:app && npm run typecheck`, then live: editing a chest value changes the preview's recommendation for the same answers; Add to bag shows the preview note.
- [ ] **Step 5: Commit** `feat(admin): live finder preview in a sandboxed iframe`

### Task 9: Size mapping check, onboarding and home

**Files:**
- Create: `app/lib/size-mapping.ts`, `app/lib/size-mapping.test.ts`, `app/lib/theme-links.ts`, `app/lib/theme-links.test.ts`, `app/routes/app.mapping.tsx`, `app/routes/app.onboarding.tsx`
- Modify: `app/routes/app._index.tsx`

**Interfaces:**
- Produces:
  ```ts
  // size-mapping.ts
  export function sizeOptionValues(p: ProductFacts, sizeOptionNames: string[]): string[] | null;  // first option whose norm(name) is listed
  export function unmatchedValues(values: string[], sizes: string[], aliases?: Record<string, string>): string[];
  export interface MappingIssue { productId: string; productTitle: string; chartId: string; unmatched: string[]; noSizeOption: boolean }
  export function mappingIssues(products: ProductFacts[], charts: Map<string, ChartDraft>, sizeOptionNames: string[]): MappingIssue[];
  // theme-links.ts
  export function themeEditorLinks(shopDomain: string, apiKey: string): { embed: string; block: string };
  export type ExtensionStatus = { embed: 'active' | 'available' | 'unknown'; block: 'active' | 'available' | 'unknown' };
  export function extensionStatus(extensions: unknown): ExtensionStatus;
  ```
- Rules:
  - `themeEditorLinks`: embed `https://{shop}/admin/themes/current/editor?context=apps&activateAppId={apiKey}/tsc-embed`; block `https://{shop}/admin/themes/current/editor?template=product&addAppBlockId={apiKey}/tsc-button&target=mainSection`. Open with `target="_top"`.
  - `extensionStatus` reads `shopify.app.extensions()`'s result: the `theme_app_extension` whose activations include handle `tsc-embed` / `tsc-button`, using their `status`; anything malformed → `'unknown'`.
  - Mapping page: loads products with a chart (`ProductFacts` pages filtered to `chartId != null`), `mappingIssues` grouped by chart. For each unmatched value an `s-select` of the chart's sizes; "Save mapping" writes `aliases` (keys `norm(value)`) into that chart with `saveChart`. Products without a size option show `"No option named {names}"`. The size option names field (`ShopState.sizeOptionNames`, comma-separated) sits at the top with the note `"Use the same names as the app embed's Size option names setting."`
  - Onboarding (`?step=1|2|3`), shown from Home until `ShopState.onboardedAt` is set:
    1. *What do you sell?* `s-checkbox` grid of `TEMPLATES` grouped by category. Continue creates the picked charts (`saveChart` each; skip a template already created in this flow).
    2. *Review your charts:* the created charts with sizes and an Edit link (opens the editor; returning keeps the step).
    3. *Assign them:* `suggestRules` against the `ProductTypes` query, each as a pre-ticked `s-checkbox`; Continue saves the ticked rules (priority = order) and calls `requestSync`; "Skip" is allowed.
    4. *Turn it on:* embed and block status from `extensionStatus` with the two deep links, re-checked when the window regains focus; "Finish" sets `onboardedAt`.
  - Home: a setup checklist (embed on, button placed, charts > 0, rules > 0, mapping issues = 0, each linking to its fix) and the sync status line.

- [ ] **Step 1: Write failing tests**: `unmatchedValues(['Small','M','XL '], ['S','M','XL'], { small: 'S' })` → `[]`; without aliases → `['Small']`; `sizeOptionValues` matches `"size "` against `"Size"`; no size option → `null` and `noSizeOption: true`; `themeEditorLinks('x.myshopify.com', 'abc')` equals the exact URLs above; `extensionStatus` for an `active` embed and `available` block, and for `null`.
- [ ] **Step 2:** `npm run test:app`. Expected: FAIL.
- [ ] **Step 3:** Implement the libs and routes; validate JSX with `validate.mjs --api polaris-app-home`.
- [ ] **Step 4:** `npm run test:app && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Live check** on the dev store: reset `onboardedAt` (`npx prisma studio`), run onboarding end to end in under 5 minutes; give TSC Test Tee a variant value `Small`, see it on the mapping page, map it to `S`, and confirm the storefront finder now adds the `Small` variant for an S recommendation; the embed status turns active after enabling it through the deep link.
- [ ] **Step 6: Commit** `feat(admin): size mapping check, onboarding and setup checklist`

### Task 10: Plan 2 follow-ups (storefront)

**Files:**
- Modify: `packages/storefront/src/cart.ts`, `packages/storefront/src/loader.ts`
- Test: `test/cart.test.ts`, `test/loader.test.ts`

- Rules:
  - Cart drawer: when `<cart-drawer>` exists and has a `renderContents` function, call `drawer.renderContents(body)` (Dawn rebinds the overlay listener and opens itself) instead of swapping `#CartDrawer`; keep the swap as the fallback. Dawn's `renderContents` opens the drawer, so the finder must not open it a second time.
  - Remembered size: besides `shopify:section:load`, repaint when a new `[data-tsc-open]` element is added under `document.body` (one `MutationObserver`, `childList` + `subtree`, callback only checks added element nodes). The loader must stay ≤ 1 024 B gz / 1 536 B raw.

- [ ] **Step 1: Write failing tests**: a fake `cart-drawer` with `renderContents` receives the parsed body and `#CartDrawer` innerHTML is untouched; without it the old swap runs; a button appended after boot gets the remembered label.
- [ ] **Step 2:** `npm run test:storefront`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:storefront && npm run build:storefront`. Expected: PASS, budgets hold. Live: after an add, clicking the drawer overlay closes it.
- [ ] **Step 5: Commit** `fix(storefront): use Dawn's renderContents; repaint remembered size on re-rendered buttons`

---

## Appendix A: Admin GraphQL operations (validated, Admin API 2026-07)

```graphql
mutation ChartUpsert($handle: String!, $fields: [MetaobjectFieldInput!]!) {
  metaobjectUpsert(handle: { type: "$app:size_chart", handle: $handle }, metaobject: { fields: $fields }) {
    metaobject { id handle updatedAt }
    userErrors { field message code }
  }
}
query Charts($after: String) {
  metaobjects(type: "$app:size_chart", first: 50, after: $after) {
    nodes { id handle updatedAt fields { key value } referencedBy(first: 1) { nodes { referencer { ... on Product { id } } } } }
    pageInfo { hasNextPage endCursor }
  }
}
query Chart($handle: String!) {
  metaobjectByHandle(handle: { type: "$app:size_chart", handle: $handle }) { id handle fields { key value } }
}
mutation ChartDelete($id: ID!) {
  metaobjectDelete(id: $id) { deletedId userErrors { field message code } }
}
mutation AssignCharts($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { ownerType key } userErrors { field message code } }
}
mutation UnassignCharts($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) { deletedMetafields { ownerId key } userErrors { field message } }
}
query ProductFacts($after: String) {
  products(first: 25, after: $after) {
    nodes {
      id title productType vendor tags
      collections(first: 25) { nodes { id } }
      options { name optionValues { name } }
      sizeChart: metafield(namespace: "$app", key: "size_chart") { value }
    }
    pageInfo { hasNextPage endCursor }
  }
}
query OneProductFacts($id: ID!) {
  product(id: $id) {
    id title productType vendor tags
    collections(first: 25) { nodes { id } }
    options { name optionValues { name } }
    sizeChart: metafield(namespace: "$app", key: "size_chart") { value }
  }
}
query ProductTypes { productTypes(first: 250) { nodes } }
```

The Charts list's product count uses `referencedBy(first: 1)` only to say "in use"; an exact count is Plan 4 territory.

## Not in this plan

- Mobile drawer chrome leaving ~280 px for step content at 375×610 (needs a design pass; Plan 5).
- Moving size option names into the app-installation metafield `$app.settings` (spec §5) so the embed and the mapping check share one setting; needs a Liquid spike first. Until then the mapping page keeps its own copy (Task 9).
- The empty gap the block reserves with the embed off (by design).
