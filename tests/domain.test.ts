import { describe, expect, it } from "vitest";
import {
  documentSchema,
  validateDocument,
  canProduce,
  effectiveDpi,
  rotateBounds,
} from "../app/lib/domain";

const product = {
  id: "cap",
  name: "Gorra",
  technique: "Láser",
  verified: true,
  widthMm: 80,
  heightMm: 50,
  minDpi: 150,
  mask: "rect" as const,
};
const text = {
  id: "text-1",
  type: "text" as const,
  x: 100,
  y: 100,
  width: 500,
  height: 160,
  rotation: 0,
  text: "Mi recuerdo",
  font: "Arial" as const,
  fontSize: 90,
  color: "#122d4e",
  align: "center" as const,
};
const doc = {
  productId: "cap",
  variantId: "",
  color: "#e6d6bc",
  quantity: 1,
  elements: [text],
};

describe("document validation", () => {
  it("accepts accented text and validates on a physical area", () => {
    expect(documentSchema.safeParse(doc).success).toBe(true);
    expect(validateDocument(doc, product)).toEqual([]);
  });
  it("rejects unsupported types, fonts and excessive quantities", () => {
    expect(documentSchema.safeParse({ ...doc, quantity: 0 }).success).toBe(
      false,
    );
    expect(
      documentSchema.safeParse({
        ...doc,
        elements: [{ ...text, font: "evil" }],
      }).success,
    ).toBe(false);
    expect(
      documentSchema.safeParse({
        ...doc,
        elements: [{ ...text, type: "script" }],
      }).success,
    ).toBe(false);
  });
  it("rejects empty designs and out of area elements", () => {
    expect(
      validateDocument({ ...doc, elements: [] }, product).length,
    ).toBeGreaterThan(0);
    expect(
      validateDocument(
        { ...doc, elements: [{ ...text, x: 950 }] },
        product,
      ).join(),
    ).toMatch(/área/);
  });
  it("checks rotated corners and oval clipping", () => {
    expect(
      rotateBounds({ ...text, x: 0, y: 0, rotation: 45 }).minY,
    ).toBeLessThan(0);
    expect(
      validateDocument(
        {
          ...doc,
          elements: [{ ...text, x: 0, y: 0, width: 200, height: 100 }],
        },
        { ...product, mask: "ellipse" },
      ).length,
    ).toBeGreaterThan(0);
  });
  it("computes image quality from its physical placed size", () => {
    expect(effectiveDpi(600, 50.8)).toBeCloseTo(300);
    const image = {
      id: "image-1",
      type: "image" as const,
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
      rotation: 0,
      assetId: "asset",
      naturalWidth: 100,
      naturalHeight: 100,
    };
    expect(
      validateDocument({ ...doc, elements: [image] }, product).join(),
    ).toMatch(/resolución/);
  });
  it("never authorizes unverified dimensions, unpaid or superseded designs", () => {
    const input = {
      status: "approved",
      payment: "paid",
      revision: 2,
      approvedRevision: 2,
      verified: true,
    };
    expect(canProduce(input)).toBe(true);
    for (const change of [
      { verified: false },
      { payment: "pending" },
      { approvedRevision: 1 },
      { status: "changes_requested" },
    ]) {
      expect(canProduce({ ...input, ...change })).toBe(false);
    }
  });
});
