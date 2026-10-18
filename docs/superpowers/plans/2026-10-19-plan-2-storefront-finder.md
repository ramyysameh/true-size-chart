# True: Size Chart — Plan 2: Storefront Size Finder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopper on a product page with a linked chart clicks "Find my size", goes through the video's 3 steps, and adds the recommended size to the cart, with no measurable storefront cost before that click.

**Architecture:** The theme app extension renders a hidden-until-ready `<button>` (app block) and, from the app embed, an inline JSON config plus an inline loader of under 1 KB. On button intent the loader injects `tsc-finder.js`, which defines the `<true-size-finder>` custom element (vanilla TS, Shadow DOM, engine bundled in), and preloads `tsc-finder.css` for the shadow root. A new workspace package `packages/storefront` holds the source and tests and builds into the extension's `assets/` and `snippets/`.

**Tech Stack:** TypeScript, esbuild, Vitest + happy-dom, Liquid (theme app extension), Shopify CLI, Lighthouse CLI.

**Spec:** `docs/superpowers/specs/2026-10-18-true-size-chart-design.md` (§2 Storefront, §4, §5 Storefront runtime, §9 M2). Exact copy and layout: `docs/reference-video-analysis.md` §2 and §4. Liquid path: `docs/decisions/0001-liquid-chart-access.md`.

**Later plans:** 3 Merchant admin · 4 Analytics & App Pricing (the `sendBeacon` events and the "Powered by True" link land there) · 5 Launch readiness.

## Global Constraints

- **Nothing loads before intent.** On page load the storefront adds only the inline config, the inline loader and the button. No request for `tsc-finder.js`/`.css` before `pointerover`, `focusin` or `click` on a `[data-tsc-open]` element.
- **Body data never leaves the device.** The only network calls the finder makes are the two asset loads and `POST {routes.cart_add_url}.js`. No analytics in this plan.
- **Budgets** (enforced by `packages/storefront/scripts/size-budget.mjs`): `tsc-finder.js` ≤ 15 360 B gzip (engine included), `tsc-finder.css` ≤ 4 096 B gzip, inline loader ≤ 1 024 B minified (raw, it is inline). Lighthouse performance delta (embed + block on vs off) ≤ 3 points.
- **Vanilla TS only.** No runtime dependencies apart from `@true-size-chart/engine`. No webfonts (the default "editorial" font is a system neo-grotesk stack: `"Helvetica Neue", Helvetica, Arial, sans-serif`).
- **[my call] Classic IIFE, not a module script.** The spec says "module"; `tsc-finder.js` is built as an IIFE and injected as a classic `<script async>`, because module scripts from `cdn.shopify.com` depend on CORS headers we don't control. Flag this to the user at review.
- **Shadow DOM.** The element renders into an open shadow root so theme CSS can't break it; `font-family` is inherited from the host when the font setting is `theme`.
- **Engine contract:** `recommend(profile, chart, opts)`; `ChartError` → hide the finder (size chart tab only); `ProfileError` → discard and re-ask. `scores[].error` can be `Infinity` (size not scorable) — never format it, never pick it as a substitute.
- **`localStorage` key `tsc:profile:v1`**, every access inside `try/catch`.
- **Copy is the video's**, stored sentence-case in `strings.ts` and upper-cased with CSS (`text-transform: uppercase`) where the video shows caps. Sliders: height 140–210 cm (step 1) / 4 ft 7 in–6 ft 11 in (step 1 in); weight 40–150 kg (step 1) / 88–330 lbs (step 1).
- **Layout:** desktop right drawer `width: clamp(400px, 40vw, 520px)`, full height, page dimmed + `backdrop-filter: blur(4px)`. At `max-width: 749px` a full-height bottom sheet.
- **Shopify validation:** Liquid with `shopify theme check --path extensions/true-size-chart` (the toolkit's Liquid validator is missing a dependency on this machine). GraphQL with the Shopify skill's `scripts/validate.mjs --api admin --version 2026-10` (the newest version the toolkit knows; the app TOML pins 2027-01).
- Theme app extension limits (shopify.dev, "Configure theme app extensions"): Liquid across all files ≤ 100 KB, each locale file ≤ 15 KB, all files ≤ 10 MB.
- Generated files (`assets/tsc-finder.js`, `assets/tsc-finder.css`, `snippets/tsc-loader.liquid`) are **committed**, so `shopify app deploy` ships what was reviewed. Root `predev`/`predeploy` scripts rebuild them.

## Review Focus

1. **Theme without a standard product form** (custom variant picker, no `form[action*="/cart/add"] [name="id"]`). Expect the current variant to come from `?variant=` and then `config.selectedVariantId`, and add-to-bag to still keep the shopper's other options. → Task 3.
2. **Recommended size sold out, missing from the variants, or every size sold out.** Expect the next best in-stock size by score with a note; with nothing in stock a disabled "Sold out in your size". → Task 3 + Task 7.
3. **`localStorage` throws or holds junk** (Safari private mode, blocked storage, an old or hand-edited value). Expect the finder and loader to work with no stored profile and never throw. → Task 2 + Task 8.
4. **`tsc-finder.js` fails to load after the click** (offline, CDN error). Expect the button to recover (`aria-busy` cleared) and a later click to retry. → Task 8.
5. **Merchant accent colour with poor contrast** (e.g. `#ffff00`). Expect the primary button's text to switch between black and white so it keeps ≥ 4.5:1. → Task 5.

---

## File Structure

```
packages/storefront/                    new workspace @true-size-chart/storefront
  package.json  tsconfig.json  vitest.config.ts (environment: happy-dom)
  scripts/build.mjs                     esbuild → extension assets/ + snippets/tsc-loader.liquid
  scripts/size-budget.mjs               gzip budgets
  src/config.ts                         FinderConfig type + readConfig() + toChartInput()
  src/profile-store.ts                  tsc:profile:v1 load/save/clear (try/catch)
  src/remembered.ts                     paintRemembered(): "Your size: XL" on page buttons
  src/variants.ts                       current variant, size → variant, next-best in stock
  src/cart.ts                           addToCart() via /cart/add.js
  src/strings.ts                        English copy (defaults, overridable)
  src/model.ts                          Draft, defaults, live estimate, final recommendation
  src/copy.ts                           result copy branching on band/outOfRange/fitNote
  src/loader.ts                         inline loader (boot)
  src/index.ts                          entry: defines <true-size-finder>
  src/finder/dom.ts                     h() element builder
  src/finder/element.ts                 custom element shell: dialog, tabs, focus trap, routing
  src/finder/theme.ts                   settings → CSS vars, contrastText()
  src/finder/slider.ts                  role=slider control
  src/finder/screens/body.ts shape.ts fit.ts result.ts chart.ts
  src/finder/icons.ts                   thin line SVG strings
  src/styles/finder.css
  test/*.test.ts
extensions/true-size-chart/
  blocks/tsc-embed.liquid   (modify)    config JSON + {% render 'tsc-loader' %}
  blocks/tsc-button.liquid  (create)    app block button(s)
  snippets/tsc-loader.liquid            generated
  assets/tsc-finder.js, tsc-finder.css  generated
packages/engine/src/recommend.ts, score.ts   (modify, Task 1)
scripts/dev/seed-apparel-product.graphql     (create, Task 10)
scripts/perf/lighthouse.mjs                  (create, Task 10)
```

---

### Task 1: Engine follow-ups the finder relies on

**Files:**
- Modify: `packages/engine/src/recommend.ts`, `packages/engine/src/score.ts`
- Test: `packages/engine/test/recommend.test.ts`, `packages/engine/test/score.test.ts`

**Interfaces:**
- Produces: `fitMatchFromError(error: number): number | null` exported from `score.ts` (`null` when `error` is not finite, else `clamp(round(100 − 350·error), 55, 98)`); `selectSize` uses it. `recommend(..., { reference })` returns `fitNote: 'true_to_size'` when the reference chart throws (any error from the inner `recommend`); `ProfileError` from the shopper's own profile still throws, because `validateProfile` runs first.

- [ ] **Step 1: Write failing tests**
  - `fitMatchFromError(0)` → 98, `fitMatchFromError(0.1)` → 65, `fitMatchFromError(1)` → 55, `fitMatchFromError(Infinity)` → `null`, `fitMatchFromError(NaN)` → `null`.
  - `recommend(male180_89, TSHIRT_UNISEX, { reference: { ...TSHIRT_UNISEX, sizes: [] } })` does not throw and has `fitNote: 'true_to_size'`.
  - `recommend({ ...male180_89, heightCm: 500 }, TSHIRT_UNISEX, { reference: TSHIRT_UNISEX })` still throws `ProfileError`.
  - A chart with only `chest` and `null` for size S → `rec.scores[0].error === Infinity` (pins the contract the finder depends on).
- [ ] **Step 2:** Run `npm test -w @true-size-chart/engine`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `fitMatchFromError` and the `try/catch` around the reference `recommend` call.
- [ ] **Step 4:** Run the engine tests, `npm run build -w @true-size-chart/engine` and `npm run size -w @true-size-chart/engine`. Expected: PASS, golden snapshot unchanged, size ≤ 6144 B.
- [ ] **Step 5: Commit** `fix(engine): reference chart errors fall back to true_to_size; export fitMatchFromError`

### Task 2: Storefront package, config parsing, profile store

**Files:**
- Create: `packages/storefront/package.json` (name `@true-size-chart/storefront`, `"type": "module"`, scripts `test` = `vitest run`, `build` = `node scripts/build.mjs`, `size` = `node scripts/size-budget.mjs`; dependency `@true-size-chart/engine: "*"`; devDependencies `esbuild`, `typescript`, `vitest` at the engine's versions, plus `happy-dom`), `tsconfig.json` (engine's, with `"lib": ["ES2020", "DOM", "DOM.Iterable"]`), `vitest.config.ts` (`environment: 'happy-dom'`, include `test/**/*.test.ts`), `src/config.ts`, `src/profile-store.ts`, `src/remembered.ts`
- Modify: root `package.json` scripts: `"test:storefront": "npm test -w @true-size-chart/storefront"`, `"build:storefront": "npm run build -w @true-size-chart/storefront"`
- Test: `test/fixtures/config.ts`, `test/config.test.ts`, `test/profile-store.test.ts`, `test/remembered.test.ts`

**Interfaces:**
- Produces (`test/fixtures/config.ts`, shared by every later test): `DEV_CHART: ChartInput` (the seeded dev chart: sizes `S,M,L,XL`, chest `49,52,55,58`, length `70,72,74,76`, cm, `garment_flat`, `tshirt`, `regular`), `CONFIG: FinderConfig` (chart key `dev-tshirt-unisex`, audience `unisex`, variants Size `S,M,L,XL` × Color `Black,White` with options `[color, size]`, `sizeOptionIndex: 1`, Black/XL `available: false`, routes `/cart/add` and `/cart`), and `mountConfig(doc, config = CONFIG)` which writes it into a `#tsc-config` script plus a `[data-tsc-open]` button with the block's attributes.
- Produces (`src/config.ts`):
  ```ts
  export interface VariantInfo { id: number; available: boolean; options: string[] }
  export interface FinderConfig {
    chart: { key: string; name: string; category: Category; unit: 'cm' | 'in';
      basis: ChartInput['basis']; intendedFit: ChartInput['intendedFit'];
      audience: 'women' | 'men' | 'unisex' | null; table: ChartTable; howToMeasure: string | null };
    product: { title: string; image: string | null; price: string };
    variants: VariantInfo[];
    sizeOptionIndex: number | null;          // index into VariantInfo.options; null = no size option matched
    selectedVariantId: number;
    routes: { cartAdd: string; cart: string };   // Liquid routes.cart_add_url / routes.cart_url
    assets: { js: string; css: string };
    settings: { font: 'theme' | 'editorial'; accent: string; radius: number };
    strings: Record<string, string>;         // merchant overrides, merged over Task 4's STRINGS
  }
  export function readConfig(doc: Document): FinderConfig | null;   // #tsc-config; null if absent or not JSON
  export function toChartInput(chart: FinderConfig['chart']): ChartInput;
  ```
- Produces (`src/profile-store.ts`):
  ```ts
  export const PROFILE_KEY = 'tsc:profile:v1';
  export interface Units { height: 'cm' | 'ftin'; weight: 'kg' | 'lbs' }
  export interface StoredProfile { v: 1; profile: ShopperProfile; units: Units; sizes: Record<string, string> }
  export function loadProfile(storage?: Storage | null): StoredProfile | null;
  export function saveProfile(profile: ShopperProfile, units: Units, chartKey: string, size: string, storage?: Storage | null): void;
  export function clearProfile(storage?: Storage | null): void;
  ```
  `storage` defaults to `window.localStorage` read inside `try`. `loadProfile` returns `null` for missing, unparsable, `v !== 1`, or a profile that fails `validateProfile`. `saveProfile` replaces `sizes` with `{ [chartKey]: size }` when the profile changed (other charts' cached sizes would be stale) and merges otherwise.
- Produces (`src/remembered.ts`): `paintRemembered(doc: Document, size: string | null): void` — for every `[data-tsc-open]:not([data-tsc-open="chart"])`, sets its `[data-tsc-label]` text to `data-tsc-remembered` with `{size}` replaced, or back to `data-tsc-default` when `size` is `null`. The loader (Task 8) imports it too.

- [ ] **Step 1: Write failing tests**
  - `readConfig` on a document with a valid `#tsc-config` returns the object; with no element or invalid JSON returns `null`.
  - `toChartInput(CONFIG.chart)` deep-equals `DEV_CHART`.
  - `saveProfile` then `loadProfile` round-trips; `sizes` is `{ 'dev-tshirt-unisex': 'XL' }`.
  - Saving a *different* profile for chart `b` drops chart `a`'s size; saving the *same* profile for `b` keeps both.
  - `loadProfile` returns `null` for `'not json'`, `{"v":2}`, and a profile with `heightCm: 999`.
  - With a `storage` whose `getItem`/`setItem`/`removeItem` throw, all three functions return normally (`null` / no throw).
  - `paintRemembered(doc, 'XL')` with `data-tsc-remembered="Your size: {size}"` → label text `Your size: XL`; `paintRemembered(doc, null)` → `Find my size`; the `data-tsc-open="chart"` link is untouched.
- [ ] **Step 2:** `npm install`, then `npm run test:storefront`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storefront): config, profile store and remembered size`

### Task 3: Variant selection, stock fallback and add to bag

**Files:**
- Create: `packages/storefront/src/variants.ts`, `src/cart.ts`
- Test: `test/variants.test.ts`, `test/cart.test.ts`

**Interfaces:**
- Consumes: `FinderConfig`, `VariantInfo` (Task 2); `Recommendation` (engine).
- Produces:
  ```ts
  export function currentVariantId(doc: Document, config: FinderConfig, location?: Location): number;
  export function variantForSize(config: FinderConfig, size: string, currentId: number): VariantInfo | null;
  export interface StockPick { size: string; variant: VariantInfo; substituted: boolean }
  export function inStockPick(rec: Recommendation, size: string, config: FinderConfig, currentId: number): StockPick | null;
  export type AddResult = { ok: true } | { ok: false; message: string | null };
  export function addToCart(config: FinderConfig, variantId: number, doc: Document): Promise<AddResult>;
  ```
- Rules:
  - `currentVariantId`: `?variant=` in the URL, else the first `form[action*="/cart/add"] [name="id"]` value, else `config.selectedVariantId`. Ignore values that are not a known variant id.
  - `variantForSize`: size labels match option values after `trim().toLowerCase()`. Prefer the variant equal to the current variant with only the size option swapped; otherwise any variant with that size, available first. `null` when `sizeOptionIndex` is `null` or no variant has that size.
  - `inStockPick(rec, size, …)`: `size` is the size the shopper is looking at (the recommendation or a size they tapped). If its variant is available → `{ substituted: false }`. Else walk `rec.scores` with finite `error`, ascending error, skipping `size`, and return the first available as `{ substituted: true }`. Nothing available → `null`.
  - `addToCart`: `POST ${routes.cartAdd}.js`, JSON body `{ items: [{ id, quantity: 1 }] }`, plus `sections: 'cart-icon-bubble'` and `sections_url: location.pathname` only when `#cart-icon-bubble` exists in `doc`. On 2xx: if `sections['cart-icon-bubble']` came back, replace `#cart-icon-bubble`'s innerHTML with the parsed section's `.shopify-section` innerHTML; dispatch `new CustomEvent('tsc:cart-added', { detail: { variantId } })` on `doc`; return `{ ok: true }`. On non-2xx return `{ ok: false, message: body.description ?? body.message ?? null }`. On a thrown fetch return `{ ok: false, message: null }` (the UI shows its own fallback string).

- [ ] **Step 1: Write failing tests** (`CONFIG` from Task 2's fixture)
  - URL `?variant=<White/M id>` beats the form input, which beats `selectedVariantId`; an unknown id in the URL is ignored.
  - With no product form and no URL param → `selectedVariantId`.
  - `variantForSize(config, 'xl ', <White/M>)` → White/XL.
  - `variantForSize` with `sizeOptionIndex: null` → `null`; for `'XXL'` (not a variant) → `null`.
  - `inStockPick` for XL from Black/M, with scores XL 0.02, L 0.05, M 0.09, S `Infinity` → `{ size: 'L', substituted: true }`.
  - Every size unavailable → `null`; a size with `Infinity` error is never returned.
  - `addToCart` with a mocked `fetch` (`vi.stubGlobal`): posts to `/cart/add.js` with `{ items: [{ id, quantity: 1 }] }`; resolves `{ ok: true }` and fires `tsc:cart-added`; with `#cart-icon-bubble` present, the request includes `sections` and the bubble's HTML is replaced; a 422 `{ description: 'All 1 X are in your cart.' }` returns that message; a rejected fetch returns `{ ok: false, message: null }`.
- [ ] **Step 2:** Run `npm run test:storefront`. Expected: FAIL.
- [ ] **Step 3:** Implement `variants.ts` and `cart.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storefront): size-to-variant mapping, in-stock fallback, AJAX cart`

### Task 4: Strings, finder model and result copy

**Files:**
- Create: `packages/storefront/src/strings.ts`, `src/model.ts`, `src/copy.ts`
- Test: `test/model.test.ts`, `test/copy.test.ts`

**Interfaces:**
- Produces (`src/strings.ts`): `export const STRINGS` (the table below) and `export type Strings = typeof STRINGS`; `fmt(template: string, vars: Record<string, string | number>): string` replaces `{name}`.
- Produces (`src/model.ts`):
  ```ts
  export interface Draft { sex: Sex; heightCm: number; weightKg: number;
    shape: ShopperProfile['shape']; fitPref: FitPref; units: Units }
  export function defaultDraft(config: FinderConfig, stored: StoredProfile | null, lang?: string): Draft;
  export function toProfile(d: Draft): ShopperProfile;
  export function liveEstimate(d: Draft, chart: ChartInput): string | null;   // shape 0, regular; null on any error
  export function finalRecommendation(d: Draft, chart: ChartInput): Recommendation;  // throws ChartError/ProfileError
  ```
  - Defaults **[my call]**: from `stored` when present. Otherwise sex `male` when `chart.audience === 'men'`, else `female`; female 165 cm / 65 kg, male 178 cm / 80 kg; shape all 0; `regular`; units `ftin`/`lbs` when `lang` (default `navigator.language`) is `en-US`, else `cm`/`kg`.
  - `finalRecommendation` passes `{ reference: REFERENCES[chart.category] }` where `REFERENCES: Partial<Record<Category, ChartInput>> = { tshirt: TSHIRT_UNISEX }` (Plan 3 adds the other templates).
- Produces (`src/copy.ts`):
  ```ts
  export interface ResultCopy { confidence: string; fitNote: string }
  export function resultCopy(rec: Recommendation, sizes: string[], fit: FitPref, s: Strings): ResultCopy;
  export function cta(size: string, s: Strings): string;          // "Add XL to bag"
  ```
  Branching, in this order: `outOfRange === 'above'` → `s.largest`; `'below'` → `s.smallest`; `band 'confident'` → `s.confident`; `'good'` → `s.good`; `'between'` with a `runnerUp` → `s.between` with `{a}`/`{b}` in chart order and `{size}`/`{fit}`; `'between'` with no runner-up → `s.closest`. **Never use `between` copy when `outOfRange` is set**: there the runner-up is just the next smaller size.

- Copy (`STRINGS`, verbatim from the video where it exists; the rest **[my call]**):

  | key | text |
  |---|---|
  | `header` | Find your perfect size |
  | `tabFinder` / `tabChart` | Find my size / Size chart |
  | `close` / `back` | Close / Back |
  | `step1Title` / `step1Sub` | Let's find your fit / Two measurements are all it takes. Drag to adjust. |
  | `sizing` / `female` / `male` | Sizing / Female / Male |
  | `height` / `weight` | Height / Weight |
  | `cm` / `ftin` / `kg` / `lbs` | cm / ft/in / kg / lbs |
  | `liveEstimate` / `liveSub` | Live estimate / Refined in the next steps |
  | `privacy` | Saved privately on this device, so every piece shows your size. |
  | `continue` | Continue |
  | `step2Title` / `step2Sub` | Your shape / Clothes fit bodies, not numbers. Not sure? Leave it at average. |
  | `chest` / `stomach` / `hips` | Chest / Stomach / Hips |
  | `slimmer` `average` `broader` · `flatter` `rounder` · `narrower` `fuller` | Slimmer · Average · Broader · Flatter · Rounder · Narrower · Fuller |
  | `step3Title` / `step3Sub` | How do you like it to fit? / We will size around the way you wear it. |
  | `slim` / `slimDesc` | Slim / Follows the body. Sharp and tailored. |
  | `regular` / `regularDesc` | Regular / The silhouette the designer intended. |
  | `relaxed` / `relaxedDesc` | Relaxed / Room to move and layer underneath. |
  | `findMySize` | Find my size |
  | `bestMatch` / `fitMatch` | Best match / {n}% fit match |
  | `confident` / `good` | A confident match for your measurements. / A good match for your measurements. |
  | `between` | Between {a} and {b} — we'd pick {size} for {fit} fit. |
  | `closest` | Our closest size for your measurements. |
  | `largest` / `smallest` | {size} is our largest size, so it may fit snug. / {size} is our smallest size, so it may fit roomy. |
  | `you` / `tapHint` | You / Tap a size to see how it would fit. |
  | `snug` / `ideal` / `roomy` | Snug / Ideal / Roomy |
  | `waist` / `hip` / `length` / `inseam` | Waist / Hips / Length / Inseam |
  | `noData` | No measurements for this size. |
  | `fitNoteTitle` | Fit note |
  | `trueToSize` / `runsSmall` / `runsLarge` | Against your measurements this piece fits true to size. / This piece runs small, so we sized up for you. / This piece runs large, so we sized down for you. |
  | `disclaimer` | This is a general recommendation. Individual fit may vary by style and preference. |
  | `addToBag` / `adding` / `added` / `viewBag` | Add {size} to bag / Adding… / Added to bag / View bag |
  | `substituted` | {size} is sold out. {alt} is the next best fit in stock. |
  | `soldOut` / `addError` | Sold out in your size / Couldn't add to bag. Please try again. |
  | `noSizeOption` | Choose {size} on the page to add it to your bag. |
  | `editDetails` / `clearData` | Edit details / Clear my data |
  | `howToMeasure` / `emptyCell` | How to measure / — |
  | `basisFlat` / `basisCirc` / `basisBody` | Garment measured flat / Garment measurements / Body measurements |

- [ ] **Step 1: Write failing tests**
  - `defaultDraft` with no stored profile and audience `men` → male 178/80, `regular`, all shape 0; with `lang: 'en-US'` → units `ftin`/`lbs`; with a stored profile → that profile and its units.
  - `liveEstimate` for male 180/89 against `TSHIRT_UNISEX` equals `recommend(…shape 0, regular…).size`; with a chart whose `sizes` is `[]` → `null` (no throw).
  - `finalRecommendation` uses the reference only for `tshirt`: a copy of `TSHIRT_UNISEX` with every measurement × 0.94 gives `fitNote: 'runs_small'` for male 180/89; the same chart with `category: 'shirt'` gives `'true_to_size'`.
  - `resultCopy` for `{ band: 'between', outOfRange: 'above', size: 'XXL', runnerUp: 'XL' }` → `"XXL is our largest size, so it may fit snug."`, and does **not** contain `"Between"`.
  - `{ band: 'between', outOfRange: null, size: 'L', runnerUp: 'M' }`, fit `regular` → `"Between M and L — we'd pick L for Regular fit."`.
  - `{ band: 'between', runnerUp: null }` → `s.closest`; `confident` → `s.confident`.
  - `fitNote: 'runs_small'` → `s.runsSmall`; `cta('XL', STRINGS)` → `"Add XL to bag"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `strings.ts`, `model.ts`, `copy.ts`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storefront): finder model and result copy`

### Task 5: `<true-size-finder>` shell and size chart tab

**Files:**
- Create: `packages/storefront/src/index.ts`, `src/finder/dom.ts`, `src/finder/element.ts`, `src/finder/theme.ts`, `src/finder/screens/chart.ts`, `src/styles/finder.css`
- Test: `test/element.test.ts`, `test/chart-tab.test.ts`, `test/theme.test.ts`

**Interfaces:**
- Consumes: `readConfig`, `toChartInput` (Task 2), `defaultDraft`, `STRINGS` (Task 4), `normalizeChart`, `ChartError` (engine).
- Produces:
  ```ts
  export type Screen = 'body' | 'shape' | 'fit' | 'result' | 'chart';
  export interface FinderContext {
    config: FinderConfig; strings: Strings; draft: Draft;
    setDraft(patch: Partial<Draft>): void;   // never re-renders; screens patch their own nodes
    go(screen: Screen): void;                // re-renders the panel body
    close(): void;
  }
  export type ScreenRenderer = (ctx: FinderContext) => HTMLElement;
  export class TrueSizeFinder extends HTMLElement {
    open(opts?: { tab?: 'finder' | 'chart'; trigger?: HTMLElement | null }): Promise<void>;
    close(): void;
    registerScreen(screen: Screen, render: ScreenRenderer): void;   // Tasks 6–7 register theirs
  }
  // index.ts: registers the screens and customElements.define('true-size-finder', TrueSizeFinder) once
  export function contrastText(hex: string): '#000000' | '#ffffff';     // theme.ts
  export function h(tag: string, attrs?: Record<string, unknown> | null, ...children: (Node | string | null)[]): HTMLElement; // dom.ts
  ```
- Behaviour:
  - Shadow root holds `<link rel="stylesheet" href=config.assets.css>`, a backdrop and `<div role="dialog" aria-modal="true" aria-labelledby>`. The panel shows only after the link's `load` (or `error`, so a CSS failure never blocks the finder).
  - Chrome per video §2: header, close `×`, product card (image, title, price), `role="tablist"` with Find my size / Size chart, a 3-segment progress bar with `01 / 03` on steps 1–3, footer with a square back button (from step 2) and a full-width primary button whose label is followed by an `aria-hidden` `→` on Continue / Find my size.
  - `open()`: lock scroll (`documentElement.style.overflow = 'hidden'`, restored on close), remember `trigger`, focus the first focusable. Starting screen: `tab: 'chart'` → `chart`; else a stored profile → `result`; else `body`.
  - **Chart check on open:** `normalizeChart(toChartInput(...))` throwing `ChartError` → the finder tab is hidden and only `chart` shows; if the table has no sizes either, close, set `hidden` on every `[data-tsc-open]` and `console.warn` once.
  - Focus trap: `Tab`/`Shift+Tab` wrap inside the shadow root's focusables. `Escape` and a backdrop click close. On close focus returns to `trigger`.
  - Settings → CSS vars on the host: `--tsc-font` (`inherit` for `theme`, the editorial stack otherwise), `--tsc-accent`, `--tsc-on-accent` (= `contrastText(accent)`), `--tsc-radius` (px).
  - `finder.css`: palette `#f7f7f5` background, `#111` text, `#e9e9e9` selected fill; small labels uppercase with `letter-spacing: .12em`; large light numerals; drawer/bottom sheet per Global Constraints; slide/fade 200 ms; everything inside `@media (prefers-reduced-motion: reduce)` drops transitions and animations.
  - **Size chart tab** (`screens/chart.ts`): a `<table>` with a header row of measurement names and one row per size; a `cm | in` toggle that converts (in = cm / 2.54, 1 decimal; cm whole or 1 decimal), starting in the chart's unit; `null` cells show `emptyCell`; a caption from the basis (`basisFlat`/`basisCirc`/`basisBody`); then `howToMeasure` with the chart's `howToMeasure` text, omitted when empty. Values are shown as the merchant entered them (flat stays flat).

- [ ] **Step 1: Write failing tests** (happy-dom; fixture config injected as `#tsc-config`; `link` load fired manually)
  - `open()` renders a `role="dialog"` with `aria-modal="true"` in the shadow root and `documentElement.style.overflow === 'hidden'`; `close()` restores it.
  - `Escape` closes and `document.activeElement` is the trigger button.
  - Focus trap: `Tab` from the last focusable lands on the first; `Shift+Tab` from the first lands on the last.
  - A stored profile opens on `result`; `open({ tab: 'chart' })` opens the chart tab.
  - A config whose chart has a measurement array of the wrong length → only the chart tab is rendered (no Find my size tab). A config with `sizes: []` → the dialog closes, page buttons get `hidden`.
  - Chart tab for `garment_flat` cm chest `[49, 52]` → cells `49`, `52`; after clicking `in` → `19.3`, `20.5`; a `null` → `—`; caption `Garment measured flat`.
  - `contrastText('#ffff00')` → `#000000`; `contrastText('#111111')` → `#ffffff`; `contrastText('#767676')` → `#ffffff`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the shell, theme helpers, chart screen and CSS.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storefront): finder shell, focus trap, size chart tab`

### Task 6: Steps 1–3 and the slider

**Files:**
- Create: `packages/storefront/src/finder/slider.ts`, `src/finder/icons.ts`, `src/finder/screens/body.ts`, `screens/shape.ts`, `screens/fit.ts`
- Modify: `src/index.ts` (register the three screens)
- Test: `test/slider.test.ts`, `test/steps.test.ts`

**Interfaces:**
- Consumes: `FinderContext`, `ScreenRenderer`, `h` (Task 5); `liveEstimate`, `Draft` (Task 4); `ftInToCm`, `cmToFtIn`, `lbsToKg`, `kgToLbs` (engine).
- Produces:
  ```ts
  export interface SliderOptions { label: string; min: number; max: number; step: number; value: number;
    valueText(v: number): string; onInput(v: number): void }
  export function createSlider(o: SliderOptions): { el: HTMLElement; set(v: number): void };
  ```
- Behaviour:
  - Slider: `role="slider"`, `tabindex=0`, `aria-valuemin/max/now`, `aria-valuetext` from `valueText`, `aria-label`. Keys: ArrowRight/ArrowUp +step, ArrowLeft/ArrowDown −step, PageUp/PageDown ±10 steps, Home/End. Pointer drag on the track with `setPointerCapture`. Hollow circular thumb on a thin track with `−`/`+` stepper buttons (`aria-label` "Decrease height" etc.). Values clamp to min/max.
  - Step 1 (`body`): Female/Male segmented toggle (`aria-pressed`), height and weight sliders with their unit toggles, silhouette SVG (`scaleY = heightCm / 210`, `scaleX = clamp(sqrt(BMI / 22), 0.8, 1.3)`) with a dotted head line, `Live estimate` letter updated on every `onInput` via `liveEstimate` (no debounce; it is pure and fast), privacy line with a lock icon, `Continue`. The draft always stores cm/kg; imperial sliders move in whole inches / pounds and write `ftInToCm` / `lbsToKg` results. Height text in imperial is `5 ft 11 in`.
  - Step 2 (`shape`): three `role="radiogroup"` rows of three `role="radio"` tiles with line icons; arrow keys move the selection; defaults Average; `Continue`.
  - Step 3 (`fit`): `role="radiogroup"` of Slim / Regular / Relaxed rows with title, description, icon and a dot; `Find my size` goes to `result`.
  - Steps 2–3 show the back button; progress shows `02 / 03` and `03 / 03`.

- [ ] **Step 1: Write failing tests**
  - Slider: ArrowRight from 180 → `aria-valuenow="181"` and `onInput(181)`; PageDown → 171; End → 210; Home → 140; ArrowRight at max stays 210.
  - Body step: after 5 × ArrowRight on height (male 180/89), the live estimate text equals `liveEstimate` for 185 cm; **focus is still on the slider** (no re-render).
  - Switching height to ft/in shows `5 ft 11 in` for 180 cm; ArrowRight once → draft height `ftInToCm(6, 0)`; switching back to cm shows `183`.
  - Switching weight to lbs and back keeps the draft weight within 0.5 kg.
  - Shape step: ArrowRight on the Chest radiogroup moves from Average to Broader and sets `draft.shape.chest = 1`.
  - Fit step defaults to Regular (`aria-checked="true"`); choosing Relaxed and pressing Find my size calls `go('result')` with `draft.fitPref === 'relaxed'`.
  - Progress reads `01 / 03`, `02 / 03`, `03 / 03`; back from `shape` returns to `body` with the draft intact.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the slider, icons and three screens.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storefront): finder steps 1-3 with accessible sliders`

### Task 7: Result screen and add to bag

**Files:**
- Create: `packages/storefront/src/finder/screens/result.ts`
- Modify: `src/index.ts` (register `result`)
- Test: `test/result.test.ts`

**Interfaces:**
- Consumes: `finalRecommendation`, `toProfile`, `defaultDraft` (Task 4); `resultCopy`, `cta`, `fmt` (Task 4); `fitMatchFromError` (Task 1); `currentVariantId`, `inStockPick`, `variantForSize`, `addToCart` (Task 3); `saveProfile`, `clearProfile` (Task 2); `paintRemembered` (Task 2).
- Behaviour:
  - On render: compute `finalRecommendation`; a `ProfileError` → `clearProfile()` and `go('body')`. Save with `saveProfile(toProfile(draft), draft.units, config.chart.key, rec.size)` and `paintRemembered(document, rec.size)`.
  - `Best match` ring (SVG circle, `stroke-dasharray` drawn to `fitMatch`%) with the size inside; `{n}% fit match` counts up from 0 over 600 ms (`requestAnimationFrame`); confidence line from `resultCopy`.
  - Size switcher: one button per chart size, `aria-pressed` on the selected one, a `You` marker above the recommended one, `tapHint` below. Tapping a size re-renders the breakdown, the fit % (`fitMatchFromError` of that size's score) and the CTA for that size; a size whose error is `Infinity` shows `noData` instead of the breakdown and no %.
  - Breakdown: `Snug · Ideal · Roomy` scale, one row per `areas` entry (dim label from strings), dot at `left: (position + 1) * 50%`, `aria-label` like `Chest: Ideal`.
  - `Fit note` box with `resultCopy(...).fitNote`, the disclaimer.
  - CTA: `sizeOptionIndex === null` → no button, `noSizeOption` text. Else `inStockPick(rec, shownSize, …)`: `null` → disabled `soldOut`; `substituted` → note `substituted` and CTA `Add {alt} to bag`; otherwise `Add {size} to bag`. Click → `Adding…` (`aria-busy`), then `Added to bag` with a `View bag` link to `routes.cart`, or the returned message / `addError`.
  - Links under the CTA: `Edit details` → `go('body')`; `Clear my data` → `clearProfile()`, `paintRemembered(document, null)`, reset the draft with `defaultDraft(config, null)`, `go('body')`.
  - Reduced motion (`matchMedia('(prefers-reduced-motion: reduce)').matches`): the ring and % render at their final values immediately.

- [ ] **Step 1: Write failing tests** (`CONFIG`, Black/XL sold out; draft male 186/92 regular, with a precondition `expect(finalRecommendation(draft, DEV_CHART).size).toBe('XL')` (adjust the weight if the fitted model disagrees); `matchMedia` stubbed)
  - With reduced motion on, the % text is final on first render and matches `rec.fitMatch`.
  - The recommended size button has the `You` marker and `aria-pressed="true"`.
  - Current variant Black/M → CTA reads `cta(alt)` where `alt = inStockPick(rec, 'XL', CONFIG, blackM).size`, `alt !== 'XL'`, and the `substituted` note names XL and `alt`. Current variant White/M → CTA `Add XL to bag`, no note.
  - Clicking the CTA calls the mocked `fetch` once with the White/XL variant id and then shows `Added to bag` and a `View bag` link to `/cart`; a rejected fetch shows `Couldn't add to bag. Please try again.` and the CTA is clickable again.
  - With a config whose chest is `[null, 52, 55, 58]`, tapping S shows `No measurements for this size.` and no `NaN`/`Infinity` text anywhere in the shadow root.
  - An out-of-range draft (186/150) shows `XL is our largest size, so it may fit snug.` and no `Between`.
  - After render, `localStorage['tsc:profile:v1']` holds the profile and `sizes['dev-tshirt-unisex']`; the page button label reads `Your size: <size>`.
  - `Clear my data` removes the key, resets the label to `Find my size` and shows step 1.
  - A stored profile with `heightCm: 999` injected before opening → step 1 shows and the key is removed.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `result.ts`.
- [ ] **Step 4:** Run `npm run test:storefront`. Expected: PASS, all suites.
- [ ] **Step 5: Commit** `feat(storefront): result screen with fit breakdown and add to bag`

### Task 8: Lazy loader, build pipeline and budgets

**Files:**
- Create: `packages/storefront/src/loader.ts`, `scripts/build.mjs`, `scripts/size-budget.mjs`
- Generated (committed): `extensions/true-size-chart/assets/tsc-finder.js`, `assets/tsc-finder.css`, `snippets/tsc-loader.liquid`
- Delete: `extensions/true-size-chart/assets/.gitkeep`
- Modify: root `package.json` scripts `"predev": "npm run build:storefront"`, `"predeploy": "npm run build:storefront"`
- Test: `test/loader.test.ts`, `test/build.test.ts`

**Interfaces:**
- Consumes: `paintRemembered` (Task 2), `PROFILE_KEY` (Task 2), the `TrueSizeFinder` API (Task 5).
- Produces: `boot(doc: Document, win: Window): void` in `loader.ts`. The build wraps it as an IIFE calling `boot(document, window)`.
- Behaviour of `boot`:
  - Reads `#tsc-config`; returns if absent. Removes `data-tsc-pending` from every `[data-tsc-open]` (the block renders them `visibility: hidden` so nothing shifts).
  - Reads `localStorage[PROFILE_KEY].sizes[chart.key]` inside `try/catch` and calls `paintRemembered`. It does **not** import the engine or validate the profile.
  - Delegated listeners on `doc`: `pointerover` and `focusin` on `[data-tsc-open]` → `prefetch()`; `click` → `prefetch()`, then `await customElements.whenDefined('true-size-finder')`, create the element once (append to `body`), `open({ tab: el.dataset.tscOpen === 'chart' ? 'chart' : 'finder', trigger })`.
  - `prefetch()` runs once: appends `<link rel="preload" as="style" href=css>` and `<script async src=js>`. On the script's `error` it removes the script, resets the once-guard, clears `aria-busy` on the trigger, so the next click retries.
  - While waiting after a click the trigger has `aria-busy="true"`.
- `scripts/build.mjs` (esbuild): `src/index.ts` → `assets/tsc-finder.js` (`format: 'iife'`, `minify`, `target: 'es2020'`); `src/styles/finder.css` → `assets/tsc-finder.css` (minified); `src/loader.ts` → in-memory IIFE written to `snippets/tsc-loader.liquid` as:
  ```liquid
  {%- doc -%} Generated by packages/storefront/scripts/build.mjs. Do not edit. {%- enddoc -%}
  <script>{% raw %}…minified loader…{% endraw %}</script>
  ```
  It fails if the minified loader contains `{% endraw` or `</script`.
- `scripts/size-budget.mjs`: prints and enforces the three budgets from Global Constraints; exit 1 on any breach.

- [ ] **Step 1: Write failing tests**
  - After `boot`, the document has no `script[src*="tsc-finder"]` and no preload link; buttons lost `data-tsc-pending`.
  - `pointerover` on the button appends exactly one script and one preload; a second `pointerover` adds nothing.
  - With `localStorage` holding `sizes: { 'dev-tshirt-unisex': 'L' }` the label reads `Your size: L`; with `getItem` throwing, `boot` does not throw and the label reads `Find my size`.
  - Click → `aria-busy="true"`; firing the script's `error` clears `aria-busy` and removes the script; a second click appends a new script.
  - Click with a stub element already defined (`customElements.define('true-size-finder', class extends HTMLElement { open = vi.fn() })`) → `open` called with `{ tab: 'finder', trigger: button }`; the `data-tsc-open="chart"` link → `tab: 'chart'`.
  - No `#tsc-config` → `boot` adds no listeners (a click does nothing).
  - `build.test.ts` runs `node scripts/build.mjs` and asserts the snippet starts with `{%- doc -%}` and contains exactly one `{% raw %}`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `loader.ts`, `build.mjs`, `size-budget.mjs`.
- [ ] **Step 4:** Run `npm run test:storefront`, then `npm run build:storefront && npm run size -w @true-size-chart/storefront`. Expected: PASS; the budget script prints three sizes within budget and exits 0. If `tsc-finder.js` is over budget, shrink icons/CSS first and report the numbers before changing any budget.
- [ ] **Step 5: Commit** `feat(storefront): lazy loader, build into extension assets, size budgets`

### Task 9: App block and app embed (Liquid)

**Files:**
- Create: `extensions/true-size-chart/blocks/tsc-button.liquid`
- Modify: `extensions/true-size-chart/blocks/tsc-embed.liquid`, `extensions/true-size-chart/locales/en.default.json` (block name), `README.md` (one paragraph: how to build and preview the storefront finder)

**Interfaces:**
- Consumes: the `FinderConfig` shape (Task 2), the `[data-tsc-*]` attributes (Tasks 2 and 8), `snippets/tsc-loader.liquid` (Task 8).
- `tsc-button.liquid` (app block, `"target": "section"`, `"enabled_on": { "templates": ["product"] }`):
  - Renders only when `product.metafields['$app'].size_chart.value` exists.
  - `<button type="button" data-tsc-open data-tsc-pending data-tsc-default="…" data-tsc-remembered="…" {{ block.shopify_attributes }}><span data-tsc-label>{{ label }}</span></button>`, optional second `<button type="button" data-tsc-open="chart" data-tsc-pending>` when `show_chart_link`.
  - An inline `<style>` (≤ 400 bytes, no asset request): `[data-tsc-pending]{visibility:hidden}`, button/link styles from `style`, inheriting the theme font.
  - Settings: `label` (text, default `Find my size`), `remembered_label` (text, default `Your size: {size}`), `style` (select `button`/`link`, default `button`), `show_chart_link` (checkbox, default false), `chart_link_label` (text, default `Size chart`).
- `tsc-embed.liquid` (app embed, `"target": "body"`): keeps the ADR 0001 access path and outputs `#tsc-config` with the full `FinderConfig`:
  - `chart.key` = `chart.system.handle`; `audience`, `howToMeasure` = `chart.how_to_measure.value`.
  - `product`: `title`, `featured_image | image_url: width: 160`, `selected_or_first_available_variant.price | money`.
  - `variants`: loop `product.variants` → `{ "id": v.id, "available": v.available, "options": v.options | json }`.
  - `sizeOptionIndex`: loop `product.options_with_values`; the first option whose `name | downcase | strip` is in the `size_option_names` setting (comma-separated, downcased, stripped) gives `option.position | minus: 1`; otherwise `null`.
  - `selectedVariantId`, `routes` (`routes.cart_add_url`, `routes.cart_url`), `assets` (`'tsc-finder.js' | asset_url`, `'tsc-finder.css' | asset_url`), `settings`, `strings` (only the overrides below that are non-blank). Every string through `| json`.
  - Then `{% render 'tsc-loader' %}`.
  - Settings: `size_option_names` (text, default `Size`), `font` (select `theme`/`editorial`, default `editorial`), `accent` (color, default `#111111`), `radius` (range 0–16 step 2 px, default 0), and string overrides `header`, `privacy`, `disclaimer` (text, blank = default). **[my call]** the rest of the strings become editable with locale files in v1.1.

- [ ] **Step 1:** Write both files and the locale change.
- [ ] **Step 2:** Run `shopify theme check --path extensions/true-size-chart`. Expected: no errors. Fix every offence it reports (search the exact rule in Shopify docs with the skill's `search_docs.mjs --api liquid` before changing course).
- [ ] **Step 3:** Run `npm run build:storefront` and confirm `git status` shows no change to the generated files (they were committed in Task 8 from the same sources).
- [ ] **Step 4: Commit** `feat(extension): Find my size app block and finder config embed`

### Task 10: Dev-store seed, end-to-end check and Lighthouse delta

**Files:**
- Create: `scripts/dev/seed-apparel-product.graphql`, `scripts/dev/seed-apparel-product.variables.json`, `scripts/perf/lighthouse.mjs`
- Modify: `scripts/dev/README.md` (seed and verify steps), `.gitignore` (`scripts/perf/results/`)

**Interfaces:**
- `seed-apparel-product.graphql`: `productSet` (synchronous) creating "TSC Test Tee" (`status: ACTIVE`) with options Size `S,M,L,XL` × Color `Black,White`, price 49.00, Black/XL `inventoryItem: { tracked: true }` (so it is sold out at 0) and every other variant untracked. Validate with `validate.mjs --api admin --version 2026-10`. If `tracked` is rejected for the current scopes, drop it and have the user mark Black/XL out of stock in the admin.
- `lighthouse.mjs`: `node scripts/perf/lighthouse.mjs --url <pdp> --label <off|on> [--runs 5]` runs `npx lighthouse@12 <url> --only-categories=performance --form-factor=mobile --output=json --quiet --chrome-flags="--headless=new"` with `--extra-headers` carrying `Cookie: storefront_digest=<TSC_LH_COOKIE env>`, writes the median score to `scripts/perf/results/<label>.json`; `--compare off on` prints both medians and the delta and exits 1 when the delta > 3.

- [ ] **Step 1:** Write the seed mutation and validate it. Run it with `shopify app execute --store ui-testing-em0ppgsc.myshopify.com --query-file … --variable-file …`, then link `dev-tshirt-unisex` to the new product with the existing `link-chart.graphql`. **User step:** make the product available on the Online Store channel in the admin. Expected: `/products/tsc-test-tee` loads.
- [ ] **Step 2:** Run `shopify app dev`. **User step:** in the theme editor of the App Ext. Host theme, enable the "True: Size Chart" embed and add the "Find my size" block to the product template next to the variant picker.
- [ ] **Step 3: Verify in the built-in browser** on `/products/tsc-test-tee` (the user enters the store password if asked):
  - Before any interaction, `read_network_requests` shows no `tsc-finder` request. After hovering the button, both assets load.
  - Male 180/89 → Continue → Continue → Find my size gives a result; the copy and layout match video §2; ESC closes and focus returns to the button.
  - With Black selected the CTA offers the next size and the sold-out note; with White it offers the recommended size, and adding updates the cart count.
  - Reload: the button reads `Your size: <size>` and opening goes straight to the result. `Clear my data` resets it.
  - Size chart tab: cm/in toggle and how-to-measure text.
  - `resize_window` preset `mobile`: bottom sheet, sliders draggable. Emulated reduced motion: no ring or count-up animation.
  - Keyboard only: Tab to the button, Enter, operate both sliders with arrows and PageUp, Tab never leaves the dialog.
  - `/products/the-videographer-snowboard` (no chart): no button, no `#tsc-config`.
  Reset `resize_window` to `desktop` afterwards. Record anything that fails as a fix in the owning task before continuing.
- [ ] **Step 4: Lighthouse delta.** **User step:** copy the `storefront_digest` cookie from the browser after unlocking the store and set `TSC_LH_COOKIE`. Run `--label on` with the embed and block enabled; **user step:** disable the embed and remove the block; run `--label off`; run `--compare off on`. Expected: delta ≤ 3, exit 0. Put both medians in the PR description. Re-enable the embed and block afterwards.
- [ ] **Step 5: Commit** `chore(dev): apparel test product, Lighthouse delta script`
