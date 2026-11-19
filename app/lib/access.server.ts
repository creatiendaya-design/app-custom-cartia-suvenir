import "dotenv/config";
import { z } from "zod";
import { getAppUrl } from "./app-url.server";

export function isLocalDemo(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.LOCAL_DEMO === "true" &&
    env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(request.url).hostname,
    ) &&
    !["forwarded", "x-forwarded-for", "x-forwarded-host"].some((name) =>
      request.headers.has(name),
    )
  );
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  const configured = getAppUrl();
  if (!origin || (origin !== expected && origin !== configured))
    throw new Response("Origen no permitido.", { status: 403 });
}
export function readOwner(request: Request) {
  const value = request.headers.get("x-design-owner");
  if (!z.string().uuid().safeParse(value).success)
    throw new Response("Identificación de diseño no válida.", { status: 401 });
  return value!;
}
export function permittedShop(shop: string) {
  return (
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) &&
    shop ===
      (process.env.SHOPIFY_STORE_DOMAIN ||
        "souvenir-made-xbc1wrvr.myshopify.com")
  );
}
export async function requireMerchant(request: Request) {
  if (isLocalDemo(request))
    return {
      shop: "demo",
      actor: "Taller (prueba local)",
      demo: true,
      apiKey: "",
    };
  const { getShopify } = await import("./shopify.server");
  const { session } = await getShopify().authenticate.admin(request);
  if (!permittedShop(session.shop))
    throw new Response("Tienda no autorizada.", { status: 403 });
  return {
    shop: session.shop,
    actor: session.id,
    demo: false,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
}
export async function requirePublicShop(request: Request) {
  if (isLocalDemo(request)) return "demo";
  const shop =
    new URL(request.url).searchParams.get("shop") ||
    request.headers.get("x-design-shop") ||
    "";
  if (!permittedShop(shop))
    throw new Response("Tienda no autorizada.", { status: 403 });
  const { getRepository } = await import("./repository.server");
  const installed = await getRepository().hasSession(shop);
  if (!installed)
    throw new Response("La app debe instalarse en la tienda.", { status: 403 });
  return shop;
}
