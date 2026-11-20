export function storefrontMessageOrigin(referrer: string, shop: string) {
  try {
    const origin = new URL(referrer).origin;
    if (origin === `https://${shop}`) return origin;
    if (
      shop === "souvenir-made-xbc1wrvr.myshopify.com" &&
      origin === "https://souvenirmade.shop"
    )
      return origin;
  } catch {
    /* A direct preview has no storefront parent. */
  }
  return "";
}
