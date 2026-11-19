import {
  areaHeight,
  type DesignDocument,
  type DesignElement,
  type ProductArea,
} from "./domain";

export const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
export function textLayout(element: Extract<DesignElement, { type: "text" }>) {
  const lines = element.text.split("\n").slice(0, 12);
  const fontSize = Math.min(
    element.fontSize,
    element.height / (lines.length * 1.25),
    element.width /
      Math.max(...lines.map((line) => Math.max(1, line.length) * 0.65)),
  );
  return {
    lines,
    fontSize,
    lineHeight: fontSize * 1.25,
    startY: (element.height - lines.length * fontSize * 1.25) / 2 + fontSize,
  };
}
export function artworkMarkup(
  document: DesignDocument,
  assets: Array<{ id: string; data: string }>,
) {
  return document.elements
    .map((element) => {
      const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`;
      if (element.type === "image") {
        const asset = assets.find((asset) => asset.id === element.assetId);
        if (!asset || !asset.data.startsWith("data:image/png;base64,"))
          throw new Error("No se encontró el original de una imagen.");
        return `<g transform="${transform}"><image href="${asset.data}" width="${element.width}" height="${element.height}" preserveAspectRatio="none" /></g>`;
      }
      const { lines, fontSize, lineHeight, startY } = textLayout(element);
      const x =
        element.align === "left"
          ? 0
          : element.align === "center"
            ? element.width / 2
            : element.width;
      return `<g transform="${transform}" fill="${element.color}" font-family="${escapeXml(element.font)}" font-size="${fontSize}" text-anchor="${element.align === "left" ? "start" : element.align === "center" ? "middle" : "end"}">${lines.map((line, index) => `<text x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</text>`).join("")}</g>`;
    })
    .join("");
}
export function svgArtwork(
  document: DesignDocument,
  product: ProductArea,
  assets: Array<{ id: string; data: string }>,
) {
  const height = areaHeight(product);
  const mask =
    product.mask === "ellipse"
      ? `<ellipse cx="500" cy="${height / 2}" rx="500" ry="${height / 2}"/>`
      : `<rect width="1000" height="${height}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${product.widthMm}mm" height="${product.heightMm}mm" viewBox="0 0 1000 ${height}"><defs><clipPath id="print-area">${mask}</clipPath></defs><g clip-path="url(#print-area)">${artworkMarkup(document, assets)}</g></svg>`;
}
