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

## Apparel test product

A sellable product to exercise the finder: "TSC Test Tee" (`/products/tsc-test-tee`), Size `S,M,L,XL` × Color `Black,White`, 49.00. Black/XL is tracked at 0 stock (sold out), every other variant is untracked and always available.

```bash
shopify app execute --store STORE --query-file scripts/dev/seed-apparel-product.graphql --variable-file scripts/dev/seed-apparel-product.variables.json
```

The mutation is a `productSet`, so re-running it updates the product in place only if you add its `id` to `input`; to avoid duplicates look up `productByIdentifier(identifier: { handle: "tsc-test-tee" })` first. Link `dev-tshirt-unisex` to it with the link step above (look the chart id up with `metaobjectByHandle(handle: { type: "$app:size_chart", handle: "dev-tshirt-unisex" })`).

Then, in the admin, make the product available on the **Online Store** channel.

## Verify the finder

1. `shopify app dev`. In the theme editor of the App Ext. Host theme enable the "True: Size Chart" embed and add the "Find my size" block to the product template next to the variant picker.
2. Open `/products/tsc-test-tee` (enter the store password if asked). Before any interaction there is no `tsc-finder` request; hovering the button loads both assets.
3. Male 180/89, Continue, Continue, Find my size gives a result. With Black selected the CTA offers the next size and the sold-out note; with White it offers the recommended size.
4. Reload: the button reads `Your size: <size>`. `Clear my data` resets it.
5. `/products/the-videographer-snowboard` (no chart) has no button and no `#tsc-config`.

## Lighthouse delta

The finder must cost at most 3 Lighthouse points on the product page. Unlock the store in a browser, copy the `storefront_digest` cookie value, then:

```bash
export TSC_LH_COOKIE=<storefront_digest value>          # bash
# PowerShell: $env:TSC_LH_COOKIE = "<storefront_digest value>"
node scripts/perf/lighthouse.mjs --url https://STORE/products/tsc-test-tee --label on    # embed and block enabled
# disable the embed and remove the block, then:
node scripts/perf/lighthouse.mjs --url https://STORE/products/tsc-test-tee --label off
node scripts/perf/lighthouse.mjs --compare off on                                         # exit 1 when off - on > 3
```

Without the cookie, run Lighthouse inside a separate Chrome instead. Start one with its own profile and a debugging port (not 9222, which a normal Chrome may already hold), unlock the store in it, keep it open, and pass `--port`. Background throttling must be off or Lighthouse times out:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9333 --user-data-dir="$env:TEMP\tsc-lh-profile" --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling https://STORE/password
node scripts/perf/lighthouse.mjs --url https://STORE/products/tsc-test-tee --label on --port 9333
```

Each run takes the median of 5 mobile Lighthouse runs (`--runs` to change) and writes `scripts/perf/results/<label>.json` (git-ignored). A single Lighthouse run is noisy by ±3–5 points, as much as the whole budget, so keep `--runs` at 5 or more. Re-enable the embed and block afterwards.
