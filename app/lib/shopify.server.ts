import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { Session } from "@shopify/shopify-api";
import { getRepository } from "./repository.server";

const sessionStorage = {
  async storeSession(session: Session) {
    getRepository()
      .db.prepare("INSERT OR REPLACE INTO sessions VALUES (?,?,?)")
      .run(
        session.id,
        session.shop,
        JSON.stringify(session.toPropertyArray(true)),
      );
    return true;
  },
  async loadSession(id: string) {
    const row = getRepository()
      .db.prepare("SELECT json FROM sessions WHERE id=?")
      .get(id) as { json: string } | undefined;
    return row
      ? Session.fromPropertyArray(JSON.parse(row.json), true)
      : undefined;
  },
  async deleteSession(id: string) {
    getRepository().db.prepare("DELETE FROM sessions WHERE id=?").run(id);
    return true;
  },
  async deleteSessions(ids: string[]) {
    ids.forEach((id) =>
      getRepository().db.prepare("DELETE FROM sessions WHERE id=?").run(id),
    );
    return true;
  },
  async findSessionsByShop(shop: string) {
    const rows = getRepository()
      .db.prepare("SELECT json FROM sessions WHERE shop=?")
      .all(shop) as Array<{ json: string }>;
    return rows.map((row) =>
      Session.fromPropertyArray(JSON.parse(row.json), true),
    );
  },
};
let instance: ReturnType<typeof shopifyApp> | undefined;
export function getShopify() {
  if (
    !process.env.SHOPIFY_API_KEY ||
    !process.env.SHOPIFY_API_SECRET ||
    !process.env.SHOPIFY_APP_URL
  ) {
    throw new Response(
      "Falta configurar la app en Shopify. Consulta README.md.",
      { status: 503 },
    );
  }
  return (instance ??= shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.October26,
    appUrl: process.env.SHOPIFY_APP_URL,
    scopes: (
      process.env.SCOPES || "read_products,read_orders,write_draft_orders"
    ).split(","),
    authPathPrefix: "/auth",
    distribution: AppDistribution.SingleMerchant,
    sessionStorage,
    future: { expiringOfflineAccessTokens: true },
  }));
}
