import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData, useParams, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { TEMPLATES, type Dim } from "@true-size-chart/engine";
import { authenticate } from "../shopify.server";
import { getChart, saveChart } from "../lib/charts.server";
import {
  blankDraft,
  convertUnit,
  draftFromTemplate,
  validateDraft,
  type ChartDraft,
} from "../lib/chart-model";
import {
  addDim,
  addSize,
  availableDims,
  cellText,
  draftKey,
  parseDraftBody,
  removeDim,
  removeSize,
  setCell,
  setSizeLabel,
} from "../lib/chart-edit";
import { parsePastedTable } from "../lib/paste";

const BASIS_LABELS: Record<ChartDraft["basis"], string> = {
  garment_flat: "Garment, flat",
  garment_circ: "Garment, all the way around",
  body: "Body",
};
const DIM_LABELS: Record<Dim, string> = {
  chest: "Chest",
  waist: "Waist",
  hip: "Hips",
  length: "Length",
  inseam: "Inseam",
};
const CATEGORY_LABELS: Record<ChartDraft["category"], string> = {
  tshirt: "T-shirt",
  shirt: "Shirt",
  hoodie: "Hoodie",
  jacket: "Jacket",
  dress: "Dress",
  pants: "Pants",
  shorts: "Shorts",
  skirt: "Skirt",
};
const AUDIENCE_LABELS: Record<ChartDraft["audience"], string> = {
  women: "Women",
  men: "Men",
  unisex: "Unisex",
};
const FIT_LABELS: Record<ChartDraft["intendedFit"], string> = {
  slim: "Slim",
  regular: "Regular",
  oversized: "Oversized",
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  if (params.handle === "new") {
    const key = new URL(request.url).searchParams.get("template");
    const template = key ? TEMPLATES.find((t) => t.key === key) : undefined;
    return { draft: template ? draftFromTemplate(template) : blankDraft() };
  }
  const draft = await getChart(admin, params.handle ?? "");
  if (!draft) throw new Response("Chart not found", { status: 404 });
  return { draft };
};

type ActionResult = { saved: boolean; errors: string[]; draft?: ChartDraft };

export const action = async ({ request, params }: ActionFunctionArgs): Promise<ActionResult | Response> => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  let draft = parseDraftBody(String(form.get("draft") ?? ""));
  if (!draft) return { saved: false, errors: ["The chart could not be read. Reload the page and try again."] };
  // The route decides which chart this is; the client cannot retarget a save.
  if (params.handle === "new") draft = { ...draft, id: null, handle: null };
  else draft = { ...draft, handle: params.handle ?? null };

  const result = await saveChart(admin, draft);
  if (!result.ok) return { saved: false, errors: result.errors };
  if (params.handle === "new") return redirect(`/app/charts/${result.draft.handle}`);
  return { saved: true, errors: [], draft: result.draft };
};

export default function ChartEditorRoute() {
  const { handle } = useParams();
  const [search] = useSearchParams();
  // Re-seed the draft when navigating between charts or templates.
  return <ChartEditor key={`${handle}:${search.get("template") ?? ""}`} />;
}

function ChartEditor() {
  const shopify = useAppBridge();
  const { handle } = useParams();
  const { draft: loaded } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [draft, setDraft] = useState<ChartDraft>(loaded);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const modalRef = useRef<HTMLElementTagNameMap["s-modal"]>(null);

  const saving = fetcher.state !== "idle";
  const result = fetcher.data && "errors" in fetcher.data ? fetcher.data : null;
  const serverErrors = result?.errors ?? [];
  const justSaved = result?.saved === true && !saving;
  const { warnings } = validateDraft(draft);
  const dirty = handle === "new" || draftKey(draft) !== draftKey(loaded);

  const save = () => {
    if (saving) return;
    fetcher.submit({ draft: JSON.stringify(draft) }, { method: "post" });
  };
  const discard = () => {
    setDraft(loaded);
    setPasteNote(null);
  };

  useEffect(() => {
    void (dirty ? shopify?.saveBar.show("chart-save-bar") : shopify?.saveBar.hide("chart-save-bar"));
  }, [dirty, shopify]);

  // Leaving the editor must not leave the bar up.
  useEffect(() => () => void shopify?.saveBar.hide("chart-save-bar"), [shopify]);

  // After a successful save, the saved chart is the new baseline.
  const savedDraft = result?.saved ? result.draft : undefined;
  useEffect(() => {
    if (savedDraft) setDraft(savedDraft);
  }, [savedDraft]);

  const update = (patch: Partial<ChartDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateTable = (fn: (t: ChartDraft["table"]) => ChartDraft["table"]) =>
    setDraft((d) => ({ ...d, table: fn(d.table) }));

  const dims = (Object.keys(DIM_LABELS) as Dim[]).filter((d) => draft.table.measurements[d]);
  const addable = availableDims(draft.table);

  const importPaste = () => {
    const r = parsePastedTable(pasteText);
    if (!r.ok) {
      setPasteError(r.error);
      return;
    }
    updateTable(() => r.table);
    setPasteNote(r.ignored.length > 0 ? `Ignored columns: ${r.ignored.join(", ")}.` : "Table imported.");
    setPasteError(null);
    setPasteText("");
    modalRef.current?.hideOverlay();
  };

  return (
    <s-page heading={draft.name.trim() || "New size chart"}>
      <s-link slot="breadcrumb-actions" href="/app/charts">
        Size charts
      </s-link>

      <ui-save-bar id="chart-save-bar">
        <button variant="primary" onClick={save}>
          Save
        </button>
        <button onClick={discard}>Discard</button>
      </ui-save-bar>
      <s-button slot="primary-action" variant="primary" disabled={!dirty || saving} loading={saving} onClick={save}>
        Save
      </s-button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <s-grid gridTemplateColumns="@container (inline-size > 1000px) 2fr 1fr, 1fr" gap="base">
          <s-stack gap="base">
            {serverErrors.length > 0 ? (
              <s-banner tone="critical" heading="The chart was not saved">
                <s-unordered-list>
                  {serverErrors.map((m) => (
                    <s-list-item key={m}>{m}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-banner>
            ) : null}
            {justSaved ? <s-banner tone="success">Chart saved.</s-banner> : null}
            {warnings.length > 0 ? (
              <s-banner tone="warning">
                <s-unordered-list>
                  {warnings.map((m) => (
                    <s-list-item key={m}>{m}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-banner>
            ) : null}

            <s-section heading="Details">
              <s-stack gap="base">
                <s-text-field
                  label="Name"
                  name="name"
                  value={draft.name}
                  onInput={(e) => update({ name: e.currentTarget.value })}
                ></s-text-field>
                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                  <s-select
                    label="Category"
                    name="category"
                    value={draft.category}
                    onChange={(e) => update({ category: e.currentTarget.value as ChartDraft["category"] })}
                  >
                    {(Object.keys(CATEGORY_LABELS) as ChartDraft["category"][]).map((c) => (
                      <s-option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label="Audience"
                    name="audience"
                    value={draft.audience}
                    onChange={(e) => update({ audience: e.currentTarget.value as ChartDraft["audience"] })}
                  >
                    {(Object.keys(AUDIENCE_LABELS) as ChartDraft["audience"][]).map((a) => (
                      <s-option key={a} value={a}>
                        {AUDIENCE_LABELS[a]}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label="Intended fit"
                    name="intendedFit"
                    value={draft.intendedFit}
                    onChange={(e) => update({ intendedFit: e.currentTarget.value as ChartDraft["intendedFit"] })}
                  >
                    {(Object.keys(FIT_LABELS) as ChartDraft["intendedFit"][]).map((f) => (
                      <s-option key={f} value={f}>
                        {FIT_LABELS[f]}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label="Measured as"
                    name="basis"
                    value={draft.basis}
                    onChange={(e) => update({ basis: e.currentTarget.value as ChartDraft["basis"] })}
                  >
                    {(Object.keys(BASIS_LABELS) as ChartDraft["basis"][]).map((b) => (
                      <s-option key={b} value={b}>
                        {BASIS_LABELS[b]}
                      </s-option>
                    ))}
                  </s-select>
                </s-grid>
                <s-select
                  label="Unit"
                  name="unit"
                  value={draft.unit}
                  onChange={(e) => setDraft((d) => convertUnit(d, e.currentTarget.value as "cm" | "in"))}
                >
                  <s-option value="cm">Centimeters (cm)</s-option>
                  <s-option value="in">Inches (in)</s-option>
                </s-select>
              </s-stack>
            </s-section>

            <s-section heading="Measurements">
              <s-stack gap="base">
                {pasteNote ? (
                  <s-banner tone="info" dismissible onDismiss={() => setPasteNote(null)}>
                    {pasteNote}
                  </s-banner>
                ) : null}
                <s-stack direction="inline" gap="small-200" alignItems="end">
                  <s-button type="button" commandFor="paste-modal" command="--show">
                    Paste from spreadsheet
                  </s-button>
                  <s-button type="button" onClick={() => updateTable(addSize)}>
                    Add size
                  </s-button>
                  {addable.length > 0 ? (
                    <s-select
                      label="Add measurement"
                      labelAccessibilityVisibility="exclusive"
                      placeholder="Add measurement"
                      value=""
                      onChange={(e) => {
                        const dim = e.currentTarget.value as Dim;
                        if (dim) updateTable((t) => addDim(t, dim));
                        e.currentTarget.value = "";
                      }}
                    >
                      {addable.map((d) => (
                        <s-option key={d} value={d}>
                          {DIM_LABELS[d]}
                        </s-option>
                      ))}
                    </s-select>
                  ) : null}
                </s-stack>

                <s-table>
                  <s-table-header-row>
                    <s-table-header listSlot="primary">Size</s-table-header>
                    {dims.map((d) => (
                      <s-table-header key={d}>
                        <s-stack direction="inline" gap="small-300" alignItems="center">
                          <s-text>
                            {DIM_LABELS[d]} ({draft.unit})
                          </s-text>
                          <s-button
                            type="button"
                            variant="tertiary"
                            tone="critical"
                            accessibilityLabel={`Remove ${DIM_LABELS[d]} column`}
                            onClick={() => updateTable((t) => removeDim(t, d))}
                          >
                            Remove
                          </s-button>
                        </s-stack>
                      </s-table-header>
                    ))}
                    <s-table-header>Actions</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {draft.table.sizes.map((size, i) => (
                      <s-table-row key={i}>
                        <s-table-cell>
                          <s-text-field
                            label={`Size ${i + 1}`}
                            labelAccessibilityVisibility="exclusive"
                            value={size}
                            onInput={(e) => updateTable((t) => setSizeLabel(t, i, e.currentTarget.value))}
                          ></s-text-field>
                        </s-table-cell>
                        {dims.map((d) => (
                          <s-table-cell key={d}>
                            <s-number-field
                              label={`${size || `Size ${i + 1}`} ${DIM_LABELS[d]}`}
                              labelAccessibilityVisibility="exclusive"
                              min={0}
                              step={0.5}
                              value={cellText(draft.table.measurements[d]?.[i])}
                              onInput={(e) => updateTable((t) => setCell(t, d, i, e.currentTarget.value))}
                            ></s-number-field>
                          </s-table-cell>
                        ))}
                        <s-table-cell>
                          <s-button
                            type="button"
                            variant="tertiary"
                            tone="critical"
                            accessibilityLabel={`Remove size ${size || i + 1}`}
                            onClick={() => updateTable((t) => removeSize(t, i))}
                          >
                            Remove
                          </s-button>
                        </s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              </s-stack>
            </s-section>

            <s-section heading="How to measure">
              <s-text-area
                label="Instructions shoppers see next to the chart"
                name="howToMeasure"
                rows={4}
                value={draft.howToMeasure}
                onInput={(e) => update({ howToMeasure: e.currentTarget.value })}
              ></s-text-area>
            </s-section>
          </s-stack>

          {/* Task 8 replaces this section with <ChartPreview>. */}
          <s-section heading="Preview">
            <s-paragraph>Preview arrives in the next step.</s-paragraph>
          </s-section>
        </s-grid>
      </form>

      <s-modal ref={modalRef} id="paste-modal" heading="Paste from spreadsheet">
        <s-stack gap="base">
          {pasteError ? <s-banner tone="critical">{pasteError}</s-banner> : null}
          <s-paragraph>
            Copy your table from Excel or Google Sheets, including the header row (Size, Chest, Waist, Hips, Length,
            Inseam), and paste it below. This replaces the current table.
          </s-paragraph>
          <s-text-area
            label="Table"
            rows={8}
            value={pasteText}
            onInput={(e) => setPasteText(e.currentTarget.value)}
          ></s-text-area>
        </s-stack>
        <s-button slot="secondary-actions" commandFor="paste-modal" command="--hide">
          Cancel
        </s-button>
        <s-button slot="primary-action" variant="primary" onClick={importPaste}>
          Import table
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
