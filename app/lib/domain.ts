import { z } from "zod";

export const fonts = [
  "Arial",
  "Georgia",
  "Verdana",
  "Trebuchet MS",
  "Courier New",
] as const;
const geometry = {
  id: z.string().min(1).max(100),
  x: z.number().finite().min(-2000).max(3000),
  y: z.number().finite().min(-2000).max(5000),
  width: z.number().finite().min(5).max(3000),
  height: z.number().finite().min(5).max(5000),
  rotation: z.number().finite().min(-360).max(360),
};
const textSchema = z.object({
  ...geometry,
  type: z.literal("text"),
  text: z.string().max(240),
  font: z.enum(fonts),
  fontSize: z.number().min(10).max(500),
  color: z.string().regex(/^#[\da-f]{6}$/i),
  align: z.enum(["left", "center", "right"]),
});
const imageSchema = z.object({
  ...geometry,
  type: z.literal("image"),
  assetId: z.string().min(1).max(100),
  naturalWidth: z.number().int().positive().max(20000),
  naturalHeight: z.number().int().positive().max(20000),
});
export const documentSchema = z.object({
  productId: z.string().min(1).max(100),
  variantId: z.string().max(100),
  color: z.string().regex(/^#[\da-f]{6}$/i),
  quantity: z.number().int().min(1).max(1000),
  elements: z
    .array(z.discriminatedUnion("type", [textSchema, imageSchema]))
    .max(30),
});
export type DesignDocument = z.infer<typeof documentSchema>;
export type DesignElement = DesignDocument["elements"][number];
export const productSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  technique: z.string().min(1).max(100),
  shape: z.enum([
    "cap",
    "tumbler",
    "shirt",
    "plate",
    "pen",
    "keychain",
    "frame",
    "glass",
    "card",
  ]),
  widthMm: z.number().min(5).max(600),
  heightMm: z.number().min(5).max(600),
  minDpi: z.number().int().min(72).max(600),
  verified: z.boolean(),
  enabled: z.boolean(),
  mask: z.enum(["rect", "ellipse"]),
  stage: z.number().int().min(1).max(4),
  shopifyProductId: z.string().max(100),
  variantId: z.string().regex(/^$|^\d+$/),
  image: z.string().regex(/^$|^\/catalog\/[a-z0-9.-]+$/),
  baseColor: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .default("#e6d6bc"),
  areaX: z.number().min(0).max(900),
  areaY: z.number().min(0).max(900),
  areaWidth: z.number().min(20).max(800),
});
export type Product = z.infer<typeof productSchema>;
export type ReviewStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "production";
export type PaymentStatus = "pending" | "paid";
export interface ProductArea {
  id: string;
  name: string;
  technique: string;
  widthMm: number;
  heightMm: number;
  minDpi: number;
  verified: boolean;
  mask: "rect" | "ellipse";
}

export const areaHeight = (
  product: Pick<ProductArea, "widthMm" | "heightMm">,
) => (product.heightMm / product.widthMm) * 1000;
export const effectiveDpi = (pixels: number, millimeters: number) =>
  millimeters > 0 ? pixels / (millimeters / 25.4) : 0;
export function corners(
  element: Pick<DesignElement, "x" | "y" | "width" | "height" | "rotation">,
) {
  const angle = (element.rotation * Math.PI) / 180;
  const cx = element.x + element.width / 2,
    cy = element.y + element.height / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => ({
    x:
      cx +
      ((sx * element.width) / 2) * Math.cos(angle) -
      ((sy * element.height) / 2) * Math.sin(angle),
    y:
      cy +
      ((sx * element.width) / 2) * Math.sin(angle) +
      ((sy * element.height) / 2) * Math.cos(angle),
  }));
}
export function rotateBounds(element: DesignElement) {
  const points = corners(element);
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
export function validateDocument(
  document: DesignDocument,
  product: ProductArea,
): string[] {
  const issues: string[] = [],
    height = areaHeight(product);
  if (document.productId !== product.id)
    issues.push("El producto del diseño no coincide.");
  if (!document.elements.length)
    issues.push("Añade un texto o una imagen al diseño.");
  if (
    new Set(document.elements.map((e) => e.id)).size !==
    document.elements.length
  )
    issues.push("Hay elementos duplicados en el diseño.");
  for (const element of document.elements) {
    const outside = corners(element).some((p) =>
      product.mask === "ellipse"
        ? ((p.x - 500) / 500) ** 2 + ((p.y - height / 2) / (height / 2)) ** 2 >
          1.002
        : p.x < -0.1 || p.x > 1000.1 || p.y < -0.1 || p.y > height + 0.1,
    );
    if (outside)
      issues.push(
        "Un elemento está fuera del área de personalización. Reduce su tamaño o céntralo.",
      );
    if (element.type === "text" && !element.text.trim())
      issues.push("Completa o elimina el texto vacío.");
    if (element.type === "image") {
      const dpi = Math.min(
        effectiveDpi(
          element.naturalWidth,
          (element.width / 1000) * product.widthMm,
        ),
        effectiveDpi(
          element.naturalHeight,
          (element.height / 1000) * product.widthMm,
        ),
      );
      if (dpi < product.minDpi)
        issues.push(
          `Imagen con resolución insuficiente: ${Math.round(dpi)} ppp; mínimo ${product.minDpi}. Reduce su tamaño o sube otra imagen.`,
        );
    }
  }
  return [...new Set(issues)];
}
export function canProduce(input: {
  status: string;
  payment: string;
  revision: number;
  approvedRevision: number | null;
  verified: boolean;
}) {
  return (
    input.status === "approved" &&
    input.payment === "paid" &&
    input.revision === input.approvedRevision &&
    input.verified
  );
}
export const statusLabels: Record<ReviewStatus, string> = {
  draft: "Borrador",
  submitted: "En revisión",
  changes_requested: "Requiere cambios",
  approved: "Aprobado",
  production: "En producción",
};
export function defaultDocument(product: Product): DesignDocument {
  return {
    productId: product.id,
    variantId: product.variantId,
    color: product.baseColor,
    quantity: 1,
    elements: [
      {
        id: "welcome",
        type: "text",
        x: 100,
        y: areaHeight(product) * 0.3,
        width: 800,
        height: areaHeight(product) * 0.4,
        rotation: 0,
        text: "Tu marca\naquí",
        font: "Georgia",
        fontSize: 130,
        color: "#122d4e",
        align: "center",
      },
    ],
  };
}
