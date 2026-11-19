import { z } from "zod";
import { assignmentSchema, type ProductAssignment } from "./domain";

export type Graphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;
export interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  featuredImage: { url: string } | null;
  variants: {
    nodes: { id: string; title: string; price: string }[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
}
export interface CatalogPage {
  products: CatalogProduct[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
export const selectedProductsSchema = z
  .array(z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/))
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
async function result(
  graphql: Graphql,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await graphql(query, { variables });
  const body = await response.json();
  if (!response.ok || body.errors?.length || !body.data)
    throw new Error(
      "Shopify no pudo devolver los productos. Revisa los permisos e inténtalo otra vez.",
    );
  return body.data;
}
export async function fetchCatalogPage(
  graphql: Graphql,
  query = "",
  after?: string,
): Promise<CatalogPage> {
  const data = await result(
    graphql,
    `#graphql
    query AssignableProducts($query:String,$after:String) {
      products(first:50,query:$query,after:$after,sortKey:TITLE) { nodes {
        id title handle status featuredImage { url }
        variants(first:1) { nodes { id title price } }
      } pageInfo { hasNextPage endCursor } }
    }`,
    { query: query.slice(0, 100) || null, after: after || null },
  );
  return { products: data.products.nodes, pageInfo: data.products.pageInfo };
}
export async function fetchAssignments(
  graphql: Graphql,
  input: string[],
): Promise<ProductAssignment[]> {
  const ids = selectedProductsSchema.parse(input),
    assignments: ProductAssignment[] = [];
  for (const id of ids) {
    const variants: ProductAssignment["variants"] = [];
    let after: string | null = null,
      product: CatalogProduct;
    do {
      const data = await result(
        graphql,
        `#graphql
        query AssignedProduct($id:ID!,$after:String) { product(id:$id) {
          id title handle status featuredImage { url }
          variants(first:100,after:$after) { nodes { id title price } pageInfo {hasNextPage endCursor} }
        } }`,
        { id, after },
      );
      product = data.product;
      if (!product || product.id !== id)
        throw new Error(
          "Un producto seleccionado ya no está disponible en esta tienda.",
        );
      variants.push(
        ...product.variants.nodes.map((v) => ({
          ...v,
          id: v.id.split("/").pop()!,
        })),
      );
      if (variants.length > 2048)
        throw new Error(
          "Este producto supera el número de variantes admitido.",
        );
      const next = product.variants.pageInfo;
      if (next?.hasNextPage && (!next.endCursor || next.endCursor === after))
        throw new Error("Shopify no pudo completar la consulta de variantes.");
      after = next?.hasNextPage ? next.endCursor : null;
    } while (after);
    assignments.push(
      assignmentSchema.parse({
        productId: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        image: product.featuredImage?.url || "",
        variants,
      }),
    );
  }
  return assignments;
}

// Offline fixtures are served only when requireMerchant identifies local demo mode.
export const demoCatalog: CatalogProduct[] = [
  {
    id: "gid://shopify/Product/1001",
    title: "Gorra de empresa",
    handle: "gorra-empresa",
    status: "ACTIVE",
    featuredImage: null,
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1101",
          title: "Beige",
          price: "12.00",
        },
        {
          id: "gid://shopify/ProductVariant/1102",
          title: "Negro",
          price: "12.00",
        },
      ],
    },
  },
  {
    id: "gid://shopify/Product/1002",
    title: "Gorra para eventos",
    handle: "gorra-eventos",
    status: "ACTIVE",
    featuredImage: null,
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1201",
          title: "Beige",
          price: "14.00",
        },
      ],
    },
  },
  {
    id: "gid://shopify/Product/1003",
    title: "Termo de acero",
    handle: "termo-acero",
    status: "DRAFT",
    featuredImage: null,
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1301",
          title: "Única",
          price: "20.00",
        },
      ],
    },
  },
];
export function demoAssignments(ids: string[]) {
  return selectedProductsSchema.parse(ids).map((id) => {
    const p = demoCatalog.find((p) => p.id === id);
    if (!p) throw new Error("Producto de prueba no encontrado.");
    return assignmentSchema.parse({
      productId: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      image: "",
      variants: p.variants.nodes.map((v) => ({
        ...v,
        id: v.id.split("/").pop()!,
      })),
    });
  });
}
