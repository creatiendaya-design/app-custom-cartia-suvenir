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
async function setup() {
  const repo = new Repository(":memory:");
  repositories.push(repo);
  await repo.seed("demo");
  return repo;
}
afterEach(() => {
  repositories.splice(0).forEach((repo) => repo.close());
});
describe("persistent design workflow", () => {
  it("keeps one customer's designs private", async () => {
    const repo = await setup();
    const saved = await repo.saveDesign("demo", "owner-a", doc);
    expect(
      (await repo.getOwnedDesign("demo", "owner-a", saved.id))?.revision,
    ).toBe(1);
    expect(await repo.getOwnedDesign("demo", "owner-b", saved.id)).toBeNull();
    expect(
      await repo.getOwnedDesign("other-shop", "owner-a", saved.id),
    ).toBeNull();
  });
  it("preserves submitted revisions and detects conflicting saves", async () => {
    const repo = await setup();
    const first = await repo.saveDesign("demo", "owner", doc);
    await repo.submitDesign("demo", "owner", first.id, 1);
    const next = await repo.saveDesign(
      "demo",
      "owner",
      { ...doc, quantity: 2 },
      first.id,
      1,
    );
    expect(next.revision).toBe(2);
    expect(
      (await repo.getRevision("demo", first.id, 1))?.document.quantity,
    ).toBe(1);
    await expect(
      repo.saveDesign("demo", "owner", doc, first.id, 1),
    ).rejects.toThrow(/cambió/);
  });
  it("requires submitted review and validated area before production", async () => {
    const repo = await setup();
    const design = await repo.saveDesign("demo", "owner", doc);
    await expect(
      repo.reviewDesign("demo", design.id, 1, "approved", "", "tester"),
    ).rejects.toThrow();
    await repo.submitDesign("demo", "owner", design.id, 1);
    await repo.reviewDesign(
      "demo",
      design.id,
      1,
      "approved",
      "Correcto",
      "tester",
    );
    await expect(
      repo.startProduction("demo", design.id, 1, "tester"),
    ).rejects.toThrow();
    const config = (await repo.getProduct("demo", "cap-patch"))!;
    await repo.updateProduct("demo", { ...config, verified: true });
    await repo.setDemoPayment("demo", design.id, "paid");
    expect(
      (await repo.startProduction("demo", design.id, 1, "tester")).status,
    ).toBe("production");
  });
  it("does not mutate approved layouts when a product changes", async () => {
    const repo = await setup();
    const design = await repo.saveDesign("demo", "owner", doc);
    const config = (await repo.getProduct("demo", "cap-patch"))!;
    await repo.updateProduct("demo", { ...config, widthMm: 125 });
    expect(
      (await repo.getRevision("demo", design.id, 1))?.product.widthMm,
    ).toBe(config.widthMm);
  });
  it("deduplicates webhook event delivery", async () => {
    const repo = await setup();
    expect(await repo.recordEvent("shop", "event-1")).toBe(true);
    expect(await repo.recordEvent("shop", "event-1")).toBe(false);
    expect(await repo.recordEvent("another", "event-1")).toBe(true);
  });
  it("stores assets, lists records and preserves an audit trail", async () => {
    const repo = await setup();
    const design = await repo.saveDesign("demo", "owner", doc);
    await repo.putAsset({
      id: "image",
      shop: "demo",
      owner: "owner",
      name: "logo.png",
      width: 300,
      height: 300,
      data: "data:image/png;base64,AAAA",
    });
    expect((await repo.getAsset("demo", "image"))?.width).toBe(300);
    expect(await repo.getAsset("other", "image")).toBeNull();
    expect(await repo.listProducts("demo")).toHaveLength(16);
    expect(await repo.listDesigns("demo")).toHaveLength(1);
    expect((await repo.history("demo", design.id))[0].action).toBe("saved");
  });
  it("tracks Shopify orders and rejects associating the same design with another order", async () => {
    const repo = await setup();
    const design = await repo.saveDesign("demo", "owner", doc);
    expect(await repo.attachOrder("demo", design.id, 1, "100", true)).toBe(
      true,
    );
    expect(await repo.attachOrder("demo", design.id, 1, "200", true)).toBe(
      false,
    );
    expect(await repo.attachOrder("demo", design.id, 2, "100", true)).toBe(
      false,
    );
    await expect(
      repo.saveDesign("demo", "owner", doc, design.id, 1),
    ).rejects.toThrow(/compra/);
    expect(await repo.attachOrder("demo", design.id, 1, "100", false)).toBe(
      true,
    );
    expect((await repo.getDesign("demo", design.id))?.payment).toBe("pending");
  });
  it("freezes a design linked to a quote", async () => {
    const repo = await setup();
    const design = await repo.saveDesign("demo", "owner", doc);
    await repo.attachQuote(
      "demo",
      design.id,
      "quote-1",
      "https://example.com/invoice",
    );
    expect((await repo.getDesign("demo", design.id))?.quoteId).toBe("quote-1");
    await expect(
      repo.saveDesign("demo", "owner", doc, design.id, 1),
    ).rejects.toThrow();
  });
  it("revokes manufacturing approval if the linked payment is no longer authorized", async () => {
    const repo = await setup();
    const design = await repo.saveDesign("demo", "owner", doc);
    await repo.submitDesign("demo", "owner", design.id, 1);
    await repo.reviewDesign("demo", design.id, 1, "approved", "", "tester");
    await repo.attachOrder("demo", design.id, 1, "100", true);
    await repo.attachOrder("demo", design.id, 1, "100", false);
    expect((await repo.getDesign("demo", design.id))?.status).toBe(
      "changes_requested",
    );
    expect(
      (await repo.getDesign("demo", design.id))?.approvedRevision,
    ).toBeNull();
    await repo.invalidateOrder("demo", design.id, "another");
    await repo.invalidateOrder("demo", design.id, "100");
    expect((await repo.getDesign("demo", design.id))?.note).toMatch(/firmado/);
  });
});
