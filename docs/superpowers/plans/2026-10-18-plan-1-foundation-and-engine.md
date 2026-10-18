# True: Size Chart — Plan 1: Foundation & Recommendation Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scaffolded Shopify app with the size-chart data definitions deployed, a proven Liquid path from product → chart, and a tested, framework-free recommendation engine.

**Architecture:** The Shopify React Router app template sits at the repo root, plus an npm workspace package `packages/engine` (pure TypeScript, no DOM, no network) that later plans bundle into the storefront finder and the admin preview. Chart data lives in an app-owned metaobject referenced by a product metafield, declared in `shopify.app.toml`.

**Tech Stack:** Shopify CLI, React Router app template (TypeScript), Prisma (template default), theme app extension (Liquid), TypeScript, Vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-10-18-true-size-chart-design.md` (sections 5, 6 and 9 M0–M1)

**Later plans (written after this one lands):** 2 Storefront finder · 3 Merchant admin · 4 Analytics & Shopify App Pricing · 5 Launch readiness.

## Global Constraints

- Metafield/metaobject definitions go in `shopify.app.toml` only. Access them as `type: "$app:size_chart"` / `namespace: "$app"`. Never use `namespace: "app"`, and never create definitions with runtime GraphQL.
- Validate every Shopify GraphQL operation and Liquid file with the Shopify skill's `scripts/validate.mjs` (topic `admin` / `liquid`, `--context app`) before committing it.
- The engine is pure TS: no DOM, no `fetch`, no `localStorage`, no dependencies. Body data never leaves the device.
- Internal units: centimetres, kilograms, **circumference** for girth dimensions.
- Engine bundle (minified + gzip) ≤ **6 KB**, inside the storefront budget of ≤ 15 KB gz (spec §5).
- Node version: whatever the template's `package.json` `engines` field requires.
- Scaffold with Shopify CLI (`shopify app init`, `shopify app generate extension`). Never hand-write scaffold files.

## Review Focus

1. **Shopper outside the chart's range** (e.g. 186 cm / 150 kg against S–XL). Expect the largest size with `outOfRange: "above"` and band `"between"`, not a confident 92%. → Task 6.
2. **Chart with gaps** (only chest given, or `null` for some sizes). Expect a recommendation from the dimensions that exist, weights renormalized, and no `NaN` anywhere in the result. → Task 6.
3. **Inch and flat-measured charts.** Expect results identical to the equivalent cm-circumference chart. → Task 4 + Task 6.
4. **Imperial shopper input** (6 ft 1 in, 200 lbs). Expect exact conversions and a round trip back to the same ft/in. → Task 4.
5. **One-size or two-size charts.** Expect that size, with `runnerUp` null or present and no index errors. → Task 6.

---

### Task 1: Repo and app scaffold

**Files:**
- Create: repo root `D:\True Size Chart` (git), the Shopify app files from the template, `.gitignore` additions
- Modify: root `package.json` (add `"workspaces": ["packages/*"]`)

- [ ] **Step 1:** In `D:\True Size Chart`, run `git init`. Then run `shopify app init`, choosing the React Router template with TypeScript and naming the app `true-size-chart`. The user signs in to their Partner account when prompted (interactive, so the user does this step).
- [ ] **Step 2:** Move the generated `true-size-chart/` contents up into the repo root so that `shopify.app.toml` is at `D:\True Size Chart\shopify.app.toml`. Keep the existing `docs/`.
- [ ] **Step 3:** Add `"workspaces": ["packages/*"]` to the root `package.json`, then run `npm install`. Expected: exit 0.
- [ ] **Step 4:** Run `shopify app dev` and install the app on a dev store (create one with `shopify store create dev` if needed). Expected: the embedded app home loads in the dev store admin.
- [ ] **Step 5: Commit** `chore: scaffold Shopify React Router app`

### Task 2: Size-chart data definitions and dev seed

**Files:**
- Modify: `shopify.app.toml` (scopes + definitions)
- Create: `scripts/dev/seed-chart.graphql`, `scripts/dev/README.md`

**Interfaces:**
- Produces: metaobject type `$app:size_chart` with fields `name, category, audience, unit, basis, intended_fit, table (json), how_to_measure`; product metafield `$app.size_chart` (`metaobject_reference<$app:size_chart>`); app-installation metafield `$app.settings` (json). `table` JSON shape = `ChartTable` from Task 4.

- [ ] **Step 1:** Set `[access_scopes] scopes = "read_products,write_products"`. Add the definitions exactly as listed in spec §5 "Data model": `access.storefront = "public_read"` and `access.admin = "merchant_read_write"` on the metaobject, and `name` required. Validate the TOML using the shopify skill's `use-shopify-cli` topic.
- [ ] **Step 2:** Run `shopify app deploy`. Expected: the definitions are created, with no errors.
- [ ] **Step 3:** Write `seed-chart.graphql`:
  - a `metaobjectUpsert` with handle `dev-tshirt-unisex`, values equal to the T-shirt template from Task 7 (S–XL subset, `unit: "cm"`, `basis: "garment_flat"`, `intended_fit: "regular"`);
  - a `metafieldsSet` linking it to one dev-store product (key `size_chart`, namespace omitted).

  Validate both with `validate.mjs --api admin`. Document in `scripts/dev/README.md` how to run them (`shopify store execute`; check `--help` for the flags).
- [ ] **Step 4:** Run the seed. Expected: reading `product { chart: metafield(key: "size_chart") { reference { ... on Metaobject { handle } } } }` returns `dev-tshirt-unisex`.
- [ ] **Step 5: Commit** `feat: declare size chart metaobject and product metafield`

### Task 3: Liquid access spike (decision gate)

**Files:**
- Create: `extensions/true-size-chart/` (via `shopify app generate extension` → Theme app extension), `extensions/true-size-chart/blocks/tsc-embed.liquid` (app embed, `"target": "body"`), `docs/decisions/0001-liquid-chart-access.md`
- Delete: the generated sample block/snippet/assets

**Interfaces:**
- Produces: a confirmed Liquid expression for reading the product's chart fields and `table` JSON, recorded in the ADR. Plan 2 builds the storefront on it.

- [ ] **Step 1:** Generate the extension. Write `tsc-embed.liquid` so that on product templates it outputs `<script type="application/json" id="tsc-config">` holding the chart's `name`, `category`, `unit`, `basis`, `intended_fit` and `table`, serialized with `| json`. It outputs nothing when the product has no chart. Find the app-owned access path with `search_docs.mjs --api liquid` ("app-owned metafields theme app extension"). Validate with `validate.mjs --api liquid --filetype block --context app`.
- [ ] **Step 2:** Run `shopify app dev`, enable the embed in the theme editor, and open the seeded product. Expected: `JSON.parse(document.getElementById('tsc-config').textContent).table.sizes` equals `["S","M","L","XL"]`. A product without a chart has no `#tsc-config`.
- [ ] **Step 3:** Record the working expression in ADR 0001. **If the metaobject reference does not resolve**, record that and switch to the spec's fallback: replace the product metafield with type `json`, holding the full chart. Update Task 2's TOML and seed, then repeat Step 2.
- [ ] **Step 4: Commit** `spike: prove Liquid access to app-owned size chart`

### Task 4: Engine package — types, units, chart normalization

**Files:**
- Create: `packages/engine/package.json` (name `@true-size-chart/engine`, `"type": "module"`, scripts `test`=`vitest run`, `build`), `tsconfig.json`, `src/types.ts`, `src/units.ts`, `src/chart.ts`, `src/index.ts`
- Test: `packages/engine/test/units.test.ts`, `test/chart.test.ts`

**Interfaces:**
- Produces (`src/types.ts`):
  ```ts
  export type Sex = 'female' | 'male';
  export type ShapeStep = -1 | 0 | 1;
  export type FitPref = 'slim' | 'regular' | 'relaxed';
  export type Category = 'tshirt'|'shirt'|'hoodie'|'jacket'|'dress'|'pants'|'shorts'|'skirt';
  export type Dim = 'chest' | 'waist' | 'hip' | 'length' | 'inseam';
  export interface ChartTable { sizes: string[]; measurements: Partial<Record<Dim, (number | null)[]>> }
  export interface ChartInput extends ChartTable {
    unit: 'cm' | 'in'; basis: 'garment_flat' | 'garment_circ' | 'body';
    category: Category; intendedFit: 'slim' | 'regular' | 'oversized';
  }
  export interface NormalizedChart { sizes: string[]; measurements: Partial<Record<Dim, (number | null)[]>>;
    basis: 'garment' | 'body'; category: Category; intendedFit: ChartInput['intendedFit'] }
  export interface ShopperProfile { sex: Sex; heightCm: number; weightKg: number;
    shape: { chest: ShapeStep; stomach: ShapeStep; hips: ShapeStep }; fitPref: FitPref }
  export class ChartError extends Error {}
  ```
- Produces (`src/units.ts`): `ftInToCm(ft: number, inch: number): number`, `cmToFtIn(cm: number): { ft: number; inch: number }` (inch rounded to the nearest whole, 12 carries into ft), `lbsToKg(lbs: number): number`, `kgToLbs(kg: number): number` (factor 0.45359237).
- Produces (`src/chart.ts`): `normalizeChart(chart: ChartInput): NormalizedChart`. It converts in→cm (×2.54), doubles `chest|waist|hip` when `garment_flat` (never `length|inseam`), and maps the basis to `garment|body`.

- [ ] **Step 1: Write failing tests**
  - `ftInToCm(6, 1)` ≈ 185.42 (`toBeCloseTo(185.42, 2)`); `cmToFtIn(185.42)` → `{ft:6, inch:1}`; `cmToFtIn(182.8)` → `{ft:6, inch:0}` (71.97 in rounds to 72); `lbsToKg(200)` ≈ 90.718.
  - `normalizeChart` on `{unit:'in', basis:'garment_flat', measurements:{chest:[20], length:[28]}}` → chest `[101.6]`, length `[71.12]`.
  - It throws `ChartError` when `sizes` is empty or any measurement array length ≠ `sizes.length`; `null` entries are preserved.
- [ ] **Step 2:** Run `npm test -w @true-size-chart/engine`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `types.ts`, `units.ts`, `chart.ts`, and re-export them from `index.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): types, unit conversion, chart normalization`

### Task 5: Body estimator fitted on ANSUR II

**Files:**
- Create: `packages/engine/scripts/fetch-ansur.mjs`, `scripts/fit-ansur.ts`, `src/ols.ts`, `src/coefficients.ts` (generated, committed), `src/body.ts`
- Modify: `.gitignore` (`packages/engine/data/`)
- Test: `test/ols.test.ts`, `test/body.test.ts`

**Interfaces:**
- Produces: `ols(X: number[][], y: number[]): { beta: number[]; r2: number }` (normal equations + Gaussian elimination with partial pivoting; X already includes the intercept column).
- Produces: `estimateBody(p: ShopperProfile): BodyEstimate` with `interface BodyEstimate { chest: number; waist: number; hip: number; inseam: number; heightCm: number }` (cm).
- `coefficients.ts` exports `COEFFS: Record<Sex, Record<'chest'|'waist'|'hip'|'inseam', { a: number; b: number; c: number; d: number; r2: number; n: number }>>`, where girth = a + b·heightCm + c·weightKg + d·BMI.

- [ ] **Step 1:** Write the failing `ols.test.ts`. On 50 synthetic rows from y = 3 + 2·x1 − 0.5·x2 (no noise), beta ≈ [3, 2, −0.5] to 6 dp and r2 = 1.
- [ ] **Step 2:** Run it and confirm FAIL. Implement `ols.ts`. Run it and confirm PASS.
- [ ] **Step 3:** `fetch-ansur.mjs` downloads the public-domain ANSUR II male and female CSVs (Open Design Lab, Penn State; confirm the current URL) into `packages/engine/data/`. `fit-ansur.ts` reads them and converts the units: `stature`, `chestcircumference`, `waistcircumference`, `buttockcircumference` (→ hip) and `crotchheight` (→ inseam) are mm→cm, and `weightkg` is kg×10 → kg. **Check the header names and units against the file before trusting them.** It then fits each sex×dimension and writes `coefficients.ts` with r2 and n. Run it. Expected: every r2 ≥ 0.75 for girths and ≥ 0.6 for inseam; otherwise stop and report.
- [ ] **Step 4:** Write the failing `body.test.ts`:
  - male 180 cm / 89 kg → chest in [100, 115], waist in [88, 105];
  - female 165 / 60 → hip in [92, 104];
  - chest rises strictly with weight at fixed height (60→100 kg);
  - `shape.chest = 1` multiplies chest by exactly 1.05, and `-1` by 0.95; `stomach` acts on waist and `hips` on hip.
- [ ] **Step 5:** Implement `body.ts`. Run the tests. Expected: PASS.
- [ ] **Step 6: Commit** `feat(engine): body estimate from height/weight fitted on ANSUR II`

### Task 6: Targets, scoring and `recommend`

**Files:**
- Create: `packages/engine/src/ease.ts`, `src/score.ts`, `src/recommend.ts`
- Test: `test/score.test.ts`, `test/recommend.test.ts`

**Interfaces:**
- Consumes: `normalizeChart` (Task 4), `estimateBody` (Task 5).
- Produces:
  ```ts
  export interface AreaFit { dim: Dim; delta: number; label: 'snug' | 'ideal' | 'roomy'; position: number } // position −1..1
  export interface SizeScore { size: string; error: number; areas: AreaFit[] }
  export interface Recommendation { size: string; runnerUp: string | null; fitMatch: number;
    band: 'confident' | 'good' | 'between'; areas: AreaFit[]; scores: SizeScore[];
    fitNote: 'true_to_size' | 'runs_small' | 'runs_large'; outOfRange: null | 'below' | 'above' }
  export function targetFor(body: BodyEstimate, chart: NormalizedChart, fit: FitPref): Partial<Record<Dim, number>>;
  export function scoreSizes(chart: NormalizedChart, target: Partial<Record<Dim, number>>, fit: FitPref): SizeScore[];
  export function recommend(profile: ShopperProfile, chart: ChartInput, opts?: { reference?: ChartInput }): Recommendation;
  ```
- Values (spec §6, **[my call]** where the spec gives examples). Ease = `EASE[group][fit][dim] + INTENDED[intendedFit]`, applied to girths only:
  - tops (`tshirt, shirt, hoodie, jacket, dress`): chest slim .06 / regular .12 / relaxed .20; waist and hip slim .08 / regular .16 / relaxed .26. `hoodie, jacket` add +.06.
  - bottoms (`pants, shorts, skirt`): waist slim .00 / regular .02 / relaxed .05; hip .04 / .08 / .14.
  - `INTENDED`: slim −.04, regular 0, oversized +.10. Body-basis charts use ease 0 and INTENDED 0.
  - Length targets: tops length = heightCm × `LENGTH_RATIO` (tshirt .40, shirt .42, hoodie .40, jacket .42; dress has no length); pants inseam = body.inseam; shorts/skirt have no length dimension.
  - Weights: tops chest .5 / waist .3 / length .2 (hip replaces waist for dress: chest .5 / hip .5). Bottoms waist .5 / hip .35 / inseam .15. Renormalize over the dimensions present in both target and chart (non-null for that size).
  - δ = (garment − target)/target; error = Σ w·|δ|, with |δ| ×1.5 when δ < −.04. Labels: snug < −.03, ideal ±.03, roomy > .03; position = clamp(δ/.10, −1, 1).
  - Best = minimum error. On an exact tie, pick the larger size for `relaxed` and the smaller otherwise. runnerUp = second-lowest error. fitMatch = clamp(round(100 − 350·error), 55, 98). Band: ≥85 confident, 70–84 good, otherwise between.
  - outOfRange: the best size is the last one and its primary-dim δ < −.04 → `'above'`; the best size is the first one and its primary-dim δ > .10 → `'below'`. When outOfRange is set, the band is forced to `'between'`. (Primary dim = chest for tops, waist for bottoms.)
  - fitNote: if `opts.reference` is given, compare `recommend(profile, reference).size` index with the chosen size index (higher → `runs_small`, lower → `runs_large`, equal → `true_to_size`). Without a reference, `true_to_size`.

- [ ] **Step 1: Write failing tests** with hand-built normalized charts and a fixed target (no regression dependency):
  - a target that exactly matches size M's garment values → best `M`, fitMatch 98, every area `ideal`, position 0;
  - a target 5% above XL on every dimension (S–XL chart) → best `XL`, `outOfRange: 'above'`, band `between`;
  - a chart with only `chest` and `null` for size S → no `NaN` in any score and S is never best;
  - a one-size chart `["OS"]` → size `OS`, runnerUp `null`;
  - a tie between L and XL → `relaxed` picks XL and `slim` picks L;
  - the same chart in inch/flat versus cm/circumference → identical `Recommendation` (deep equal);
  - a property check: for a male at 180 cm and weight from 50 to 130 in 5 kg steps against a tops chart, the recommended size index never decreases.
- [ ] **Step 2:** Run them and confirm FAIL.
- [ ] **Step 3:** Implement `ease.ts` (the constant tables above), `score.ts` and `recommend.ts`, and export them from `index.ts`.
- [ ] **Step 4:** Run `npm test -w @true-size-chart/engine`. Expected: PASS, all suites.
- [ ] **Step 5: Commit** `feat(engine): fit scoring and recommendation`

### Task 7: T-shirt template, golden snapshot, bundle budget

**Files:**
- Create: `packages/engine/src/templates/tshirt.ts`, `test/golden.test.ts`, `scripts/size-budget.mjs`
- Modify: `packages/engine/package.json` (scripts `build` = esbuild bundle of `src/index.ts` to `dist/engine.js` (ESM, minified); `size` = `node scripts/size-budget.mjs`)

**Interfaces:**
- Produces: `TSHIRT_UNISEX: ChartInput` (unit cm, basis `garment_flat`, intendedFit `regular`, category `tshirt`): sizes `XS,S,M,L,XL,XXL`, chest `46,49,52,55,58,61`, length `68,70,72,74,76,78`. Plan 3 adds the other categories next to it.

- [ ] **Step 1:** Write `golden.test.ts`. Over sex ∈ {female, male}, height 150–200 step 10 and weight 45–130 step 15 (default shape, `regular`), record `{size, fitMatch, band, outOfRange}` against `TSHIRT_UNISEX` with `toMatchSnapshot()`. Also assert that 186 cm / 40 kg gives `XS` or `S` and 186 cm / 150 kg gives `XXL` with `outOfRange: 'above'`.
- [ ] **Step 2:** Run it to create the snapshot. **Show the snapshot table to the user** for a sanity read before committing. (The video's L/XL boundaries came from a different chart and are not asserted.)
- [ ] **Step 3:** `size-budget.mjs` gzips `dist/engine.js` and exits 1 above 6144 bytes. Run `npm run build -w @true-size-chart/engine && npm run size -w @true-size-chart/engine`. Expected: it prints the size ≤ 6144 and exits 0.
- [ ] **Step 4: Commit** `test(engine): golden snapshot and bundle size budget`
