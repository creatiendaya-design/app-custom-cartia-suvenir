import { cartSignature } from "./integration.server";
import type { Repository } from "./repository.server";
import type { Graphql } from "./shopify-catalog.server";

interface Draft {
  id: string;
  invoiceUrl: string;
  status: string;
  lineItems: {
    nodes: Array<{
      quantity: number;
      variant: { id: string } | null;
      priceOverride: { amount: string; currencyCode: string } | null;
    }>;
  };
}
async function execute<T>(
  graphql: Graphql,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await graphql(query, { variables });
  const result = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || result.errors?.length || !result.data)
    throw new Error(
      result.errors?.map((e) => e.message).join(" ") ||
        "No se pudo consultar la cotización en Shopify.",
    );
  return result.data;
}
const draftFields = `id invoiceUrl status lineItems(first:2) { nodes { quantity variant { id } priceOverride { amount currencyCode } } }`;

export async function createOrUpdateQuote(
  repo: Repository,
  graphql: Graphql,
  shop: string,
  id: string,
  revision: number,
  unitPriceCents: number,
  actor: string,
  secret: string,
) {
  if (!secret) throw new Error("Falta configurar Shopify.");
  if (
    !Number.isSafeInteger(unitPriceCents) ||
    unitPriceCents < 1 ||
    unitPriceCents > 100000000
  )
    throw new Error("Introduce un precio unitario válido.");
  const { design, snapshot, token } = await repo.beginQuote(shop, id, revision);
  let draftId: string | undefined = design.quoteId;
  try {
    if (draftId) {
      const existing = await execute<{ draftOrder: { status: string } | null }>(
        graphql,
        `query ExistingQuote($id:ID!) { draftOrder(id:$id) { status } }`,
        { id: draftId },
      );
      if (existing.draftOrder?.status === "COMPLETED")
        throw new Error(
          "La cotización ya está completada. Revisa el pedido en Shopify.",
        );
      if (!existing.draftOrder) draftId = undefined;
    }
    const { shop: store } = await execute<{ shop: { currencyCode: string } }>(
      graphql,
      `query QuoteCurrency { shop { currencyCode } }`,
    );
    const currency = store.currencyCode;
    if (!/^[A-Z]{3}$/.test(currency))
      throw new Error("No se pudo consultar la moneda de la tienda.");
    const { variantId, quantity } = snapshot.document;
    if (!/^\d+$/.test(variantId))
      throw new Error(
        "Vincula una variante real de Shopify antes de crear la cotización.",
      );
    const input = {
      note: `Souvenir Made ${id} r${revision}`,
      tags: ["souvenir-personalizado"],
      presentmentCurrencyCode: currency,
      acceptAutomaticDiscounts: false,
      allowDiscountCodesInCheckout: false,
      discountCodes: [],
      appliedDiscount: null,
      lineItems: [
        {
          variantId: `gid://shopify/ProductVariant/${variantId}`,
          quantity,
          priceOverride: {
            amount: (unitPriceCents / 100).toFixed(2),
            currencyCode: currency,
          },
          customAttributes: [
            { key: "_sm_design_id", value: id },
            { key: "_sm_revision", value: String(revision) },
            {
              key: "_sm_signature",
              value: cartSignature(id, revision, variantId, quantity, secret),
            },
          ],
        },
      ],
    };
    const operation = draftId ? "draftOrderUpdate" : "draftOrderCreate";
    const query = draftId
      ? `mutation PersonalizerQuoteUpdate($id:ID!,$input:DraftOrderInput!) { draftOrderUpdate(id:$id,input:$input) { draftOrder { ${draftFields} } userErrors { message } } }`
      : `mutation PersonalizerQuoteCreate($input:DraftOrderInput!) { draftOrderCreate(input:$input) { draftOrder { ${draftFields} } userErrors { message } } }`;
    const result = await execute<
      Record<
        string,
        { draftOrder: Draft | null; userErrors: Array<{ message: string }> }
      >
    >(graphql, query, { ...(draftId ? { id: draftId } : {}), input });
    const payload = result[operation];
    if (payload?.userErrors?.length || !payload?.draftOrder)
      throw new Error(
        payload?.userErrors?.map((e) => e.message).join(" ") ||
          "No se pudo guardar la cotización en Shopify.",
      );
    const draft = payload.draftOrder;
    if (!/^gid:\/\/shopify\/DraftOrder\/\d+$/.test(draft.id))
      throw new Error("La cotización de Shopify no es válida.");
    draftId = draft.id;
    const line = draft.lineItems.nodes[0];
    if (
      draft.status === "COMPLETED" ||
      draft.lineItems.nodes.length !== 1 ||
      line?.variant?.id !== `gid://shopify/ProductVariant/${variantId}` ||
      line.quantity !== quantity ||
      !line.priceOverride ||
      line.priceOverride.currencyCode !== currency ||
      Number(line.priceOverride.amount) !== unitPriceCents / 100
    )
      throw new Error(
        "Shopify no confirmó el precio solicitado. El enlace no se ha publicado; revisa la cotización y vuelve a intentarlo.",
      );
    if (!draft.invoiceUrl || new URL(draft.invoiceUrl).protocol !== "https:")
      throw new Error("Shopify no devolvió un enlace de pago válido.");
    return await repo.finishQuote(
      shop,
      id,
      token,
      revision,
      draft.id,
      draft.invoiceUrl,
      unitPriceCents,
      currency,
      actor,
    );
  } catch (error) {
    await repo.releaseQuote(shop, id, token, draftId);
    throw error;
  }
}
