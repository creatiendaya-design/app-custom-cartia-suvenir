import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "../app/routes/api";
import * as access from "../app/lib/access.server";
import { Repository } from "../app/lib/repository.server";
import { defaultDocument } from "../app/lib/domain";
import { fetchProductPrice } from "../app/lib/product-price.server";
import { loader as studioLoader } from "../app/routes/studio";

const { graphql } = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("../app/lib/shopify.server", () => ({
  getShopify: () => ({
    unauthenticated: { admin: async () => ({ admin: { graphql } }) },
    authenticate: { admin: async () => ({ admin: { graphql } }) },
  }),
}));
let repo: Repository;
const shop = "store.myshopify.com",
  owner = randomUUID();
beforeEach(async () => {
  repo = new Repository(":memory:");
  await repo.seed(shop);
  globalThis.souvenirRepository = repo;
  vi.stubEnv("SHOPIFY_API_SECRET", "test-only-secret");
  vi.spyOn(access, "requirePublicShop").mockResolvedValue(shop);
  vi.spyOn(access, "requireMerchant").mockResolvedValue({
    shop,
    actor: "merchant",
    demo: false,
    apiKey: "test-only",
  });
});
afterEach(() => {
  repo.close();
  globalThis.souvenirRepository = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  graphql.mockReset();
});
function post(intent: string, body: unknown) {
  const url = new URL(`http://localhost:3000/api/${intent}`);
  return action({
    url,
    pattern: "/api/:intent",
    params: { intent },
    context: {},
    request: new Request(url, {
      method: "POST",
      headers: {
        Origin: url.origin,
        "Content-Type": "application/json",
        "x-design-owner": owner,
      },
      body: JSON.stringify(body),
    }),
  });
}
async function configured(mode: "quote" | "product_price") {
  const p = (await repo.getProduct(shop, "cap-patch"))!;
  return repo.updateProduct(shop, {
    ...p,
    enabled: true,
    verified: false,
    purchaseMode: mode,
    shopifyProductId: "gid://shopify/Product/1",
    variantId: "123",
  });
}
describe("purchase mode API enforcement", () => {
  it("allows the Shopify-price cart flow independently of physical-area verification", async () => {
    const p = await configured("product_price");
    const { design } = await (
      await post("save", { document: defaultDocument(p) })
    ).json();
    expect((await post("submit", { id: design.id, revision: 1 })).status).toBe(
      200,
    );
    const response = await post("cart", {
      id: design.id,
      revision: 1,
      unitPriceCents: 1,
    });
    expect(response.status).toBe(200);
    const { item } = await response.json();
    expect(item.id).toBe("123");
    expect(item).not.toHaveProperty("price");
    expect(item.properties._sm_signature).toHaveLength(64);
    expect(graphql).not.toHaveBeenCalled();
    await expect(
      repo.startProduction(shop, design.id, 1, "merchant"),
    ).rejects.toThrow();
  });
  it("keeps the quotation flow out of the cart even if a caller posts a different mode", async () => {
    const p = await configured("quote");
    const { design } = await (
      await post("save", { document: defaultDocument(p) })
    ).json();
    await post("submit", { id: design.id, revision: 1 });
    expect(
      (
        await post("cart", {
          id: design.id,
          revision: 1,
          purchaseMode: "product_price",
        })
      ).status,
    ).toBe(400);
  });
  it("uses the corrected quote service from the merchant endpoint", async () => {
    const p = await configured("quote");
    const d = await repo.saveDesign(shop, owner, defaultDocument(p));
    await repo.submitDesign(shop, owner, d.id, 1);
    await repo.reviewDesign(shop, d.id, 1, "approved", "", "merchant");
    graphql.mockImplementation(async (query: string) =>
      Response.json({
        data: query.includes("QuoteCurrency")
          ? { shop: { currencyCode: "USD" } }
          : {
              draftOrderCreate: {
                userErrors: [],
                draftOrder: {
                  id: "gid://shopify/DraftOrder/88",
                  status: "OPEN",
                  invoiceUrl: "https://example.com/invoice/88",
                  lineItems: {
                    nodes: [
                      {
                        variant: { id: "gid://shopify/ProductVariant/123" },
                        quantity: 1,
                        priceOverride: { amount: "52.50", currencyCode: "USD" },
                      },
                    ],
                  },
                },
              },
            },
      }),
    );
    const response = await post("quote", {
      id: d.id,
      revision: 1,
      unitPriceCents: 5250,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      invoiceUrl: "https://example.com/invoice/88",
      quoteUnitPriceCents: 5250,
      quoteCurrency: "USD",
    });
  });
  it("loads the live variant price and rejects mismatched products", async () => {
    const p = await configured("product_price");
    const api = vi.fn(async () =>
      Response.json({
        data: {
          shop: { currencyCode: "USD" },
          productVariant: {
            id: "gid://shopify/ProductVariant/123",
            price: "15.00",
            product: { id: "gid://shopify/Product/1" },
          },
        },
      }),
    );
    expect(await fetchProductPrice(api, p)).toEqual({
      amount: "15.00",
      currency: "USD",
    });
    await expect(
      fetchProductPrice(api, {
        ...p,
        shopifyProductId: "gid://shopify/Product/2",
      }),
    ).rejects.toThrow(/precio/);
  });
  it("loads direct-purchase prices through the studio and reports unavailable prices accurately", async () => {
    await configured("product_price");
    const args = {
      url: new URL("https://app.example/studio/cap-patch"),
      pattern: "/studio/:productId",
      params: { productId: "cap-patch" },
      context: {},
      request: new Request("https://app.example/studio/cap-patch"),
    };
    graphql.mockResolvedValue(
      Response.json({
        data: {
          shop: { currencyCode: "USD" },
          productVariant: {
            id: "gid://shopify/ProductVariant/123",
            price: "15.00",
            product: { id: "gid://shopify/Product/1" },
          },
        },
      }),
    );
    expect((await studioLoader(args)).price).toEqual({
      amount: "15.00",
      currency: "USD",
    });
    graphql.mockResolvedValue(
      Response.json({ errors: [{ message: "Unavailable" }] }),
    );
    await expect(studioLoader(args)).rejects.toMatchObject({ status: 503 });
  });
});
