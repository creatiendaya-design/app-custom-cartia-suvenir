import type { ActionFunctionArgs } from "react-router";
import { getShopify } from "../lib/shopify.server";
import { getRepository } from "../lib/repository.server";
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
  repo.db.exec("BEGIN IMMEDIATE");
  try {
    if (!repo.recordEvent(shop, delivery)) {
      repo.db.exec("COMMIT");
      return new Response(null, { status: 200 });
    }
    if (topic === "APP_UNINSTALLED")
      repo.db.prepare("DELETE FROM sessions WHERE shop=?").run(shop);
    if (
      [
        "ORDERS_CREATE",
        "ORDERS_PAID",
        "ORDERS_UPDATED",
        "ORDERS_CANCELLED",
      ].includes(topic)
    ) {
      const validDesigns = new Set<string>();
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
        const snapshot = repo.getRevision(shop, id, revision);
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
          repo.invalidateOrder(shop, id, String(payload.id));
          continue;
        }
        const paid =
          payload.financial_status === "paid" && !payload.cancelled_at;
        repo.attachOrder(shop, id, revision, String(payload.id), paid);
        validDesigns.add(id);
      }
      for (const design of repo.listDesigns(shop)) {
        if (
          design.orderId === String(payload.id) &&
          !validDesigns.has(design.id)
        )
          repo.invalidateOrder(shop, design.id, String(payload.id));
      }
    }
    repo.db.exec("COMMIT");
  } catch (error) {
    repo.db.exec("ROLLBACK");
    throw error;
  }
  return new Response(null, { status: 200 });
}
