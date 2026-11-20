import { describe, expect, it } from "vitest";
import { addStorefrontFrameAncestor } from "../app/lib/storefront-headers.server";

const shop = "souvenir-made-xbc1wrvr.myshopify.com";
const policy = `frame-ancestors https://${shop} https://admin.shopify.com; default-src 'self';`;

describe("storefront editor embedding", () => {
  it("allows the real storefront on studio documents, preserving other directives", () => {
    const headers = new Headers({ "Content-Security-Policy": policy });
    addStorefrontFrameAncestor(
      new Request(`https://app.example/studio/auto?shop=${shop}`),
      headers,
    );
    expect(headers.get("Content-Security-Policy")).toBe(
      `frame-ancestors https://${shop} https://admin.shopify.com https://souvenirmade.shop; default-src 'self';`,
    );
  });

  it.each([
    `/app?shop=${shop}`,
    `/auth/login?shop=${shop}`,
    "/studio/auto?shop=other.myshopify.com",
    "/studio/auto",
  ])("keeps the admin policy unchanged for %s", (path) => {
    const headers = new Headers({ "Content-Security-Policy": policy });
    addStorefrontFrameAncestor(
      new Request(`https://app.example${path}`),
      headers,
    );
    expect(headers.get("Content-Security-Policy")).toBe(policy);
  });

  it("does not trust a caller-supplied origin or referrer", () => {
    const headers = new Headers({ "Content-Security-Policy": policy });
    addStorefrontFrameAncestor(
      new Request(
        `https://app.example/studio/auto?shop=${shop}&origin=https://evil.example`,
        {
          headers: {
            Origin: "https://evil.example",
            Referer: "https://evil.example/",
          },
        },
      ),
      headers,
    );
    expect(headers.get("Content-Security-Policy")).toContain(
      "https://souvenirmade.shop",
    );
    expect(headers.get("Content-Security-Policy")).not.toContain(
      "evil.example",
    );
  });
});
