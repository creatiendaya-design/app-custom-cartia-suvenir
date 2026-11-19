import { describe, expect, it } from "vitest";
import {
  isLocalDemo,
  requireSameOrigin,
  readOwner,
  permittedShop,
} from "../app/lib/access.server";

describe("access boundaries", () => {
  it("only permits explicit loopback demo mode", () => {
    expect(
      isLocalDemo(new Request("http://127.0.0.1:3000"), { LOCAL_DEMO: "true" }),
    ).toBe(true);
    expect(
      isLocalDemo(new Request("https://store.example"), { LOCAL_DEMO: "true" }),
    ).toBe(false);
    expect(isLocalDemo(new Request("http://localhost"), {})).toBe(false);
    expect(
      isLocalDemo(new Request("http://localhost"), {
        LOCAL_DEMO: "true",
        NODE_ENV: "production",
      }),
    ).toBe(false);
    expect(
      isLocalDemo(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "1.2.3.4" },
        }),
        { LOCAL_DEMO: "true" },
      ),
    ).toBe(false);
  });
  it("blocks cross origin mutations", () => {
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost/api", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost/api", {
          headers: { origin: "http://localhost" },
        }),
      ),
    ).not.toThrow();
  });
  it("validates opaque customer capabilities and the single store", () => {
    expect(
      readOwner(
        new Request("http://localhost", {
          headers: { "x-design-owner": "123e4567-e89b-12d3-a456-426614174000" },
        }),
      ),
    ).toContain("123e");
    expect(() => readOwner(new Request("http://localhost"))).toThrow();
    expect(permittedShop("souvenir-made-xbc1wrvr.myshopify.com")).toBe(true);
    expect(permittedShop("evil.myshopify.com")).toBe(false);
  });
});
