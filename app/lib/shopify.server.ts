import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { Session } from "@shopify/shopify-api";
import { getRepository } from "./repository.server";
import { getAppUrl } from "./app-url.server";

const sessionStorage = {
  async storeSession(session: Session) {
    if (session.shop !== configuredShop())
      throw new Error("Tienda no autorizada para guardar la sesión.");
    await getRepository().storeSession({
      id: session.id,
      shop: session.shop,
      properties: session.toPropertyArray(true),
    });
    return true;
  },
  async loadSession(id: string) {
    const row = await getRepository().loadSession(configuredShop(), id);
    return row ? Session.fromPropertyArray(row.properties, true) : undefined;
  },
  async deleteSession(id: string) {
    await getRepository().deleteSessions(configuredShop(), [id]);
    return true;
  },
  async deleteSessions(ids: string[]) {
    await getRepository().deleteSessions(configuredShop(), ids);
    return true;
  },
  async findSessionsByShop(shop: string) {
    if (shop !== configuredShop()) return [];
    const rows = await getRepository().findSessions(shop);
    return rows.map((row) => Session.fromPropertyArray(row.properties, true));
  },
};
const configuredShop = () =>
  process.env.SHOPIFY_STORE_DOMAIN || "souvenir-made-xbc1wrvr.myshopify.com";
let instance: ReturnType<typeof shopifyApp> | undefined;
export function getShopify() {
  if (
    !process.env.SHOPIFY_API_KEY ||
    !process.env.SHOPIFY_API_SECRET ||
    !getAppUrl()
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
    appUrl: getAppUrl(),
    scopes: (
      process.env.SCOPES || "read_products,read_orders,write_draft_orders"
    ).split(","),
    authPathPrefix: "/auth",
    distribution: AppDistribution.SingleMerchant,
    sessionStorage,
    future: { expiringOfflineAccessTokens: true },
  }));
}
