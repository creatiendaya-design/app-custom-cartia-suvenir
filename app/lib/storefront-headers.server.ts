// This custom-distribution app serves this merchant's storefront. Never derive
// frame permissions from Origin, Referer or another caller-supplied URL.
const shop = "souvenir-made-xbc1wrvr.myshopify.com";
const storefrontOrigin = "https://souvenirmade.shop";

export function addStorefrontFrameAncestor(request: Request, headers: Headers) {
  const url = new URL(request.url);
  if (
    !/^\/studio\/[a-z0-9-]+\/?$/.test(url.pathname) ||
    url.searchParams.get("shop") !== shop
  )
    return;

  const policy =
    headers.get("Content-Security-Policy") ||
    `frame-ancestors https://${shop} https://admin.shopify.com;`;
  const directives = policy.split(";");
  const index = directives.findIndex((value) =>
    /^\s*frame-ancestors(?:\s|$)/.test(value),
  );
  if (index < 0)
    directives.unshift(`frame-ancestors https://${shop} ${storefrontOrigin}`);
  else {
    const ancestors = directives[index].trim().split(/\s+/);
    if (ancestors.includes("'none'")) return;
    if (!ancestors.includes(storefrontOrigin)) ancestors.push(storefrontOrigin);
    directives[index] = ancestors.join(" ");
  }
  headers.set("Content-Security-Policy", directives.join(";"));
}
