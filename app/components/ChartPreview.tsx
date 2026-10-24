import { useEffect, useMemo, useState } from "react";
import { validateDraft, type ChartDraft } from "../lib/chart-model";
import { previewConfig, previewDocument } from "../lib/preview";

const DEBOUNCE_MS = 400;
// Served by app/routes/preview-assets.$name.tsx from the committed theme-extension bundle.
const finderJs = "/preview-assets/tsc-finder.js";
const finderCss = "/preview-assets/tsc-finder.css";

function buildDoc(draft: ChartDraft): string {
  const abs = (u: string) => new URL(u, window.location.href).href;
  return previewDocument(previewConfig(draft, { js: abs(finderJs), css: abs(finderCss) }));
}

export function ChartPreview({ draft }: { draft: ChartDraft }) {
  const [mobile, setMobile] = useState(false);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const valid = validateDraft(draft).errors.length === 0;
  // Content-level key: re-renders of the route with an equal draft do not rebuild.
  const key = useMemo(() => JSON.stringify(draft), [draft]);

  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => setSrcDoc(buildDoc(draft)), srcDoc === null ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [key, valid]);

  return (
    <s-section heading="Preview">
      <s-stack gap="base">
        <s-button-group>
          <s-button slot="secondary-actions" variant={mobile ? "secondary" : "primary"} onClick={() => setMobile(false)}>
            Desktop
          </s-button>
          <s-button slot="secondary-actions" variant={mobile ? "primary" : "secondary"} onClick={() => setMobile(true)}>
            Mobile
          </s-button>
        </s-button-group>
        {valid && srcDoc !== null ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <iframe
              title="Size finder preview"
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              style={{ width: mobile ? 375 : "100%", maxWidth: "100%", height: 640, border: "1px solid #ddd" }}
            />
          </div>
        ) : (
          <s-paragraph>Fix the errors to see the preview.</s-paragraph>
        )}
      </s-stack>
    </s-section>
  );
}
