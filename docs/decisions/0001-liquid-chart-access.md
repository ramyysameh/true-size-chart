# ADR 0001 — Reading the size chart in the theme app extension

Date: 2026-10-18 · Status: accepted (verified on dev store `ui-testing-em0ppgsc`)

## Decision

The storefront reads the product's chart with Liquid alone, through the app-owned product metafield that references the app-owned metaobject:

```liquid
{%- assign chart = product.metafields['$app'].size_chart.value -%}
{{ chart.table.value | json }}   {%- comment -%} json field → object {%- endcomment -%}
{{ chart.intended_fit.value | json }}
```

- `'$app'` is the reserved prefix. Shopify resolves it to the app's own namespace (`app--436937687041` on this dev app), so no app id is hard-coded and the same code works in every environment.
- `.value` on a `metaobject_reference` metafield returns the metaobject. Each field is read as `chart.<field_key>.value`, and the `json` field comes back as an object that `| json` serializes correctly.
- The metaobject's `access.storefront` setting does not affect Liquid. It only governs the Storefront API.

The fallback in the spec (storing the whole chart as a product `json` metafield) is **not needed**.

## Evidence

`extensions/true-size-chart/blocks/tsc-embed.liquid`, previewed with `shopify app dev` (App Ext. Host theme, embed enabled):

| Page | Result |
|---|---|
| `/products/the-complete-snowboard` (chart linked) | `#tsc-config` present; `chart.table.sizes` = `["S","M","L","XL"]`, all fields populated |
| `/products/the-videographer-snowboard` (no chart) | no `#tsc-config` |
| `/` (home) | no `#tsc-config` |

A temporary debug comment showed `product.metafields['$app'].size_chart.type` and `product.metafields['app--436937687041'].size_chart.type` both as `metaobject_reference`, which confirms the prefix resolves.

## Notes for Plan 2

- App embeds are **off by default per theme**. The CLI's "App Ext. Host" dev theme and the live theme each need the embed switched on. Onboarding must deep-link merchants to App embeds (`/admin/themes/current/editor?context=apps`).
- The dev store has no apparel products. Plan 2 should seed a sized apparel product.
