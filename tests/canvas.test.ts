import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { action, loader } from "../app/routes/api";
import * as access from "../app/lib/access.server";
import { Repository } from "../app/lib/repository.server";
import { defaultDocument } from "../app/lib/domain";
import { ProductBase } from "../app/components/ProductScene";

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
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const post = (intent: string, body: unknown) =>
  action({
    params: { intent },
    context: {},
    url: new URL(`http://localhost:3000/api/${intent}`),
    pattern: "/api/:intent",
    request: new Request(`http://localhost:3000/api/${intent}`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "x-design-owner": owner,
      },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof action>[0]);
const image = (id: string) =>
  loader({
    params: { intent: "canvas" },
    context: {},
    url: new URL(`http://localhost:3000/api/canvas?shop=demo&id=${id}`),
    pattern: "/api/:intent",
    request: new Request(`http://localhost:3000/api/canvas?shop=demo&id=${id}`),
  } as Parameters<typeof loader>[0]);
async function upload(name = "producto.jpg") {
  const bytes = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "#dab477" },
  })
    .jpeg()
    .toBuffer();
  return post("canvas-upload", {
    name,
    data: `data:image/jpeg;base64,${bytes.toString("base64")}`,
  });
}

describe("merchant canvas photographs", () => {
  it("normalizes a merchant's photo and serves only the public canvas image", async () => {
    const response = await upload();
    expect(response.status).toBe(200);
    const { canvas } = await response.json();
    expect(canvas).toMatchObject({
      shop: "demo",
      name: "producto.jpg",
      fit: "contain",
    });
    const preview = await image(canvas.assetId);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/png");
    expect(
      await sharp(Buffer.from(await preview.arrayBuffer())).metadata(),
    ).toMatchObject({ format: "png", width: 2000, height: 1000 });
    const customer = await post("upload", {
      name: "privado.jpg",
      data: (await repo.getAsset("demo", canvas.assetId))!.data,
    });
    const { asset } = await customer.json();
    expect((await image(asset.id)).status).toBe(404);
    expect((await image(randomUUID())).status).toBe(404);
  });

  it("requires merchant access even when the caller has a valid customer capability", async () => {
    vi.spyOn(access, "requireMerchant").mockRejectedValue(
      new Response("No autorizado", { status: 401 }),
    );
    expect((await upload()).status).toBe(401);
    expect(await repo.driver.list("asset", "demo")).toEqual([]);
  });

  it("rejects invalid files and unsafe mutations", async () => {
    expect(
      (
        await post("canvas-upload", {
          name: "archivo.png",
          data: "data:image/png;base64,PHN2Zz48L3N2Zz4=",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("canvas-upload", {
          name: "archivo.svg",
          data: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        })
      ).status,
    ).toBe(400);
    const response = await action({
      params: { intent: "canvas-upload" },
      context: {},
      url: new URL("http://localhost:3000/api/canvas-upload"),
      pattern: "/api/:intent",
      request: new Request("http://localhost:3000/api/canvas-upload", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    } as Parameters<typeof action>[0]);
    expect(response.status).toBe(403);
  });

  it("persists canvas settings and preserves the previous photo in an existing design revision", async () => {
    const product = (await repo.getProduct("demo", "cap-patch"))!;
    expect(product.canvas).toBeNull();
    const { canvas } = await (await upload()).json();
    const saved = await repo.updateProduct("demo", {
      ...product,
      canvas: { ...canvas, fit: "cover" },
    });
    expect((await repo.getProduct("demo", saved.id))?.canvas?.fit).toBe(
      "cover",
    );
    const html = renderToStaticMarkup(
      createElement(ProductBase, { product: saved, color: "#e6d6bc" }),
    );
    expect(html).toContain("/api/canvas?");
    expect(html).toContain("xMidYMid slice");
    expect(html).not.toContain("/catalog/cap-");
    const design = await repo.saveDesign("demo", owner, defaultDocument(saved));
    await repo.updateProduct("demo", { ...saved, canvas: null });
    expect(
      (await repo.getRevision("demo", design.id, 1))?.product.canvas?.assetId,
    ).toBe(canvas.assetId);
    expect((await repo.getProduct("demo", saved.id))?.canvas).toBeNull();
    expect((await image(canvas.assetId)).status).toBe(200);
  });

  it("rejects customer assets or another shop's canvas when configuring or creating personalizers", async () => {
    const product = (await repo.getProduct("demo", "cap-patch"))!;
    const { canvas } = await (await upload()).json();
    await expect(
      repo.updateProduct("demo", {
        ...product,
        canvas: { ...canvas, shop: "other.myshopify.com" },
      }),
    ).rejects.toThrow();
    const asset = (await repo.getAsset("demo", canvas.assetId))!;
    const customerId = randomUUID();
    await repo.putAsset({
      ...asset,
      id: customerId,
      purpose: undefined,
      owner,
    });
    await expect(
      repo.updateProduct("demo", {
        ...product,
        canvas: { ...canvas, assetId: customerId },
      }),
    ).rejects.toThrow();
    await expect(
      repo.createPersonalizer("demo", "cap-patch", "Copia", {
        canvas: { ...canvas, assetId: customerId },
      }),
    ).rejects.toThrow();
    const created = await repo.createPersonalizer(
      "demo",
      "cap-patch",
      "Mi foto",
      { canvas },
    );
    expect(created.canvas?.assetId).toBe(canvas.assetId);
  });
});
