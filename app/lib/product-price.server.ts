import type { Product } from "./domain";
import type { Graphql } from "./shopify-catalog.server";

export async function fetchProductPrice(graphql: Graphql, product: Product) {
  const response = await graphql(
    `
      query PersonalizerPrice($id: ID!) {
        shop {
          currencyCode
        }
        productVariant(id: $id) {
          id
          price
          product {
            id
          }
        }
      }
    `,
    { variables: { id: `gid://shopify/ProductVariant/${product.variantId}` } },
  );
  const result = await response.json();
  const variant = result.data?.productVariant;
  const currency = result.data?.shop?.currencyCode;
  if (
    !response.ok ||
    result.errors?.length ||
    variant?.id !== `gid://shopify/ProductVariant/${product.variantId}` ||
    variant.product?.id !== product.shopifyProductId ||
    !/^\d+(?:\.\d+)?$/.test(variant.price || "") ||
    !/^[A-Z]{3}$/.test(currency || "")
  )
    throw new Error(
      "No pudimos consultar el precio actual del producto. Vuelve a intentarlo.",
    );
  return { amount: String(variant.price), currency: String(currency) };
}
