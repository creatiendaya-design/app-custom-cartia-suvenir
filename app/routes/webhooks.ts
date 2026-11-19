import type { ActionFunctionArgs } from "react-router";
import { getShopify } from "../lib/shopify.server";
import { getRepository, type OrderUpdate } from "../lib/repository.server";
import { verifyCartSignature } from "../lib/integration.server";
import { permittedShop } from "../lib/access.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic, payload } =
    await getShopify().authenticate.webhook(request);
  if (!permittedShop(shop)) return new Response(null, { status: 403 });
  const repo = getRepository(),
    delivery =
      request.headers.get("x-shopify-event-id") ||
      request.headers.get("x-shopify-webhook-id");
  if (!delivery) return new Response(null, { status: 400 });
  const updates: OrderUpdate[] = [];
  let orderId = "";
  if (
    [
      "ORDERS_CREATE",
      "ORDERS_PAID",
      "ORDERS_UPDATED",
      "ORDERS_CANCELLED",
    ].includes(topic)
  ) {
    orderId = String(payload.id);
    for (const line of payload.line_items || []) {
      const properties = Object.fromEntries(
        (line.properties || []).map((p: { name: string; value: string }) => [
          p.name,
          p.value,
        ]),
      );
      const id = properties._sm_design_id,
        revision = Number(properties._sm_revision);
      if (typeof id !== "string" || !Number.isInteger(revision)) continue;
      const snapshot = await repo.getRevision(shop, id, revision);
      if (!snapshot) continue;
      const variantId = String(line.variant_id),
        quantity = Number(line.quantity);
      if (
        variantId !== snapshot.document.variantId ||
        quantity !== snapshot.document.quantity ||
        !verifyCartSignature(
          properties._sm_signature || "",
          id,
          revision,
          variantId,
          quantity,
          process.env.SHOPIFY_API_SECRET!,
        )
      ) {
        continue;
      }
      const paid = payload.financial_status === "paid" && !payload.cancelled_at;
      updates.push({ id, revision, orderId, paid });
    }
  }
  await repo.processWebhook(
    shop,
    delivery,
    orderId,
    updates,
    topic === "APP_UNINSTALLED",
  );
  return new Response(null, { status: 200 });
}
