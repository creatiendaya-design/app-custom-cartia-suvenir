import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { action, loader } from "../app/routes/api";
import { Repository } from "../app/lib/repository.server";
import { defaultDocument } from "../app/lib/domain";
let repo: Repository;
const owner = randomUUID();
beforeEach(async () => {
  vi.stubEnv("LOCAL_DEMO", "true");
  repo = new Repository(":memory:");
  globalThis.souvenirRepository = repo;
  await repo.seed("demo");
});
afterEach(() => {
  repo.close();
  globalThis.souvenirRepository = undefined;
  vi.unstubAllEnvs();
});
function post(
  intent: string,
  body: unknown,
  capability: string = owner,
  origin = "http://localhost:3000",
) {
  const url = new URL("http://localhost:3000/api/" + intent);
  return action({
    params: { intent },
    context: {},
    url,
    pattern: "/api/:intent",
    request: new Request(url, {
      method: "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        "x-design-owner": capability,
      },
      body: JSON.stringify(body),
    }),
  });
}
function get(intent: string, query = "", capability = owner) {
  const url = new URL("http://localhost:3000/api/" + intent + query);
  return loader({
    params: { intent },
    context: {},
    url,
    pattern: "/api/:intent",
    request: new Request(url, { headers: { "x-design-owner": capability } }),
  });
}
describe("API workflow", () => {
  it("creates a personalizer with two verified demo product assignments and resolves either variant", async () => {
    const product = (await repo.getProduct("demo", "cap-patch"))!;
    const response = await post("create-personalizer", {
      templateId: "cap-patch",
      product: { ...product, name: "Gorras corporativas", enabled: true },
      productIds: ["gid://shopify/Product/1001", "gid://shopify/Product/1002"],
    });
    expect(response.status).toBe(200);
    const { product: created } = await response.json();
    expect(created.assignments).toHaveLength(2);
    const document = { ...defaultDocument(created), variantId: "1201" };
    const saved = await post("save", { document });
    expect(saved.status).toBe(200);
    const { design } = await saved.json();
    expect((await repo.getRevision("demo", design.id, 1))?.product.name).toBe(
      "Gorra para eventos",
    );
    expect(
      (await post("assign-products", { id: created.id, productIds: [] }))
        .status,
    ).toBe(200);
    expect((await post("save", { document })).status).toBe(400);
    const list = await get("shopify-products", "?query=eventos");
    expect((await list.json()).products).toHaveLength(1);
    expect(
      (
        await post("assign-products", {
          id: created.id,
          productIds: ["gid://shopify/Product/99999"],
        })
      ).status,
    ).toBe(400);
  });
  it("saves and retrieves the current design and protects it from another customer", async () => {
    const doc = defaultDocument((await repo.getProduct("demo", "cap-patch"))!);
    const response = await post("save", { document: doc });
    expect(response.status).toBe(200);
    const { design } = await response.json();
    const saved = await get("design", "?id=" + design.id);
    expect((await saved.json()).snapshot.document).toEqual(doc);
    expect((await get("design", "?id=" + design.id, randomUUID())).status).toBe(
      404,
    );
  });
  it("blocks cross-origin and invalid mutations", async () => {
    expect((await post("save", {}, owner, "https://evil.test")).status).toBe(
      403,
    );
    expect((await post("save", {}, "invalid")).status).toBe(401);
    expect((await post("save", { document: {} })).status).toBe(400);
  });
  it("normalizes image uploads and rejects forged asset metadata", async () => {
    const png = await sharp({
      create: { width: 600, height: 600, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    const response = await post("upload", {
      data: "data:image/png;base64," + png.toString("base64"),
      name: "logo.png",
    });
    expect(response.status).toBe(200);
    const { asset } = await response.json();
    expect(asset.width).toBe(600);
    const doc = defaultDocument((await repo.getProduct("demo", "cap-patch"))!);
    doc.elements = [
      {
        id: "img",
        type: "image",
        x: 100,
        y: 100,
        width: 300,
        height: 300,
        rotation: 0,
        assetId: asset.id,
        naturalWidth: 999,
        naturalHeight: 999,
      },
    ];
    expect((await post("save", { document: doc })).status).toBe(400);
    if (doc.elements[0].type === "image")
      doc.elements[0] = {
        ...doc.elements[0],
        naturalWidth: 600,
        naturalHeight: 600,
      };
    expect((await post("save", { document: doc })).status).toBe(200);
    expect((await post("save", { document: doc }, randomUUID())).status).toBe(
      400,
    );
  });
  it("runs review and download without authorizing unverified production", async () => {
    const doc = defaultDocument((await repo.getProduct("demo", "cap-patch"))!);
    const { design } = await (await post("save", { document: doc })).json();
    const input = { id: design.id, revision: 1 };
    expect((await post("submit", input)).status).toBe(200);
    expect(
      (await post("review", { ...input, status: "approved", note: "" })).status,
    ).toBe(200);
    expect((await post("production", input)).status).toBe(400);
    const exported = await get("export", "?id=" + design.id);
    expect(exported.headers.get("content-type")).toBe("application/zip");
    expect((await get("review-detail", "?id=" + design.id)).status).toBe(200);
    expect((await post("cart", input)).status).toBe(400);
  });
});
