import { describe, expect, it, vi } from "vitest";
import {
  fetchAssignments,
  fetchCatalogPage,
} from "../app/lib/shopify-catalog.server";

const product = {
  id: "gid://shopify/Product/1",
  title: "Termo",
  handle: "termo",
  status: "ACTIVE",
  featuredImage: { url: "https://cdn.shopify.com/t.png" },
  variants: {
    nodes: [
      { id: "gid://shopify/ProductVariant/11", title: "Negro", price: "10.00" },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};
describe("Shopify product selection", () => {
  it("supports server-side search and cursor pagination", async () => {
    const graphql = vi.fn(
      async (
        _query: string,
        _options?: { variables?: Record<string, unknown> },
      ) =>
        Response.json({
          data: {
            products: {
              nodes: [product],
              pageInfo: { hasNextPage: true, endCursor: "next" },
            },
          },
        }),
    );
    const result = await fetchCatalogPage(graphql, "Termo", "cursor");
    expect(result.products[0].id).toBe(product.id);
    expect(result.pageInfo.endCursor).toBe("next");
    expect(graphql.mock.calls[0][1]?.variables).toMatchObject({
      after: "cursor",
      query: "Termo",
    });
  });
  it("validates each selected product against Shopify and loads every variant page", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            product: {
              ...product,
              variants: {
                nodes: product.variants.nodes,
                pageInfo: { hasNextPage: true, endCursor: "v2" },
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            product: {
              ...product,
              variants: {
                nodes: [
                  {
                    id: "gid://shopify/ProductVariant/12",
                    title: "Blanco",
                    price: "12.00",
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        }),
      );
    const result = await fetchAssignments(graphql, [product.id]);
    expect(result[0].variants.map((v) => v.id)).toEqual(["11", "12"]);
    expect(result[0].productId).toBe(product.id);
    expect(graphql.mock.calls[1][1].variables.after).toBe("v2");
  });
  it("rejects missing products, invalid IDs and upstream errors instead of trusting client metadata", async () => {
    await expect(
      fetchAssignments(vi.fn(), ["https://external.test"]),
    ).rejects.toThrow();
    await expect(
      fetchAssignments(
        async () => Response.json({ data: { product: null } }),
        [product.id],
      ),
    ).rejects.toThrow(/tienda/);
    await expect(
      fetchCatalogPage(async () =>
        Response.json({ errors: [{ message: "private" }] }),
      ),
    ).rejects.toThrow(/Shopify/);
  });
});
