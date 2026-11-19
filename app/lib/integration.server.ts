import { createHmac, timingSafeEqual } from "node:crypto";
export function cartSignature(
  id: string,
  revision: number,
  variantId: string,
  quantity: number,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([id, revision, variantId, quantity]))
    .digest("hex");
}
export function verifyCartSignature(
  value: string,
  id: string,
  revision: number,
  variantId: string,
  quantity: number,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(
    Buffer.from(value, "hex"),
    Buffer.from(
      cartSignature(id, revision, variantId, quantity, secret),
      "hex",
    ),
  );
}
