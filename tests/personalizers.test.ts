import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Repository } from "../app/lib/repository.server";
import {
  defaultDocument,
  resolveAssignedProduct,
  type ProductAssignment,
} from "../app/lib/domain";

const assignment = (id: string, variants: string[]): ProductAssignment => ({
  productId: `gid://shopify/Product/${id}`,
  title: `Producto ${id}`,
  handle: `producto-${id}`,
  image: "",
  status: "ACTIVE",
  variants: variants.map((id) => ({
    id,
    title: `Variante ${id}`,
    price: "12.00",
  })),
});
let repo: Repository;
beforeEach(async () => {
  repo = new Repository(":memory:");
  await repo.seed("store");
});
afterEach(() => repo.close());

describe("personalizers and Shopify assignments", () => {
  it("keeps only one active personalizer per product even on simultaneous activation", async () => {
    const first = await repo.createPersonalizer(
        "store",
        "cap-patch",
        "Primero",
      ),
      second = await repo.createPersonalizer("store", "cap-patch", "Segundo");
    const a = await repo.assignProducts("store", first.id, [
        assignment("1", ["11"]),
      ]),
      b = await repo.assignProducts("store", second.id, [
        assignment("1", ["11"]),
      ]);
    const result = await Promise.allSettled([
      repo.updateProduct("store", { ...a, enabled: true }),
      repo.updateProduct("store", { ...b, enabled: true }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await repo.listPersonalizers("store")).filter((p) => p.enabled),
    ).toHaveLength(1);
    const active = (await repo.listPersonalizers("store")).find(
      (p) => p.enabled,
    )!;
    await repo.updateProduct("store", { ...active, enabled: false });
    const other = active.id === a.id ? b : a;
    expect(
      (await repo.updateProduct("store", { ...other, enabled: true })).enabled,
    ).toBe(true);
    expect((await repo.findPersonalizer("store", "11", "1"))?.id).toBe(
      other.id,
    );
    expect(await repo.findPersonalizer("store", "99")).toBeNull();
  });
  it("creates independent personalizers from one catalog template and persists multiple products", async () => {
    const a = await repo.createPersonalizer(
      "store",
      "cap-patch",
      "Gorras de empresa",
    );
    const b = await repo.createPersonalizer(
      "store",
      "cap-patch",
      "Gorras de boda",
    );
    expect(a.id).not.toBe(b.id);
    expect(a.templateId).toBe("cap-patch");
    expect(a.enabled).toBe(false);
    await repo.assignProducts("store", a.id, [
      assignment("1", ["11", "12"]),
      assignment("2", ["21"]),
    ]);
    expect((await repo.getProduct("store", a.id))?.assignments).toHaveLength(2);
    expect((await repo.getProduct("store", b.id))?.assignments).toEqual([]);
    expect((await repo.getProduct("store", "cap-patch"))?.name).toBe(
      "Gorra con parche",
    );
    expect(await repo.listPersonalizers("store")).toHaveLength(2);
    expect(await repo.listPersonalizers("other")).toEqual([]);
    const confirmed = await repo.createPersonalizer(
      "store",
      "tumbler",
      "Termo confirmado",
      { verified: true },
    );
    expect(confirmed.verified).toBe(true);
  });
  it("resolves any assigned variant and rejects an unrelated product", async () => {
    const p = await repo.createPersonalizer(
      "store",
      "tumbler",
      "Termos con nombre",
    );
    const assigned = await repo.assignProducts("store", p.id, [
      assignment("1", ["11", "12"]),
      assignment("2", ["21"]),
    ]);
    const resolved = resolveAssignedProduct(assigned, "21");
    expect(resolved.variantId).toBe("21");
    expect(resolved.shopifyProductId).toBe("gid://shopify/Product/2");
    expect(resolved.name).toBe("Producto 2");
    expect(resolved.assignments).toHaveLength(1);
    expect(
      resolveAssignedProduct(assigned, "12").assignments[0].variants,
    ).toHaveLength(1);
    expect(() => resolveAssignedProduct(assigned, "99")).toThrow(/asignad/);
    expect(() =>
      resolveAssignedProduct(assigned, "21", "gid://shopify/Product/1"),
    ).toThrow(/asignad/);
  });
  it("keeps customer snapshots bound to their original Shopify variant", async () => {
    let p = await repo.createPersonalizer("store", "cap-patch", "Gorras");
    p = await repo.assignProducts("store", p.id, [
      assignment("1", ["11"]),
      assignment("2", ["21"]),
    ]);
    await repo.updateProduct("store", { ...p, enabled: true });
    const doc = defaultDocument(resolveAssignedProduct(p, "21"));
    const saved = await repo.saveDesign("store", "owner", doc);
    expect(
      (await repo.getRevision("store", saved.id, 1))?.product.shopifyProductId,
    ).toBe("gid://shopify/Product/2");
    await expect(
      repo.saveDesign(
        "store",
        "owner",
        { ...doc, variantId: "11" },
        saved.id,
        1,
      ),
    ).rejects.toThrow(/variante/);
    await repo.assignProducts("store", p.id, [assignment("1", ["11"])]);
    await expect(
      repo.saveDesign("store", "owner", doc, saved.id, 1),
    ).rejects.toThrow(/asignad/);
    expect(
      (await repo.getRevision("store", saved.id, 1))?.document.variantId,
    ).toBe("21");
  });
  it("does not let the configuration endpoint forge assignments or overwrite a concurrent assignment", async () => {
    const p = await repo.createPersonalizer("store", "cap-patch", "Empresa");
    await repo.assignProducts("store", p.id, [assignment("1", ["11"])]);
    const changed = await repo.updateProduct("store", {
      ...p,
      name: "Nuevo nombre",
      assignments: [assignment("2", ["21"])],
    });
    expect(changed.assignments.map((a) => a.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });
  it("removes all assignments without restoring a legacy variant and still reads legacy configurations", async () => {
    const legacy = (await repo.getProduct("store", "cap-patch"))!;
    await repo.updateProduct("store", {
      ...legacy,
      enabled: true,
      variantId: "11",
      shopifyProductId: "gid://shopify/Product/1",
    });
    expect(
      resolveAssignedProduct((await repo.getProduct("store", legacy.id))!, "11")
        .variantId,
    ).toBe("11");
    const cleared = await repo.assignProducts("store", legacy.id, []);
    expect(cleared.variantId).toBe("");
    expect(cleared.enabled).toBe(false);
    expect(() => resolveAssignedProduct(cleared, "11")).toThrow();
  });
});
