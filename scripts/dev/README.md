# Dev seed: one size chart on one product

Run with `shopify app dev` already running against your dev store (it creates the `$app:size_chart` definitions). Replace `STORE` with the dev store domain, e.g. `my-dev-store.myshopify.com`.

1. Find a product:
   ```bash
   shopify app execute --store STORE --query-file scripts/dev/first-product.graphql
   ```
2. Create or update the dev chart (S–XL subset of the engine's `TSHIRT_UNISEX` template):
   ```bash
   shopify app execute --store STORE --query-file scripts/dev/seed-chart.graphql --variable-file scripts/dev/seed-chart.variables.json
   ```
3. Link it to the product. Put the two ids from steps 1 and 2 into `scripts/dev/link-chart.variables.json` as `{ "productId": "gid://shopify/Product/…", "chartId": "gid://shopify/Metaobject/…" }` (git-ignored), then:
   ```bash
   shopify app execute --store STORE --query-file scripts/dev/link-chart.graphql --variable-file scripts/dev/link-chart.variables.json
   ```
