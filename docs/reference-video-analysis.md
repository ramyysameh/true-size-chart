# Reference video analysis — "Size Chart in 2027" size finder

Source: `D:\Downloads\Size chart game has been updated...mp4` (19.15 s, 720×1280, 30 fps, about 575 frames).
Method: frames sampled at 3 fps (57 frames, timestamped), plus full-resolution crops of each screen to read the text.
Context: a phone recording of a desktop browser (Safari-style toolbar) on a storefront product page for **"T-SHIRT DROP 2 — $49.00"**. The size finder opens as a **right-side drawer** on top of the blurred product page.

Legend: **Observed** = visible in the frames. *Inferred* = my reading of the behavior, not directly shown.

---

## 1. Timeline

| Time | What happens |
|---|---|
| 0.0–1.0 s | Drawer is open on Step 1. Male is selected. Height is 180 cm, weight 89 kg, live estimate **L**. |
| 1.0–2.6 s | The height slider is dragged 180 → 182 → 184 → 185 → 186. The estimate changes **L → XL at 185 cm**. |
| 3.3–5.7 s | The weight slider is dragged 89 → 100 → 133 → 150 → 43 → 40. The estimate goes **XL → S** at 43/40 kg. |
| 5.7–9.7 s | Weight is dragged back 142 → 127 → 118 → 104 → 93 → 90 → 92. The estimate stays **XL**. |
| 10.0–11.3 s | The page scrolls down and a **CONTINUE →** button appears at the bottom of the drawer. |
| 11.6–14.3 s | Step 2, **Your Shape**. Every option is left on Average. The cursor hovers, then CONTINUE is clicked. |
| 14.6–16.0 s | Step 3, **How do you like it to fit?** Regular is selected. **FIND MY SIZE →** is clicked. |
| 16.3–16.7 s | Crossfade to the result. A circular ring draws around **XL** and the match % counts up (**73% → 92%**). The **ADD XL TO BAG** button appears. |
| 17.0–18.7 s | The result screen holds still. The cursor hovers over the S / M / L / XL row. |

---

## 2. Screens and exact copy

### Drawer chrome (all steps)
- Header: `FIND YOUR PERFECT SIZE` (small, widely tracked caps), with a close `×` at top right.
- Product card: thumbnail, `T-SHIRT DROP 2`, `$49.00` on a light grey panel.
- Progress: a segmented bar of **3 segments** that fill as you advance, plus a counter `01 / 03`.
- Footer: a square **←** back button (from step 2 on) and a full-width black primary button.

### Step 1 — `LET'S FIND YOUR FIT`
- Subtitle: `Two measurements are all it takes. Drag to adjust.`
- `SIZING` segmented toggle: `FEMALE` | `MALE` (selected = solid black).
- Body silhouette on the left. A dotted horizontal line marks the top of the head (a height guide). *Inferred: the figure scales with height.*
- `HEIGHT`: large number + unit (`180 cm`), unit toggle `CM | FT/IN`, slider with `−` and `+` steppers.
- `WEIGHT`: `89 kg`, unit toggle `KG | LBS`, slider with `−` / `+`.
- `LIVE ESTIMATE` / `Refined in the next steps`, with a large size letter on the right that **updates while dragging**.
- Privacy line with lock icon: `Saved privately on this device, so every piece shows your size.`
- CTA: `CONTINUE →`

### Step 2 — `YOUR SHAPE`
- Subtitle: `Clothes fit bodies, not numbers. Not sure? Leave it at average.`
- Three rows, each with 3 line-icon tiles. The selected tile has a grey fill and bold label:
  - `CHEST`: `SLIMMER` · **`AVERAGE`** · `BROADER`
  - `STOMACH`: `FLATTER` · **`AVERAGE`** · `ROUNDER`
  - `HIPS`: `NARROWER` · **`AVERAGE`** · `FULLER`
- Defaults: all three are Average.
- CTA: `←` + `CONTINUE →`

### Step 3 — `HOW DO YOU LIKE IT TO FIT?`
- Subtitle: `We will size around the way you wear it.`
- A list of 3 rows, each with a garment silhouette icon, a title and a description. The selected row has a grey fill and a filled dot on the right.
  - `SLIM`: `Follows the body. Sharp and tailored.`
  - **`REGULAR`**: `The silhouette the designer intended.` (default)
  - `RELAXED`: `Room to move and layer underneath.`
- CTA: `←` + `FIND MY SIZE →`

### Result — Best match
- `BEST MATCH` label above a large thin **ring** with the size in the middle (`XL`). The ring is a progress arc that animates in.
- `92% FIT MATCH` (counts up), then `A confident match for your measurements.`
- Size switcher `S  M  L  XL`. The recommended size is underlined and has a `YOU` dot marker above it. Below: `Tap a size to see how it would fit.`
- A fit breakdown with a 3-point scale `SNUG · IDEAL · ROOMY` and one dot per row:
  - `CHEST` → Ideal · `WAIST` → Ideal · `LENGTH` → Ideal (the dot sits slightly toward Roomy)
- `FIT NOTE` box: `Against your measurements this piece fits true to size.`
- Disclaimer: `This is a general recommendation. Individual fit may vary by style and preference.`
- CTA: **`ADD XL TO BAG`**. The size inside the label is dynamic and bold.
- Two small text links sit under the CTA. They are **too blurry to read**. *Inferred: something like "select size" / "edit details".*

---

## 3. Recommendation behavior seen in the video (male, Regular, all Average)

| Height (cm) | Weight (kg) | Live estimate |
|---|---|---|
| 180 | 89 | L |
| 182 / 184 | 89 | L |
| 185 / 186 | 89 | XL |
| 186 | 90–150 | XL |
| 186 | 43 / 40 | S |
| 186 | 92 (final) | **XL, 92% match** |

Observations:
- The estimate reacts to both inputs in real time.
- Height alone pushes the size up (the L/XL boundary is between 184 and 185 cm at 89 kg). *Inferred: length is part of the score, not just girth.*
- Very low weight at 186 cm gives S, not M. *Inferred: girth (chest/waist) dominates once weight is extreme.*
- XL is the largest size offered, so everything heavier stays clamped at XL. The video never shows a "sizes run out" message.
- Slider ranges seen: weight 40–150 kg, height at least 180–186 cm.

---

## 4. Visual and motion language

- Monochrome editorial look: off-white background, black type, light grey (#e9e9e9-ish) selected states. There is no accent color in the drawer. (The store's lime green appears only on the page behind it.)
- Type is a neo-grotesk sans. Labels are small, uppercase and widely tracked. Headings are medium-weight uppercase. Numbers are very large and light.
- Line icons are thin, single-stroke and minimal (chest cups, stomach curves, hip curves, garment outlines).
- Sliders use a hollow circular thumb on an invisible or very thin track, with `−` / `+` at the ends.
- Motion: the live estimate letter swaps instantly, the step change is a short slide/fade, and the result crossfades in, then the ring draws and the % counts up.
- The drawer is about 40% of the viewport width on desktop, full height, with the page behind dimmed and blurred.

---

## 5. How this maps to a Shopify app ("True: Size Chart")

| Feature in video | Shopify building block |
|---|---|
| "Find my size" entry + drawer on PDP | **Theme app extension**: an app block (button near the variant picker) + an app embed (the drawer/modal, loaded once) |
| Product thumbnail, title, price in drawer | Liquid `product` object passed to the block |
| Per-product size chart (garment cm per size) | **Metaobject** `size_chart` (sizes × measurements: chest, waist, hip, length), linked from a **product metafield**, or assigned by collection/tag in admin |
| Fit preference (Slim/Regular/Relaxed) | Ease values (extra cm over body) stored per chart / per garment category |
| Live estimate + final result | Client-side JS scoring (no network needed, so it is instant) |
| "Saved privately on this device" | `localStorage` profile (sex, height, weight, shape, fit pref). It pre-fills every PDP and shows a "Your size: XL" badge |
| `ADD XL TO BAG` | Map the size → the variant with that option value, then `POST /cart/add.js`. Respect sold-out variants |
| Merchant setup | Embedded admin app (Polaris): chart builder, unit settings, assign charts, preview, styling (fonts/colors to match theme) |
| Optional analytics | App proxy endpoint: finder opens, completions, recommended vs. purchased size (useful later for return-rate claims) |

### Scoring sketch (my own design, not observed)
1. Estimate body chest, waist, hip and torso length from sex, height and weight (anthropometric regression), then shift each by about ±4–6% for Slimmer/Broader, Flatter/Rounder and Narrower/Fuller.
2. Target garment measurement = body + ease(fit preference, garment type).
3. For each size, compute a normalized difference per dimension. Label it snug/ideal/roomy, using the sign and size of the difference for the dot position.
4. Pick the size with the lowest weighted error. Fit match % = a mapping from that error (e.g. 100 − k·error, clamped to about 60–98).
5. Fit note: "true to size" / "runs small, consider sizing up" based on the chart's offset versus the population average.

---

## 6. Gaps / unknowns
- The female flow and the FT/IN and LBS unit modes are never shown.
- The result screen's two secondary links can't be read.
- No mobile layout is shown. *Inferred: a bottom sheet on mobile.*
- It is not shown whether "every piece shows your size" means a badge on the PDP or on collection cards.
- It is not shown what happens when the best size is out of stock or past the end of the chart.
- No brand or app name is visible, so the vendor can't be identified from the video.
