import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs, HeadersArgs } from "react-router";
import { loader as launch } from "../app/routes/index";
import * as authRoute from "../app/routes/auth";

const shop = "souvenir-made-xbc1wrvr.myshopify.com";
const host = Buffer.from(
  "admin.shopify.com/store/souvenir-made-xbc1wrvr",
).toString("base64");
const args = (url: string) =>
  ({
    request: new Request(url),
    params: {},
    context: {},
  }) as LoaderFunctionArgs;

afterEach(() => vi.unstubAllEnvs());

describe("Shopify embedded launch", () => {
  it("opens the authenticated dashboard and preserves Shopify launch parameters", () => {
    const search = `?shop=${shop}&embedded=1&host=${encodeURIComponent(host)}&id_token=test-token&hmac=test-hmac&timestamp=123`;
    const response = launch(args(`https://app.example/${search}`));
    const destination = new URL(
      response.headers.get("Location")!,
      "https://app.example",
    );
    expect(destination.pathname).toBe("/app");
    expect(destination.search).toBe(search);
  });

  it("keeps the sign-in page available for a direct visit without shop context", () => {
    expect(launch(args("https://app.example/")).headers.get("Location")).toBe(
      "/auth/login",
    );
  });

  it("opens the local demo without requiring Shopify", () => {
    vi.stubEnv("LOCAL_DEMO", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(launch(args("http://127.0.0.1:3000/")).headers.get("Location")).toBe(
      "/app",
    );
  });

  it("preserves Shopify authentication response headers", () => {
    const headers = (authRoute as Record<string, unknown>).headers;
    expect(headers).toBeTypeOf("function");
    const source = new Headers({
      "Content-Security-Policy": "frame-ancestors https://admin.shopify.com",
      "X-Shopify-API-Request-Failure-Reauthorize": "1",
    });
    const result = (headers as (args: HeadersArgs) => Headers)({
      loaderHeaders: source,
      parentHeaders: new Headers(),
      actionHeaders: new Headers(),
      errorHeaders: undefined,
    });
    expect(result.get("Content-Security-Policy")).toBe(
      source.get("Content-Security-Policy"),
    );
  });

  it("uses the SDK App Bridge bounce when a launch needs a fresh session token", async () => {
    vi.stubEnv("SHOPIFY_API_KEY", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("SHOPIFY_API_SECRET", "test-only-secret");
    vi.stubEnv("SHOPIFY_APP_URL", "https://app.example");
    const url = `https://app.example/auth?shop=${shop}&embedded=1&host=${encodeURIComponent(host)}`;
    let result: unknown;
    try {
      await authRoute.loader(args(url));
    } catch (response) {
      result = response;
    }
    expect(result).toBeInstanceOf(Response);
    const bounce = new URL(
      (result as Response).headers.get("Location")!,
      "https://app.example",
    );
    expect(bounce.origin).toBe("https://app.example");
    expect(bounce.pathname).toBe("/auth/session-token");
    try {
      await authRoute.loader(args(bounce.toString()));
    } catch (response) {
      result = response;
    }
    expect((result as Response).status).toBe(200);
    expect(await (result as Response).text()).toContain("app-bridge.js");
    expect(
      (result as Response).headers.get("Content-Security-Policy"),
    ).toContain("https://admin.shopify.com");
  });
});
