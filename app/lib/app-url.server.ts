export function getAppUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.SHOPIFY_APP_URL || env.RENDER_EXTERNAL_URL;
  if (!value) return "";
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(
      env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("SHOPIFY_APP_URL debe ser una URL HTTPS pública.");
  return url.origin;
}
