import "dotenv/config";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addStorefrontFrameAncestor } from "./lib/storefront-headers.server";
export const streamTimeout = 5000;
export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  if (process.env.SHOPIFY_API_KEY) {
    const { getShopify } = await import("./lib/shopify.server");
    getShopify().addDocumentResponseHeaders(request, headers);
  }
  addStorefrontFrameAncestor(request, headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  return new Promise<Response>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={context} url={request.url} />,
      {
        [isbot(request.headers.get("user-agent") || "")
          ? "onAllReady"
          : "onShellReady"]: () => {
          const body = new PassThrough();
          headers.set("Content-Type", "text/html; charset=utf-8");
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              status,
              headers,
            }),
          );
          pipe(body);
          body.on("end", () => clearTimeout(timer));
        },
        onShellError: reject,
        onError(error) {
          status = 500;
          console.error("Rendering failed", error);
        },
      },
    );
    timer = setTimeout(abort, streamTimeout + 1000);
  });
}
