import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  requireMerchant,
  requirePublicShop,
  requireSameOrigin,
  readOwner,
} from "../lib/access.server";
import { getRepository, type Revision } from "../lib/repository.server";
import {
  documentSchema,
  productSchema,
  resolveAssignedProduct,
  type ProductAssignment,
} from "../lib/domain";
import {
  demoCatalog,
  demoAssignments,
  fetchAssignments,
  fetchCatalogPage,
  selectedProductsSchema,
} from "../lib/shopify-catalog.server";
import { buildProductionPackage } from "../lib/export.server";
import { cartSignature } from "../lib/integration.server";
import { createOrUpdateQuote } from "../lib/quotes.server";
const resourceId = z.string().min(1).max(100);
const revisionSchema = z.number().int().positive();
async function assetsFor(shop: string, snapshot: Revision) {
  const repo = getRepository();
  return (
    await Promise.all(
      [
        ...new Set(
          snapshot.document.elements.flatMap((e) =>
            e.type === "image" ? [e.assetId] : [],
          ),
        ),
      ].map((id) => repo.getAsset(shop, id)),
    )
  ).filter((asset): asset is NonNullable<typeof asset> => !!asset);
}
async function limitedJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Response("Se requiere JSON.", { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw new Response("Faltan datos.", { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 12000000) {
      await reader.cancel();
      throw new Response("El archivo es demasiado grande. Máximo 8 MB.", {
        status: 413,
      });
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Response("Datos no válidos.", { status: 400 });
  }
}
const fail = (error: unknown) => {
  if (error instanceof Response) return error;
  return Response.json(
    {
      error:
        error instanceof z.ZodError
          ? "Revisa los datos del formulario."
          : error instanceof Error
            ? error.message
            : "No se pudo guardar.",
    },
    { status: 400 },
  );
};
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const repo = getRepository(),
      query = new URL(request.url).searchParams;
    if (params.intent === "canvas") {
      const shop = await requirePublicShop(request);
      const id = z.string().uuid().parse(query.get("id"));
      const metadata = await repo.getAssetMetadata(shop, id);
      if (metadata?.purpose !== "canvas")
        throw new Response("Imagen no encontrada.", { status: 404 });
      const asset = await repo.getAsset(shop, id);
      if (!asset) throw new Response("Imagen no encontrada.", { status: 404 });
      return new Response(Buffer.from(asset.data.split(",")[1], "base64"), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (params.intent === "design") {
      const shop = await requirePublicShop(request),
        owner = readOwner(request),
        id = resourceId.parse(query.get("id"));
      const design = await repo.getOwnedDesign(shop, owner, id);
      if (!design) throw new Response("Diseño no encontrado.", { status: 404 });
      const snapshot = (await repo.getRevision(shop, id, design.revision))!;
      return Response.json(
        {
          design: { ...design, owner: undefined },
          snapshot,
          assets: await assetsFor(shop, snapshot),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const merchant = await requireMerchant(request);
    if (params.intent === "review-detail" || params.intent === "export") {
      const id = resourceId.parse(query.get("id")),
        design = await repo.getDesign(merchant.shop, id);
      if (!design) throw new Response("Diseño no encontrado.", { status: 404 });
      const revision = query.has("revision")
        ? revisionSchema.parse(Number(query.get("revision")))
        : design.revision;
      const snapshot = await repo.getRevision(merchant.shop, id, revision);
      if (!snapshot)
        throw new Response("Revisión no encontrada.", { status: 404 });
      const assets = await assetsFor(merchant.shop, snapshot);
      if (params.intent === "export") {
        const bytes = await buildProductionPackage(
          id,
          revision,
          snapshot,
          assets,
        );
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="souvenir-${id}-r${revision}.zip"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return Response.json(
        {
          design: { ...design, owner: undefined },
          snapshot,
          assets,
          history: await repo.history(merchant.shop, id),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (params.intent === "shopify-products") {
      const search = (query.get("query") || "").slice(0, 100),
        after = query.get("after") || undefined;
      if (merchant.demo)
        return Response.json({
          products: demoCatalog.filter((p) =>
            p.title.toLowerCase().includes(search.toLowerCase()),
          ),
          pageInfo: { hasNextPage: false, endCursor: null },
        });
      const { getShopify } = await import("../lib/shopify.server");
      const { admin } = await getShopify().authenticate.admin(request);
      return Response.json(
        await fetchCatalogPage(admin.graphql, search, after),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    throw new Response("Recurso no encontrado.", { status: 404 });
  } catch (error) {
    return fail(error);
  }
}
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method !== "POST")
      throw new Response("Método no permitido.", { status: 405 });
    const repo = getRepository(),
      body = await limitedJson(request);
    if (["save", "upload", "submit", "cart"].includes(params.intent!)) {
      const shop = await requirePublicShop(request),
        owner = readOwner(request);
      if (params.intent === "upload") {
        const data = z
          .string()
          .max(11000000)
          .regex(/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/)
          .parse(body.data);
        const original = Buffer.from(data.split(",")[1], "base64");
        if (original.length > 8000000)
          throw new Error("Máximo 8 MB por imagen.");
        const pipeline = sharp(original, {
          limitInputPixels: 16000000,
          failOn: "error",
        });
        const metadata = await pipeline.metadata();
        if (!["png", "jpeg"].includes(metadata.format || ""))
          throw new Error("Sube una imagen PNG o JPEG válida.");
        const { data: normalized, info } = await pipeline
          .rotate()
          .png()
          .toBuffer({ resolveWithObject: true });
        if (normalized.length > 16000000)
          throw new Error(
            "La imagen procesada es demasiado grande. Reduce su resolución.",
          );
        const asset = {
          id: randomUUID(),
          shop,
          owner,
          name: z.string().max(120).parse(body.name),
          width: info.width,
          height: info.height,
          data: `data:image/png;base64,${normalized.toString("base64")}`,
        };
        await repo.putAsset(asset);
        return Response.json({
          asset: { ...asset, shop: undefined, owner: undefined },
        });
      }
      if (params.intent === "save") {
        const document = documentSchema.parse(body.document);
        const source = await repo.getProduct(shop, document.productId);
        const configured = source
          ? resolveAssignedProduct(source, document.variantId)
          : null;
        if (
          shop !== "demo" &&
          (!configured ||
            document.variantId !== configured.variantId ||
            document.color !== configured.baseColor)
        )
          throw new Error(
            "La variante o el color no coincide con la configuración del producto.",
          );
        for (const element of document.elements)
          if (element.type === "image") {
            const asset = await repo.getAssetMetadata(shop, element.assetId);
            if (
              !asset ||
              asset.owner !== owner ||
              asset.width !== element.naturalWidth ||
              asset.height !== element.naturalHeight
            )
              throw new Error(
                "No se encontró una imagen original válida para este diseño.",
              );
          }
        const saved = await repo.saveDesign(
          shop,
          owner,
          document,
          body.id ? resourceId.parse(body.id) : undefined,
          body.expectedRevision === undefined
            ? undefined
            : revisionSchema.parse(body.expectedRevision),
        );
        return Response.json({ design: { ...saved, owner: undefined } });
      }
      const id = resourceId.parse(body.id),
        revision = revisionSchema.parse(body.revision);
      if (params.intent === "submit")
        return Response.json({
          design: {
            ...(await repo.submitDesign(shop, owner, id, revision)),
            owner: undefined,
          },
        });
      const design = await repo.getOwnedDesign(shop, owner, id),
        snapshot = await repo.getRevision(shop, id, revision);
      if (
        !design ||
        !snapshot ||
        design.revision !== revision ||
        design.status !== "submitted"
      )
        throw new Error("Envía la revisión actual antes de continuar.");
      const source = await repo.getProduct(shop, snapshot.product.id);
      const product = source
        ? resolveAssignedProduct(source, snapshot.document.variantId)
        : null;
      if (
        shop === "demo" ||
        !product?.enabled ||
        product.purchaseMode !== "product_price" ||
        !product.variantId ||
        product.variantId !== snapshot.document.variantId
      )
        throw new Error(
          "Este producto está configurado para revisión y cotización.",
        );
      if (!process.env.SHOPIFY_API_SECRET)
        throw new Error("Falta configurar Shopify.");
      const { quantity, variantId } = snapshot.document;
      return Response.json({
        item: {
          id: variantId,
          quantity,
          properties: {
            Personalización: `Diseño ${id.slice(0, 8)} / revisión ${revision}`,
            _sm_design_id: id,
            _sm_revision: String(revision),
            _sm_signature: cartSignature(
              id,
              revision,
              variantId,
              quantity,
              process.env.SHOPIFY_API_SECRET,
            ),
          },
        },
      });
    }
    const merchant = await requireMerchant(request);
    if (params.intent === "canvas-upload") {
      const data = z
        .string()
        .max(11000000)
        .regex(/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/)
        .parse(body.data);
      const original = Buffer.from(data.split(",")[1], "base64");
      if (original.length > 8000000) throw new Error("Máximo 8 MB por imagen.");
      const pipeline = sharp(original, {
        limitInputPixels: 16000000,
        failOn: "error",
      });
      const metadata = await pipeline.metadata();
      if (!["png", "jpeg", "webp"].includes(metadata.format || ""))
        throw new Error("Sube una imagen PNG, JPEG o WebP válida.");
      const { data: normalized, info } = await pipeline
        .rotate()
        .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true });
      if (normalized.length > 16000000)
        throw new Error(
          "La imagen procesada es demasiado grande. Reduce su resolución.",
        );
      const asset = {
        id: randomUUID(),
        shop: merchant.shop,
        owner: merchant.actor,
        purpose: "canvas" as const,
        name: z.string().min(1).max(120).parse(body.name),
        width: info.width,
        height: info.height,
        data: `data:image/png;base64,${normalized.toString("base64")}`,
      };
      await repo.putAsset(asset);
      return Response.json(
        {
          canvas: {
            assetId: asset.id,
            shop: merchant.shop,
            name: asset.name,
            fit: "contain",
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      params.intent === "create-personalizer" ||
      params.intent === "assign-products"
    ) {
      const ids = selectedProductsSchema.parse(body.productIds || []);
      let assignments: ProductAssignment[];
      if (merchant.demo) assignments = demoAssignments(ids);
      else if (!ids.length) assignments = [];
      else {
        const { getShopify } = await import("../lib/shopify.server");
        const { admin } = await getShopify().authenticate.admin(request);
        assignments = await fetchAssignments(admin.graphql, ids);
      }
      if (params.intent === "assign-products")
        return Response.json({
          product: await repo.assignProducts(
            merchant.shop,
            resourceId.parse(body.id),
            assignments,
          ),
        });
      const configuration = productSchema.parse(body.product);
      return Response.json({
        product: await repo.createPersonalizer(
          merchant.shop,
          resourceId.parse(body.templateId),
          configuration.name,
          configuration,
          assignments,
        ),
      });
    }
    if (params.intent === "product")
      return Response.json({
        product: await repo.updateProduct(
          merchant.shop,
          productSchema.parse(body.product),
        ),
      });
    const id = resourceId.parse(body.id),
      revision = revisionSchema.parse(body.revision);
    if (params.intent === "review")
      return Response.json({
        design: await repo.reviewDesign(
          merchant.shop,
          id,
          revision,
          z.enum(["approved", "changes_requested"]).parse(body.status),
          z
            .string()
            .max(2000)
            .parse(body.note || ""),
          merchant.actor,
        ),
      });
    if (params.intent === "production")
      return Response.json({
        design: await repo.startProduction(
          merchant.shop,
          id,
          revision,
          merchant.actor,
        ),
      });
    if (params.intent === "demo-payment") {
      if (!merchant.demo) throw new Response("No permitido.", { status: 403 });
      return Response.json({
        design: await repo.setDemoPayment(merchant.shop, id, "paid"),
      });
    }
    if (params.intent === "quote") {
      if (merchant.demo)
        throw new Error("El enlace de pago se habilita al conectar Shopify.");
      const unitPrice = z
        .number()
        .int()
        .min(1)
        .max(100000000)
        .parse(body.unitPriceCents);
      const { getShopify } = await import("../lib/shopify.server");
      const { admin } = await getShopify().authenticate.admin(request);
      const design = await createOrUpdateQuote(
        repo,
        admin.graphql,
        merchant.shop,
        id,
        revision,
        unitPrice,
        merchant.actor,
        process.env.SHOPIFY_API_SECRET || "",
      );
      return Response.json({
        invoiceUrl: design.invoiceUrl,
        quoteUnitPriceCents: design.quoteUnitPriceCents,
        quoteCurrency: design.quoteCurrency,
      });
    }
    throw new Response("Acción no encontrada.", { status: 404 });
  } catch (error) {
    return fail(error);
  }
}
