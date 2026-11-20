import { useId } from "react";
import type { Product, DesignDocument } from "../lib/domain";
import { areaHeight } from "../lib/domain";
import { textLayout } from "../lib/artwork";

export interface PreviewAsset {
  id: string;
  data: string;
  name?: string;
  width?: number;
  height?: number;
}
export function Artwork({
  document,
  assets,
}: {
  document: DesignDocument;
  assets: PreviewAsset[];
}) {
  return (
    <>
      {document.elements.map((element) => (
        <g
          key={element.id}
          transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}
        >
          {element.type === "image" ? (
            <image
              href={assets.find((a) => a.id === element.assetId)?.data}
              width={element.width}
              height={element.height}
              preserveAspectRatio="none"
            />
          ) : (
            (() => {
              const layout = textLayout(element),
                x =
                  element.align === "left"
                    ? 0
                    : element.align === "center"
                      ? element.width / 2
                      : element.width;
              return (
                <g
                  fill={element.color}
                  fontFamily={element.font}
                  fontSize={layout.fontSize}
                  textAnchor={
                    element.align === "left"
                      ? "start"
                      : element.align === "center"
                        ? "middle"
                        : "end"
                  }
                >
                  {layout.lines.map((line, index) => (
                    <text
                      key={index}
                      x={x}
                      y={layout.startY + index * layout.lineHeight}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })()
          )}
        </g>
      ))}
    </>
  );
}
export function ProductBase({
  product,
  color,
}: {
  product: Product;
  color: string;
}) {
  const id = useId().replaceAll(":", "");
  const capImage: Record<string, string> = {
    "#e6d6bc": "cap-1.jpg",
    "#182b4f": "cap-5.jpg",
    "#151515": "cap-3.jpg",
    "#f1ece4": "cap-4.jpg",
    "#c83c3c": "cap-2.jpg",
    "#d4e4ec": "cap-0.jpg",
  };
  if (product.canvas)
    return (
      <image
        href={`/api/canvas?shop=${encodeURIComponent(product.canvas.shop)}&id=${product.canvas.assetId}`}
        x="0"
        y="0"
        width="1000"
        height="900"
        preserveAspectRatio={
          product.canvas.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
        }
      />
    );
  if (product.shape === "cap")
    return (
      <image
        href={capImage[color] ? `/catalog/${capImage[color]}` : product.image}
        x="80"
        y="0"
        width="840"
        height="840"
        preserveAspectRatio="xMidYMid meet"
      />
    );
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-surface`}>
          <stop stopColor={color} />
          <stop offset="0.48" stopColor="#ffffff" stopOpacity="0.65" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
        <filter
          id={`${id}-shadow`}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <ellipse
        cx="500"
        cy="800"
        rx="230"
        ry="24"
        fill="#122d4e"
        opacity="0.1"
        filter={`url(#${id}-shadow)`}
      />
      {product.shape === "shirt" ? (
        <g>
          <path
            d="M330 170 200 250 115 420 270 485 320 390 305 790 695 790 680 390 730 485 885 420 800 250 670 170C620 220 380 220 330 170Z"
            fill={color}
            stroke="#a7aeb7"
            strokeWidth="3"
          />
          <path
            d="M390 185Q500 340 610 185"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.55"
            strokeWidth="14"
          />
          <path
            d="M330 200 320 390M670 200 680 390M325 760H675"
            fill="none"
            stroke="#000"
            strokeOpacity="0.12"
            strokeWidth="4"
          />
        </g>
      ) : product.shape === "tumbler" || product.shape === "glass" ? (
        <g>
          <path
            d="M325 180Q500 145 675 180L640 740Q500 795 360 740Z"
            fill={`url(#${id}-surface)`}
            stroke="#aab3be"
            strokeWidth="3"
            opacity={product.shape === "glass" ? 0.6 : 1}
          />
          <ellipse
            cx="500"
            cy="182"
            rx="175"
            ry="35"
            fill="#c4c9cf"
            stroke="#8f98a3"
            strokeWidth="4"
          />
          <ellipse cx="500" cy="180" rx="155" ry="22" fill="#5e6975" />
          <path
            d="M360 240 388 704"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.5"
            strokeWidth="16"
          />
        </g>
      ) : product.shape === "pen" ? (
        <g transform="rotate(-12 500 450)">
          <rect
            x="140"
            y="400"
            width="720"
            height="85"
            rx="40"
            fill="#cbb38c"
            stroke="#ad9471"
            strokeWidth="3"
          />
          <path d="M150 410H350V430H150ZM780 400H855V485H780Z" fill="#374454" />
        </g>
      ) : product.shape === "keychain" ? (
        <g>
          <circle
            cx="300"
            cy="340"
            r="100"
            fill="none"
            stroke="#aeafb3"
            strokeWidth="22"
          />
          <rect
            x="350"
            y="340"
            width="410"
            height="280"
            rx="44"
            fill="#312b2c"
          />
          <rect
            x="385"
            y="380"
            width="340"
            height="200"
            rx="14"
            fill="#d6b881"
          />
        </g>
      ) : product.shape === "frame" ? (
        <g>
          <rect
            x="250"
            y="140"
            width="500"
            height="480"
            rx="12"
            fill="#edf4f6"
            stroke="#bcc8d1"
            strokeWidth="4"
          />
          <rect
            x="220"
            y="600"
            width="560"
            height="150"
            rx="12"
            fill="#cbb38c"
          />
          <path d="M225 715H775" stroke="#aa8c62" strokeWidth="3" />
        </g>
      ) : (
        <g>
          <rect
            x="220"
            y="220"
            width="560"
            height="440"
            rx={product.id === "magnet" ? 34 : 6}
            fill={product.shape === "plate" ? "#edf3f5" : "#ffffff"}
            stroke="#cad3dd"
            strokeWidth="4"
          />
          <path d="M230 230H770" stroke="#fff" strokeWidth="10" />
          {product.shape === "plate" && (
            <path d="M445 665 410 780H590L555 665" fill="#c6cdd3" />
          )}
        </g>
      )}
    </g>
  );
}
export function ProductScene({
  product,
  document,
  assets = [],
  guides = false,
  children,
}: {
  product: Product;
  document?: DesignDocument;
  assets?: PreviewAsset[];
  guides?: boolean;
  children?: React.ReactNode;
}) {
  const id = useId().replaceAll(":", ""),
    height = areaHeight(product);
  return (
    <svg
      viewBox="0 0 1000 900"
      className="product-scene"
      role="img"
      aria-label={`Vista de ${product.name}`}
    >
      <ProductBase product={product} color={document?.color || "#e6d6bc"} />
      <defs>
        <clipPath id={id}>
          {product.mask === "ellipse" ? (
            <ellipse cx="500" cy={height / 2} rx="500" ry={height / 2} />
          ) : (
            <rect width="1000" height={height} />
          )}
        </clipPath>
      </defs>
      <g
        transform={`translate(${product.areaX} ${product.areaY}) scale(${product.areaWidth / 1000})`}
      >
        {product.id === "cap-patch" && !product.canvas && (
          <rect
            x="-25"
            y="-25"
            width="1050"
            height={height + 50}
            rx="35"
            fill="#b98d54"
            stroke="#8d6438"
            strokeWidth="8"
          />
        )}
        <g clipPath={`url(#${id})`}>
          {document && <Artwork document={document} assets={assets} />}
        </g>
        {guides && (
          <rect
            width="1000"
            height={height}
            rx={product.mask === "ellipse" ? Math.min(500, height / 2) : 0}
            fill="none"
            stroke="#b22476"
            strokeWidth="5"
            strokeDasharray="18 13"
          />
        )}
      </g>
      {children}
    </svg>
  );
}
