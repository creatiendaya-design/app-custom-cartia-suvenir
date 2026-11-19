import sharp from "sharp";
import { strToU8, zipSync } from "fflate";
import { svgArtwork } from "./artwork";
import type { DesignDocument, ProductArea } from "./domain";
import type { Asset, Revision } from "./repository.server";

export const renderArtwork = (
  document: DesignDocument,
  product: ProductArea,
  assets: Asset[],
) => svgArtwork(document, product, assets);
export async function buildProductionPackage(
  id: string,
  revision: number,
  snapshot: Revision,
  assets: Asset[],
) {
  const svg = renderArtwork(snapshot.document, snapshot.product, assets);
  const width = Math.round((snapshot.product.widthMm / 25.4) * 300),
    height = Math.round((snapshot.product.heightMm / 25.4) * 300);
  const png = await sharp(Buffer.from(svg), {
    density: 300,
    limitInputPixels: 60_000_000,
  })
    .resize(width, height)
    .png()
    .withMetadata({ density: 300 })
    .toBuffer();
  const files: Record<string, Uint8Array> = {
    "arte-frente.svg": strToU8(svg),
    "arte-frente.png": png,
    "ficha.json": strToU8(
      JSON.stringify({ designId: id, revision, ...snapshot }, null, 2),
    ),
    "LEER.txt": strToU8(
      `SOUVENIR MADE\nDiseño ${id} / revisión ${revision}\nProducto: ${snapshot.product.name}\nTécnica: ${snapshot.product.technique}\nÁrea: ${snapshot.product.widthMm} x ${snapshot.product.heightMm} mm\nCantidad: ${snapshot.document.quantity}\n\nVerificar medidas y fuentes en el software del taller. PNG a 300 ppp; sRGB, sin gestión de RIP, blanco ni espejo automáticos. SVG con texto editable, no convertido a contornos. La muestra física y la revisión técnica son obligatorias. Para bordado este paquete NO contiene ponchado.\n`,
    ),
  };
  for (const asset of assets)
    files[`originales/${asset.id}.png`] = Buffer.from(
      asset.data.split(",")[1],
      "base64",
    );
  return zipSync(files);
}
