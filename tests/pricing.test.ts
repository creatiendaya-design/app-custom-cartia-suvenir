import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Repository } from "../app/lib/repository.server";
import { defaultDocument, productSchema } from "../app/lib/domain";
import { createOrUpdateQuote } from "../app/lib/quotes.server";
import { storefrontMessageOrigin } from "../app/lib/storefront";

let repo: Repository;
beforeEach(async () => {
  repo = new Repository(":memory:");
  await repo.seed("demo");
});
afterEach(() => repo.close());
async function approved(mode = "quote") {
  const p = (await repo.getProduct("demo", "cap-patch"))!;
  const product = await repo.updateProduct("demo", {
    ...p,
    purchaseMode: mode as "quote" | "product_price",
    variantId: "123",
    shopifyProductId: "gid://shopify/Product/1",
  });
  const doc = { ...defaultDocument(product), quantity: 3 };
  const design = await repo.saveDesign("demo", "customer", doc);
  await repo.submitDesign("demo", "customer", design.id, 1);
  await repo.reviewDesign("demo", design.id, 1, "approved", "", "merchant");
  return design;
}
const draft = (amount: string) => ({
  id: "gid://shopify/DraftOrder/55",
  invoiceUrl: "https://example.com/invoice/55",
  status: "OPEN",
  lineItems: {
    nodes: [
      {
        quantity: 3,
        variant: { id: "gid://shopify/ProductVariant/123" },
        priceOverride: { amount, currencyCode: "USD" },
      },
    ],
  },
});

describe("purchase modes and quotation prices", () => {
  it("keeps the chosen purchase mode through configuration and customer snapshots", async () => {
    const d = await approved("product_price");
    expect(
      (await repo.getRevision("demo", d.id, 1))?.product.purchaseMode,
    ).toBe("product_price");
    const legacy = (await repo.getProduct("demo", "cap-patch"))!;
    const { purchaseMode: unused, ...old } = legacy;
    expect(productSchema.parse(old).purchaseMode).toBe("quote");
  });
  it("creates a quote at the requested unit price and updates the existing draft when the price changes", async () => {
    const d = await approved();
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> =
      [];
    const graphql = vi.fn(
      async (
        query: string,
        options?: { variables?: Record<string, unknown> },
      ) => {
        calls.push({ query, variables: options?.variables });
        if (query.includes("QuoteCurrency"))
          return Response.json({ data: { shop: { currencyCode: "USD" } } });
        if (query.includes("ExistingQuote"))
          return Response.json({
            data: { draftOrder: { id: draft("25.00").id, status: "OPEN" } },
          });
        const amount = (
          options!.variables!.input as {
            lineItems: Array<{ priceOverride: { amount: string } }>;
          }
        ).lineItems[0].priceOverride.amount;
        return Response.json({
          data: {
            [query.includes("draftOrderUpdate")
              ? "draftOrderUpdate"
              : "draftOrderCreate"]: {
              draftOrder: draft(amount),
              userErrors: [],
            },
          },
        });
      },
    );
    await createOrUpdateQuote(
      repo,
      graphql,
      "demo",
      d.id,
      1,
      2500,
      "merchant",
      "secret",
    );
    const result = await createOrUpdateQuote(
      repo,
      graphql,
      "demo",
      d.id,
      1,
      3250,
      "merchant",
      "secret",
    );
    expect(result.invoiceUrl).toBe(draft("32.50").invoiceUrl);
    expect(result.quoteUnitPriceCents).toBe(3250);
    const mutations = calls.filter((c) => /mutation /.test(c.query));
    expect(mutations).toHaveLength(2);
    expect(mutations[1].query).toContain("draftOrderUpdate");
    expect(mutations[1].variables).toMatchObject({
      id: draft("32.50").id,
      input: {
        lineItems: [
          {
            quantity: 3,
            variantId: "gid://shopify/ProductVariant/123",
            priceOverride: { amount: "32.50", currencyCode: "USD" },
          },
        ],
      },
    });
    expect((await repo.getDesign("demo", d.id))?.quoteUnitPriceCents).toBe(
      3250,
    );
  });
  it("does not return a payment link when Shopify has not applied the requested price", async () => {
    const d = await approved();
    const graphql = vi.fn(async (query: string) =>
      Response.json({
        data: query.includes("QuoteCurrency")
          ? { shop: { currencyCode: "USD" } }
          : {
              draftOrderCreate: { draftOrder: draft("15.00"), userErrors: [] },
            },
      }),
    );
    await expect(
      createOrUpdateQuote(
        repo,
        graphql,
        "demo",
        d.id,
        1,
        4200,
        "merchant",
        "secret",
      ),
    ).rejects.toThrow(/precio/);
    const stored = await repo.getDesign("demo", d.id);
    expect(stored?.invoiceUrl).toBeUndefined();
    expect(stored?.quoteId).toBe(draft("15.00").id);
    expect(stored?.quoteOperation).toBeUndefined();
  });
  it("blocks concurrent changes and changes to paid, ordered or direct-purchase designs", async () => {
    const d = await approved();
    const first = await repo.beginQuote("demo", d.id, 1);
    await expect(repo.beginQuote("demo", d.id, 1)).rejects.toThrow(/curso/);
    await expect(
      repo.saveDesign(
        "demo",
        "customer",
        defaultDocument((await repo.getProduct("demo", "cap-patch"))!),
        d.id,
        1,
      ),
    ).rejects.toThrow();
    await repo.releaseQuote("demo", d.id, first.token);
    await repo.setDemoPayment("demo", d.id, "paid");
    await expect(repo.beginQuote("demo", d.id, 1)).rejects.toThrow(
      /pago|pedido/,
    );
    const direct = await approved("product_price");
    await expect(repo.beginQuote("demo", direct.id, 1)).rejects.toThrow(
      /precio del producto/,
    );
  });
  it("does not modify a completed Shopify draft", async () => {
    const d = await approved();
    await repo.attachQuote(
      "demo",
      d.id,
      draft("15.00").id,
      draft("15.00").invoiceUrl,
    );
    const graphql = vi.fn(async () =>
      Response.json({ data: { draftOrder: { status: "COMPLETED" } } }),
    );
    await expect(
      createOrUpdateQuote(
        repo,
        graphql,
        "demo",
        d.id,
        1,
        4200,
        "merchant",
        "secret",
      ),
    ).rejects.toThrow(/complet/);
    expect(graphql).toHaveBeenCalledTimes(1);
  });
  it("uses only the allowed storefront origin for cart messages", () => {
    const shop = "souvenir-made-xbc1wrvr.myshopify.com";
    expect(
      storefrontMessageOrigin("https://souvenirmade.shop/products/a", shop),
    ).toBe("https://souvenirmade.shop");
    expect(storefrontMessageOrigin(`https://${shop}/products/a`, shop)).toBe(
      `https://${shop}`,
    );
    expect(storefrontMessageOrigin("https://evil.example", shop)).toBe("");
    expect(
      storefrontMessageOrigin("https://souvenirmade.shop.evil.example", shop),
    ).toBe("");
  });
});
