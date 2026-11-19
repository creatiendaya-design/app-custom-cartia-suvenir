import { afterEach, describe, expect, it } from "vitest";
import { Repository } from "../app/lib/repository.server";

const repositories: Repository[] = [];
const doc = {
  productId: "cap-patch",
  variantId: "",
  color: "#e6d6bc",
  quantity: 1,
  elements: [
    {
      id: "t",
      type: "text" as const,
      x: 100,
      y: 100,
      width: 600,
      height: 200,
      rotation: 0,
      text: "Hola",
      font: "Arial" as const,
      fontSize: 90,
      color: "#122d4e",
      align: "center" as const,
    },
  ],
};
function setup() {
  const repo = new Repository(":memory:");
  repositories.push(repo);
  repo.seed("demo");
  return repo;
}
afterEach(() => {
  repositories.splice(0).forEach((repo) => repo.close());
});

describe("persistent design workflow", () => {
  it("keeps one customer's designs private", () => {
    const repo = setup();
    const saved = repo.saveDesign("demo", "owner-a", doc);
    expect(repo.getOwnedDesign("demo", "owner-a", saved.id)?.revision).toBe(1);
    expect(repo.getOwnedDesign("demo", "owner-b", saved.id)).toBeNull();
    expect(repo.getOwnedDesign("other-shop", "owner-a", saved.id)).toBeNull();
  });
  it("preserves submitted revisions and detects conflicting saves", () => {
    const repo = setup();
    const first = repo.saveDesign("demo", "owner", doc);
    repo.submitDesign("demo", "owner", first.id, 1);
    const next = repo.saveDesign(
      "demo",
      "owner",
      { ...doc, quantity: 2 },
      first.id,
      1,
    );
    expect(next.revision).toBe(2);
    expect(repo.getRevision("demo", first.id, 1)?.document.quantity).toBe(1);
    expect(() => repo.saveDesign("demo", "owner", doc, first.id, 1)).toThrow(
      /cambió/,
    );
  });
  it("requires submitted review and validated area before production", () => {
    const repo = setup();
    const design = repo.saveDesign("demo", "owner", doc);
    expect(() =>
      repo.reviewDesign("demo", design.id, 1, "approved", "", "tester"),
    ).toThrow();
    repo.submitDesign("demo", "owner", design.id, 1);
    repo.reviewDesign("demo", design.id, 1, "approved", "Correcto", "tester");
    expect(() =>
      repo.startProduction("demo", design.id, 1, "tester"),
    ).toThrow();
    const config = repo.getProduct("demo", "cap-patch")!;
    repo.updateProduct("demo", { ...config, verified: true });
    repo.setDemoPayment("demo", design.id, "paid");
    expect(repo.startProduction("demo", design.id, 1, "tester").status).toBe(
      "production",
    );
  });
  it("does not mutate approved layouts when a product changes", () => {
    const repo = setup();
    const design = repo.saveDesign("demo", "owner", doc);
    const config = repo.getProduct("demo", "cap-patch")!;
    repo.updateProduct("demo", { ...config, widthMm: 125 });
    expect(repo.getRevision("demo", design.id, 1)?.product.widthMm).toBe(
      config.widthMm,
    );
  });
  it("deduplicates webhook event delivery", () => {
    const repo = setup();
    expect(repo.recordEvent("shop", "event-1")).toBe(true);
    expect(repo.recordEvent("shop", "event-1")).toBe(false);
    expect(repo.recordEvent("another", "event-1")).toBe(true);
  });
  it("stores assets, lists records and preserves an audit trail", () => {
    const repo = setup();
    const design = repo.saveDesign("demo", "owner", doc);
    repo.putAsset({
      id: "image",
      shop: "demo",
      owner: "owner",
      name: "logo.png",
      width: 300,
      height: 300,
      data: "data:image/png;base64,AAAA",
    });
    expect(repo.getAsset("demo", "image")?.width).toBe(300);
    expect(repo.getAsset("other", "image")).toBeNull();
    expect(repo.listProducts("demo")).toHaveLength(16);
    expect(repo.listDesigns("demo")).toHaveLength(1);
    expect(repo.history("demo", design.id)[0].action).toBe("saved");
  });
  it("tracks Shopify orders and rejects associating the same design with another order", () => {
    const repo = setup();
    const design = repo.saveDesign("demo", "owner", doc);
    expect(repo.attachOrder("demo", design.id, 1, "100", true)).toBe(true);
    expect(repo.attachOrder("demo", design.id, 1, "200", true)).toBe(false);
    expect(repo.attachOrder("demo", design.id, 2, "100", true)).toBe(false);
    expect(() => repo.saveDesign("demo", "owner", doc, design.id, 1)).toThrow(
      /compra/,
    );
    expect(repo.attachOrder("demo", design.id, 1, "100", false)).toBe(true);
    expect(repo.getDesign("demo", design.id)?.payment).toBe("pending");
  });
  it("freezes a design linked to a quote", () => {
    const repo = setup();
    const design = repo.saveDesign("demo", "owner", doc);
    repo.attachQuote(
      "demo",
      design.id,
      "quote-1",
      "https://example.com/invoice",
    );
    expect(repo.getDesign("demo", design.id)?.quoteId).toBe("quote-1");
    expect(() => repo.saveDesign("demo", "owner", doc, design.id, 1)).toThrow();
  });
  it("revokes manufacturing approval if the linked payment is no longer authorized", () => {
    const repo = setup();
    const design = repo.saveDesign("demo", "owner", doc);
    repo.submitDesign("demo", "owner", design.id, 1);
    repo.reviewDesign("demo", design.id, 1, "approved", "", "tester");
    repo.attachOrder("demo", design.id, 1, "100", true);
    repo.attachOrder("demo", design.id, 1, "100", false);
    expect(repo.getDesign("demo", design.id)?.status).toBe("changes_requested");
    expect(repo.getDesign("demo", design.id)?.approvedRevision).toBeNull();
    repo.invalidateOrder("demo", design.id, "another");
    repo.invalidateOrder("demo", design.id, "100");
    expect(repo.getDesign("demo", design.id)?.note).toMatch(/firmado/);
  });
});
