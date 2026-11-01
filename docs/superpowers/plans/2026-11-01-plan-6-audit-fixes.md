# Plan 6: Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the issues found in the 2026-11-01 audit without changing anything merchants or App Store reviewers see.

**Architecture:** Four small, independent code tasks plus one manual check. Task 1 caps how many distinct chart keys the storefront event endpoint can create per shop per day (the same flood guard the size rows already have). Task 2 moves the two remaining admin loaders onto the paywall helper. Task 3 patches vulnerable dependencies without major upgrades. Task 4 moves ESLint 8 (end of life) to ESLint 9 with a flat config. Task 5 is a Partner Dashboard checklist.

**Tech Stack:** React Router 7, Prisma 6 on Neon Postgres, Vitest 2, Vercel, Shopify App Pricing.

**Spec:** the audit findings (summarised under Global Constraints) and `docs/superpowers/specs/2026-10-18-true-size-chart-design.md` for analytics and paywall behaviour.

## Global Constraints

- The app is in App Store review (submitted 2026-11-01). Work on branch `plan-6-audit-fixes`. Do not merge to `main`, which is what production runs (check Vercel → Project → Settings → Git to see whether a push to `main` deploys automatically). Merge once review is approved, or earlier only if a reviewer asks for one of these fixes.
- No change to `shopify.app.toml`, `extensions/`, scopes, or the storefront bundle, so no `shopify app deploy` is needed.
- No major-version upgrades of runtime dependencies (`prisma`, `@prisma/client`, `@vercel/functions`, `react-router*`, `express`). Never run `npm audit fix --force`.
- Every task ends green on: `npm run typecheck`, `npm run lint`, `npm run test:app`, `npm run test:engine`, `npm run test:storefront`.
- Node `>=22.12` (from `package.json` engines).

## Review Focus

1. **A real shop with many charts:** a merchant with more charts than the cap must not lose analytics for charts seen earlier that day. Pinned by Task 1's "keeps counting a key already seen today" test. The cap (250) sits far above any realistic catalogue.
2. **An unpaid shop deep-linking to `/app/analytics` or `/app`:** that route's own loader must refuse before it reads shop data. Pinned by Task 2's route scan.
3. **An unpaid shop that has not finished onboarding:** the paywall must win over the onboarding redirect, so `authenticatePro` runs first in `app._index`. Pinned by Task 2, Step 3.
4. **Dependency overrides breaking the Vercel build:** `prisma generate` and `react-router build` must still work with the `zod` and `deepmerge-ts` overrides. Pinned by Task 3, Step 4.
5. **The ESLint migration quietly linting fewer files:** a planted error in each of `app/`, `packages/engine/src/` and `packages/storefront/src/` must still fail lint. Pinned by Task 4, Step 5.

---

### Task 1: Cap distinct chart keys per shop per day

Today `/apps/tsc/e` accepts any `c` that matches `/^[a-z0-9_-]{1,64}$/`. Each new key creates an `EventDaily` row. With the rate limit at 100 events per 10 s per shop, a scripted visitor can create about 864,000 rows per shop per day, which would fill Neon's storage. Analytics only shows real charts, so rows for invented keys are pure waste.

**Files:**
- Modify: `app/lib/events.server.ts` (`recordEvent`, new constant)
- Test: `app/lib/events.server.test.ts`

**Interfaces:**
- Produces: `export const MAX_CHARTS_PER_DAY = 250;` in `app/lib/events.server.ts`. The `recordEvent(db: EventDb, shop: string, ev: ParsedEvent, date: string): Promise<void>` signature does not change.

- [ ] **Step 1: Extend `fakeDb` in the test file** with `eventDaily.findUnique({ where: { shop_chartKey_date } })` (returns the row or `null`) and `eventDaily.count({ where: { shop, date } })` (counts rows for that shop and date across all chart keys).

- [ ] **Step 2: Write the failing tests**

```ts
it('drops an event for a new chart key once MAX_CHARTS_PER_DAY keys exist that day', async () => {
  const { db, days } = fakeDb();
  for (let i = 0; i < MAX_CHARTS_PER_DAY; i++) await recordEvent(db, SHOP, { e: 'open', c: `k${i}` }, DATE);
  await recordEvent(db, SHOP, { e: 'open', c: 'one-too-many' }, DATE);
  expect(days.size).toBe(MAX_CHARTS_PER_DAY);
  expect([...days.values()].some((d) => d.chartKey === 'one-too-many')).toBe(false);
});

it('keeps counting a key already seen today after the cap is reached', async () => {
  const { db, days } = fakeDb();
  for (let i = 0; i < MAX_CHARTS_PER_DAY; i++) await recordEvent(db, SHOP, { e: 'open', c: `k${i}` }, DATE);
  await recordEvent(db, SHOP, { e: 'complete', c: 'k0', s: 'M' }, DATE);
  expect(days.get(`${SHOP}|k0|${DATE}`)?.completions).toBe(1);
});

it('counts the chart-key cap per shop and per day', async () => {
  const { db, days } = fakeDb();
  for (let i = 0; i < MAX_CHARTS_PER_DAY; i++) await recordEvent(db, SHOP, { e: 'open', c: `k${i}` }, DATE);
  await recordEvent(db, 'other.myshopify.com', { e: 'open', c: 'fresh' }, DATE);
  await recordEvent(db, SHOP, { e: 'open', c: 'fresh' }, NEXT_DATE);
  expect(days.size).toBe(MAX_CHARTS_PER_DAY + 2);
});

it('drops the size row too when the chart key is over the cap', async () => {
  const { db, sizes } = fakeDb();
  for (let i = 0; i < MAX_CHARTS_PER_DAY; i++) await recordEvent(db, SHOP, { e: 'open', c: `k${i}` }, DATE);
  await recordEvent(db, SHOP, { e: 'complete', c: 'one-too-many', s: 'M' }, DATE);
  expect(sizes.size).toBe(0);
});
```

Use the file's existing shop and date constants if they exist, and add `NEXT_DATE` (the following day) if it doesn't. `fakeDb` must return `days` and `sizes` (it may already).

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run --config vitest.app.config.ts app/lib/events.server.test.ts`
Expected: the four new tests FAIL (`MAX_CHARTS_PER_DAY` not exported). Existing tests still pass.

- [ ] **Step 4: Implement the cap in `recordEvent`**

Before the `EventDaily` upsert, look up the row with `findUnique({ where: { shop_chartKey_date: day }, select: { shop: true } })`. If there is no row and `count({ where: { shop, date } }) >= MAX_CHARTS_PER_DAY`, return without writing anything, which also skips the size row. This mirrors the existing `MAX_SIZES_PER_DAY` guard. It is a soft cap: two concurrent first events may push it to 251, which is fine. Add a doc comment next to `MAX_SIZES_PER_DAY` saying why the cap exists.

- [ ] **Step 5: Run the test file and confirm it passes**

Run: `npx vitest run --config vitest.app.config.ts app/lib/events.server.test.ts`
Expected: PASS. Then run `npm run test:app` and expect all tests to PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/events.server.ts app/lib/events.server.test.ts
git commit -m "fix(events): cap distinct chart keys per shop and day"
```

---

### Task 2: Paywall in every admin loader

`app._index.tsx` and `app.analytics.tsx` call `authenticate.admin` directly. The layout loader in `app.tsx` blocks unpaid shops, but React Router runs child loaders in parallel with it, so these two still query the shop's data before the redirect wins. No data reaches the browser today, but each route should guard itself, the way every other `app.*` route already does.

**Files:**
- Modify: `app/routes/app._index.tsx:17-18`, `app/routes/app.analytics.tsx:12-13`
- Create: `app/lib/admin-routes-gate.test.ts` (lives in `app/lib` because flatRoutes treats files in `app/routes` as routes)

**Interfaces:**
- Consumes: `authenticatePro(request: Request, opts?: { fresh?: boolean }): Promise<AdminContext>` from `app/lib/gate.server.ts`. It returns the same `{ admin, session, redirect, ... }` as `authenticate.admin`.

- [ ] **Step 1: Write the failing test**

```ts
// Every embedded admin route must authenticate through the paywall, in its loader and its action.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../routes');
const routes = readdirSync(dir).filter((f) => /^app\..+\.tsx$/.test(f));

describe('admin routes', () => {
  it.each(routes)('%s authenticates only through authenticatePro', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const exported = (src.match(/export const (loader|action)\b/g) ?? []).length;
    expect(src).not.toMatch(/authenticate\.admin\(/);
    expect((src.match(/authenticatePro\(/g) ?? []).length).toBeGreaterThanOrEqual(exported);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --config vitest.app.config.ts app/lib/admin-routes-gate.test.ts`
Expected: FAIL for `app._index.tsx` and `app.analytics.tsx`. The other five PASS.

- [ ] **Step 3: Switch both loaders to `authenticatePro(request)`**

Replace the import of `authenticate` with `import { authenticatePro } from "../lib/gate.server";`. In `app._index.tsx`, keep `authenticatePro` as the first line, before the `onboardedAt` redirect, so an unpaid shop goes to the plan page rather than onboarding. Remove any imports this leaves unused.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:app && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routes/app._index.tsx app/routes/app.analytics.tsx app/lib/admin-routes-gate.test.ts
git commit -m "fix(admin): gate the home and analytics loaders on the paywall"
```

---

### Task 3: Patch vulnerable dependencies (no major upgrades)

`npm audit --omit=dev` reports 17 issues (9 high) on 2026-11-01. Fixes within range:

| Package | Vulnerable | Path | Fix |
|---|---|---|---|
| body-parser | <1.20.9 | `@react-router/serve` → express 4 | `npm audit fix` (in range) |
| vite | =6.4.4 | dev and build | devDependency `^6.4.5` |
| zod | <4.6.6 | `@vercel/functions` → oidc → cli-config | override `"zod": "^4.6.6"` |
| deepmerge-ts | <8.0.0 | `prisma` → `@prisma/config` (CLI only) | override `"deepmerge-ts": "^8.0.2"`, kept only if Step 4 passes |

Accepted with no fix available: `ajv` (<8.18) and `minimatch` (<11.0.1) inside build tooling (`ts-morph`, `@react-router/fs-routes`). Neither runs on a merchant request.

**Files:**
- Modify: `package.json` (`devDependencies.vite`, `overrides`), `package-lock.json`

- [ ] **Step 1: Record the baseline**

Run: `npm audit --omit=dev | tail -3`
Expected: `17 vulnerabilities (8 moderate, 9 high)`.

- [ ] **Step 2: Apply the in-range fixes**

Set `devDependencies.vite` to `^6.4.5`. Add `"zod": "^4.6.6"` and `"deepmerge-ts": "^8.0.2"` to `overrides`, next to the existing `p-map` and `qs` entries. Then run `npm install` followed by `npm audit fix` (never with `--force`).

- [ ] **Step 3: Check the audit**

Run: `npm audit --omit=dev`
Expected: no `high` entries. Only moderate `ajv` and `minimatch` (and the packages that depend on them) remain.

- [ ] **Step 4: Check that the build tooling still works under the overrides**

Run: `DATABASE_URL=postgresql://x:x@localhost:5432/x DATABASE_URL_UNPOOLED=postgresql://x:x@localhost:5432/x npx prisma validate && npx prisma generate && npm run build`
Expected: all three succeed. If `prisma` fails because of `deepmerge-ts` 8, remove that override, run `npm install`, and add it to the accepted list in the commit message (CLI-only, never on a request path).

- [ ] **Step 5: Run the full check suite** (see Global Constraints). Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): patch body-parser, vite, zod and deepmerge-ts advisories"
```

---

### Task 4: ESLint 8 → 9 with a flat config

ESLint 8 is end of life. Target ESLint 9, not 10, because `eslint-plugin-import` and `eslint-plugin-jsx-a11y` support 9 today. Keep the same rule set. This is a dev-only change.

**Files:**
- Delete: `.eslintrc.cjs`, `.eslintignore`
- Create: `eslint.config.js`
- Modify: `package.json` (`devDependencies`, `scripts.lint`), `package-lock.json`

- [ ] **Step 1: Swap the dev dependencies**

Remove `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` and `@types/eslint`. Add `eslint@^9`, `@eslint/js@^9`, `typescript-eslint@^8`, `globals` and `eslint-plugin-react-hooks@^7`. Keep `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react` and `eslint-import-resolver-typescript`.

- [ ] **Step 2: Write `eslint.config.js`** with the same structure as `.eslintrc.cjs`, in this order:
  - `ignores`: `build/`, `public/build/`, `.shopify/`, `extensions/true-size-chart/assets/`, `**/*.yml`
  - `js.configs.recommended`, with globals `browser` and `es2021` plus `shopify: "readonly"`
  - React for `**/*.{js,jsx,ts,tsx}`: `react.configs.flat.recommended`, `react.configs.flat["jsx-runtime"]`, `jsxA11y.flatConfigs.recommended`. Settings `react.version: "detect"`, `formComponents`, `linkComponents` copied from the old file. The rule `react/no-unknown-property: ["error", { ignore: ["variant"] }]`.
  - React hooks: enable only `react-hooks/rules-of-hooks: "error"` and `react-hooks/exhaustive-deps: "warn"`. These match v4's recommended set; v7's full recommended adds compiler rules, which are out of scope.
  - TypeScript for `**/*.{ts,tsx}`: `tseslint.configs.recommended`, `importPlugin.flatConfigs.recommended`, `importPlugin.flatConfigs.typescript`, with the `import/internal-regex` and `import/resolver` settings copied from the old file.
  - Node globals for `vite.config.{js,ts}`, `.graphqlrc.{js,ts}`, `eslint.config.js`, `**/*.server.{js,ts}`.

- [ ] **Step 3: Update the script**

`"lint": "eslint --cache --cache-location ./node_modules/.cache/eslint ."`. The `--ignore-path` flag is gone in v9, and ignores now live in the config. `node_modules` is ignored by default.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: exit 0. Fix only findings that come from renamed or stricter rules in `typescript-eslint@8` (for example `no-unused-expressions`). Don't silence them with disable comments unless the rule is wrong for that line, and say why in the comment.

- [ ] **Step 5: Prove coverage did not shrink**

Temporarily add `const unusedProbe = 1;` to `app/lib/events.ts`, `packages/engine/src/index.ts` and `packages/storefront/src/index.ts`. Run `npm run lint`. Expected: three `no-unused-vars` errors, one per file. Revert the three lines and run `npm run lint` again (expect exit 0).

- [ ] **Step 6: Run the full check suite**, then commit:

```bash
git add -A eslint.config.js .eslintrc.cjs .eslintignore package.json package-lock.json
git commit -m "chore(lint): move to ESLint 9 with a flat config"
```

---

### Task 5 (manual, owner): Confirm billing in the Partner Dashboard

Billing can't be verified from code. In Partner Dashboard → Apps → True: Size Chart → Pricing:

- [ ] The plans and prices match `docs/launch/listing.md` → Pricing details. (The paywall treats any active subscription as paid and only records the plan handle, so handle names are free to change.)
- [ ] The free-trial length matches the listing.
- [ ] On the `ui-testing` dev store: install, decline the charge (expect to land back on the plan page, no error), then approve it (expect to reach the app home), uninstall and reinstall (expect to be asked to choose a plan again, then to reach onboarding).
- [ ] If the store offers more than one plan, switch plans from the plan page without contacting support (requirement 1.2.3).

---

## Order and merge

Tasks 1–4 touch separate files and can be done in any order. Task 3 and Task 4 both edit `package.json` and `package-lock.json`, so run them one after the other, not in parallel. Merge `plan-6-audit-fixes` to `main` after App Store approval, then watch `/healthz` and Vercel runtime errors for a day.
