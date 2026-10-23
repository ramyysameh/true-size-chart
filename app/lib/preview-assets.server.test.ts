import { describe, expect, it } from "vitest";
import { previewAssetType, readPreviewAsset } from "./preview-assets.server";

describe("preview assets", () => {
  it("allows only the two finder files", () => {
    expect(previewAssetType("tsc-finder.js")).toMatch(/javascript/);
    expect(previewAssetType("tsc-finder.css")).toMatch(/css/);
    expect(previewAssetType("../../shopify.app.toml")).toBeNull();
    expect(previewAssetType("tsc-loader.liquid")).toBeNull();
    expect(previewAssetType("constructor")).toBeNull();
  });

  it("reads the committed bundle from the repo root", async () => {
    const js = await readPreviewAsset("tsc-finder.js");
    expect(js?.type).toMatch(/javascript/);
    expect(js?.body).toContain("true-size-finder");
    expect(await readPreviewAsset("../package.json")).toBeNull();
  });

  it("returns null when the file is missing", async () => {
    expect(await readPreviewAsset("tsc-finder.js", "/no/such/root")).toBeNull();
  });
});
