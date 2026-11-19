import { describe, expect, it } from "vitest";
import {
  renderArtwork,
  buildProductionPackage,
} from "../app/lib/export.server";
import { seedCatalog } from "../app/lib/catalog";
import { defaultDocument } from "../app/lib/domain";
import { unzipSync, strFromU8 } from "fflate";

describe("production exports", () => {
  it("escapes text, uses physical dimensions and excludes product photo", () => {
    const product = seedCatalog[0],
      doc = defaultDocument(product);
    if (doc.elements[0].type === "text")
      doc.elements[0].text = '<script>alert("x")</script> & ñ';
    const svg = renderArtwork(doc, product, []);
    expect(svg).toContain('width="80mm"');
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("cap-1.jpg");
  });
  it("includes original assets and labels the exact revision", async () => {
    const product = seedCatalog[0],
      doc = defaultDocument(product);
    const bytes = await buildProductionPackage(
      "design-123",
      3,
      { document: doc, product, createdAt: "2026-11-19" },
      [],
    );
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain("arte-frente.svg");
    expect(Object.keys(files)).toContain("arte-frente.png");
    expect(strFromU8(files["ficha.json"])).toContain('"revision": 3');
    expect(strFromU8(files["LEER.txt"])).toMatch(/medidas/);
  });
});
