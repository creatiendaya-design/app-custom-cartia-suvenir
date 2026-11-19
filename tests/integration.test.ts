import { describe, expect, it } from "vitest";
import {
  cartSignature,
  verifyCartSignature,
} from "../app/lib/integration.server";
describe("cart integrity", () => {
  it("binds the design to its revision, variant and quantity", () => {
    const signature = cartSignature("a", 2, "123", 10, "test-secret");
    expect(
      verifyCartSignature(signature, "a", 2, "123", 10, "test-secret"),
    ).toBe(true);
    expect(
      verifyCartSignature(signature, "a", 2, "123", 11, "test-secret"),
    ).toBe(false);
    expect(
      verifyCartSignature(signature, "a", 3, "123", 10, "test-secret"),
    ).toBe(false);
    expect(
      verifyCartSignature("invalid", "a", 2, "123", 10, "test-secret"),
    ).toBe(false);
  });
});
