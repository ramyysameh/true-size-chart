# App Store listing: True: Size Chart

Ready to paste into Partner Dashboard → Apps → True: Size Chart → Distribution → Shopify App Store listing. Every field follows App Store requirements 4.1–4.4:
- No statistics, guarantees, or "best", "first" or "only".
- No prices outside Pricing details.
- No Shopify trademarks in the images.

Check each field against the form's character counter when pasting.

## Basic app information

- **App name:** True: Size Chart (matches `name` in `shopify.app.toml`, requirement 4.1.1)
- **App icon:** `docs/launch/assets/icon-1200.png` (1200 × 1200 PNG, no text, no Shopify marks)
- **Primary language:** English
- **Category (proposed, confirm in the form):** Store design › Product display
- **Tags:** size chart, size guide, size finder, fit, apparel
- **Languages:** English only (4.3.2)
- **Sales channel requirement:** Merchant must have online store (4.3.1)
- **Geographic requirements:** none

## App card subtitle

> Size finder that turns height and weight into one clear size

## App introduction (≤ 100 characters)

> Shoppers find their size in two steps and add it to the bag with confidence.

## App details

> True: Size Chart adds a size finder to your product pages. A shopper sets their height and weight, picks their body shape and how they like clothes to fit, and gets one recommended size with how it fits at the chest, waist and hips. A size chart tab shows the classic table in cm or inches, with how-to-measure notes, for shoppers who want the numbers.
>
> Setup takes a few minutes. Start from garment templates, adjust the numbers or paste them from a spreadsheet, and assign charts by product, collection, type, vendor or tag, so new products get the right chart on their own. A size mapping check finds variants whose sizes don't match the chart.
>
> The finder loads only when a shopper opens it, and shoppers' measurements stay on their own device. Anonymous counts of finder use appear in the app.

## Feature list

- Size finder with one recommended size and a per-area fit
- Size chart tab in cm or inches with how-to-measure notes
- Garment templates and spreadsheet paste for charts
- Assignment rules by product, collection, type, vendor or tag
- Size mapping check for variant names
- Finder analytics: opens, completions and add-to-bag
- Theme app blocks, no theme code to edit
- Measurements stay on the shopper's device

## Pricing details

Must match the plan configured in Plan 4 (Partner Dashboard → Pricing content). Check it there before submitting.

- **Plan display name:** Pro
- **Plan description:** Everything in True: Size Chart: unlimited size charts, the size finder on product pages, assignment rules, size mapping check and finder analytics.
- **Price:** $9.99 every 30 days, or $99 per year
- **Free trial:** 14 days
- **Top features:** Unlimited size charts · Size finder on product pages · Assignment rules · Size mapping check · Finder analytics

## Support and policies

- **Privacy policy URL:** https://true-size-chart.onrender.com/privacy
- **Support email:** zendolabs@gmail.com (`app/lib/brand.ts`)
- **API contact email (app settings):** zendolabs@gmail.com (it must not contain "shopify")
- **Emergency developer contact:** set by the user in Partner account settings (an email and phone number)

## Media

Screenshots are 1600 × 900, unique, real UI and without browser chrome (4.4.4, 4.4.5). They are taken during the live session and stored in `docs/launch/assets/screens/`.

| File | Alt text |
|---|---|
| `01-finder-result.png` | The size finder's result: recommended size L with a fit match and snug, ideal or roomy per area |
| `02-finder-mobile.png` | The size finder as a bottom sheet on a phone, at the height and weight step |
| `03-chart-editor.png` | The chart editor with sizes and measurements beside a live preview of the finder |
| `04-assignments.png` | Assignment rules that map charts to collections and product types |
| `05-analytics.png` | Finder analytics with opens, completions, add-to-bag and recommended sizes per chart |

**Feature image (optional, 1600 × 900):** the finder result on a plain background, with no text overlay.

## Testing instructions for reviewers

1. Install the app from the listing. You land on Shopify's plan page: choose **Pro** (the 14-day trial starts; test charges apply on development stores).
2. The app opens to onboarding. Step 1: pick T-shirt and Pants. Step 2: review the generated charts. Step 3: assign T-shirt to a collection. Step 4: use **Turn on the app embed** and **Add the button to your product page** to open the theme editor with the app embed enabled and the "Find my size" block added, save the theme, then click **Finish**.
3. Open a product in that collection on the storefront and click **Find my size**. Set height and weight, continue through shape and fit, and see the recommended size. Click **Add … to bag**.
4. Back in the app, Home shows the setup checklist as done, and **Analytics** shows the finder open, completion and add-to-bag.
5. Demo store: `ui-testing-em0ppgsc.myshopify.com`, product `/products/tsc-test-tee`. Storefront password: _(the user fills this in)_.

## Demo screencast script (English, 2–3 min)

1. (0:00) App listing → install → plan page → Pro.
2. (0:20) Onboarding steps 1–4, including the theme editor deep links.
3. (1:00) Storefront product page → Find my size → result → add to bag.
4. (1:40) The size chart tab with the cm/in switch.
5. (2:00) Admin: chart editor with live preview, assignment rules, Analytics.
