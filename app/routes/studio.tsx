import { useEffect, useRef, useState } from "react";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import {
  ArrowLeft,
  Type,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  MoveUp,
  MoveDown,
  AlignCenter,
  Save,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "../components/Brand";
import {
  Artwork,
  ProductBase,
  ProductScene,
  type PreviewAsset,
} from "../components/ProductScene";
import {
  areaHeight,
  defaultDocument,
  fonts,
  validateDocument,
  resolveAssignedProduct,
  type DesignDocument,
  type DesignElement,
} from "../lib/domain";
import { requirePublicShop } from "../lib/access.server";
import { getRepository } from "../lib/repository.server";
import type { Design } from "../lib/repository.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = await requirePublicShop(request),
    repo = getRepository();
  if (shop === "demo") await repo.seed(shop);
  const query = new URL(request.url).searchParams;
  const variant = query.get("variant") || undefined,
    shopifyProductId = query.get("product") || undefined;
  const configured =
    params.productId === "auto" && variant
      ? await repo.findPersonalizer(shop, variant, shopifyProductId)
      : await repo.getProduct(shop, params.productId!);
  if (!configured?.enabled)
    throw new Response(
      "Este producto aún no está disponible para personalizar.",
      { status: 404 },
    );
  try {
    const product = resolveAssignedProduct(
      configured,
      variant,
      shopifyProductId,
    );
    return { product, shop, demo: shop === "demo" };
  } catch {
    throw new Response(
      "Este producto o variante no está asignado a este personalizador.",
      { status: 404 },
    );
  }
}
type Tool = "text" | "image" | "templates" | "layers";
const colorOptions = [
  { value: "#e6d6bc", label: "Beige" },
  { value: "#182b4f", label: "Azul marino" },
  { value: "#151515", label: "Negro" },
  { value: "#f1ece4", label: "Crema y negro" },
  { value: "#c83c3c", label: "Rojo" },
  { value: "#d4e4ec", label: "Crema y azul cielo" },
];
const inkOptions = [
  "#122d4e",
  "#151515",
  "#ffffff",
  "#ba2476",
  "#087f8c",
  "#bd3434",
  "#815333",
];
export default function Studio() {
  const { product, shop, demo } = useLoaderData<typeof loader>();
  const initial = defaultDocument(product);
  const [document, setDocument] = useState<DesignDocument>(initial),
    docRef = useRef(document);
  const [assets, setAssets] = useState<PreviewAsset[]>([]),
    [selectedId, setSelectedId] = useState(initial.elements[0].id);
  const [tool, setTool] = useState<Tool>("text"),
    [owner, setOwner] = useState(""),
    [ready, setReady] = useState(false);
  const [design, setDesign] = useState<Design | null>(null),
    designRef = useRef<Design | null>(null);
  const [busy, setBusy] = useState(false),
    saving = useRef(false),
    [message, setMessage] = useState("Preparando tu espacio…"),
    [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [guides, setGuides] = useState(true),
    [zoom, setZoom] = useState(1);
  const [historyVersion, setHistoryVersion] = useState(0),
    history = useRef<{
      past: DesignDocument[];
      future: DesignDocument[];
    }>({
      past: [],
      future: [],
    });
  const lastSaved = useRef(""),
    svgRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{
    element: DesignElement;
    x: number;
    y: number;
    mode: "move" | "resize";
  } | null>(null);
  const recoveryKey = `sm:project:${shop}:${product.id}${product.variantId ? `:${product.variantId}` : ""}`,
    selected = document.elements.find((e) => e.id === selectedId);
  const issues = validateDocument(document, product),
    height = areaHeight(product);
  const updateDocument = (next: DesignDocument, remember = true) => {
    if (remember) {
      history.current.past = [
        ...history.current.past.slice(-49),
        docRef.current,
      ];
      history.current.future = [];
      setHistoryVersion((v) => v + 1);
    }
    docRef.current = next;
    setDocument(next);
    setError("");
    setMessage("Cambios sin guardar");
  };
  function updateElement(patch: Partial<DesignElement>) {
    updateDocument({
      ...docRef.current,
      elements: docRef.current.elements.map((e) =>
        e.id === selectedId ? ({ ...e, ...patch } as DesignElement) : e,
      ),
    });
  }
  async function api(intent: string, data?: unknown) {
    const response = await fetch(
      `/api/${intent}${intent.includes("?") ? "&" : "?"}shop=${encodeURIComponent(shop)}`,
      {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-design-owner": owner,
          "x-design-shop": shop,
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        body.error || "No pudimos completar la operación. Vuelve a intentarlo.",
      );
    return body;
  }
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      let token = "",
        savedId = "";
      try {
        token = localStorage.getItem(`sm:owner:${shop}`) || crypto.randomUUID();
        localStorage.setItem(`sm:owner:${shop}`, token);
        savedId = localStorage.getItem(recoveryKey) || "";
      } catch {
        token = crypto.randomUUID();
      }
      if (cancelled) return;
      setOwner(token);
      if (savedId) {
        try {
          const response = await fetch(
            `/api/design?id=${encodeURIComponent(savedId)}&shop=${encodeURIComponent(shop)}`,
            { headers: { "x-design-owner": token } },
          );
          const result = await response.json();
          if (!response.ok) throw new Error();
          if (!cancelled) {
            const restored = result.snapshot.document as DesignDocument;
            if (
              restored.productId !== product.id ||
              restored.variantId !== product.variantId
            )
              throw new Error();
            docRef.current = restored;
            setDocument(restored);
            setAssets(result.assets);
            designRef.current = result.design;
            setDesign(result.design);
            lastSaved.current = JSON.stringify(restored);
            setSelectedId(restored.elements[0]?.id || "");
            setMessage("Guardado · diseño recuperado");
          }
        } catch {
          if (!cancelled)
            setError(
              "No pudimos recuperar el diseño guardado. Puedes crear uno nuevo o recargar para reintentar.",
            );
        }
      } else if (!cancelled)
        setMessage("Tu diseño se guardará automáticamente");
      if (!cancelled) setReady(true);
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [shop, recoveryKey]);
  async function saveCurrent() {
    if (saving.current)
      throw new Error("Hay un guardado en curso. Espera un momento.");
    const current = docRef.current,
      signature = JSON.stringify(current);
    if (signature === lastSaved.current && designRef.current)
      return designRef.current;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("save", {
        document: current,
        id: designRef.current?.id,
        expectedRevision: designRef.current?.revision,
      });
      designRef.current = result.design;
      setDesign(result.design);
      lastSaved.current = signature;
      try {
        localStorage.setItem(recoveryKey, result.design.id);
      } catch {
        /* Server save remains available through this session. */
      }
      setMessage(
        JSON.stringify(docRef.current) === signature
          ? "Guardado · todos los cambios al día"
          : "Cambios sin guardar",
      );
      return result.design as Design;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !ready ||
      !owner ||
      busy ||
      JSON.stringify(document) === lastSaved.current ||
      design?.status === "production" ||
      design?.payment === "paid" ||
      design?.quoteId
    )
      return;
    const timer = setTimeout(() => {
      void saveCurrent().catch((e) => setError(e.message));
    }, 1400);
    return () => clearTimeout(timer);
  }, [document, owner, ready, busy]);
  function undo(forward = false) {
    const source = forward ? history.current.future : history.current.past;
    const previous = source.pop();
    if (!previous) return;
    (forward ? history.current.past : history.current.future).push(
      docRef.current,
    );
    updateDocument(previous, false);
    setHistoryVersion((v) => v + 1);
  }
  function addText(text = "Tu texto", font: (typeof fonts)[number] = "Arial") {
    const element: DesignElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: 100,
      y: height * 0.3,
      width: 800,
      height: height * 0.35,
      rotation: 0,
      text,
      font,
      fontSize: 120,
      color: "#122d4e",
      align: "center",
    };
    updateDocument({
      ...docRef.current,
      elements: [...docRef.current.elements, element],
    });
    setSelectedId(element.id);
    setTool("text");
  }
  function removeElement() {
    updateDocument({
      ...docRef.current,
      elements: docRef.current.elements.filter((e) => e.id !== selectedId),
    });
    setSelectedId("");
  }
  function duplicate() {
    if (!selected) return;
    const copy = {
      ...selected,
      id: crypto.randomUUID(),
      x: Math.min(1000 - selected.width, selected.x + 30),
      y: Math.min(height - selected.height, selected.y + 30),
    };
    updateDocument({
      ...docRef.current,
      elements: [...docRef.current.elements, copy],
    });
    setSelectedId(copy.id);
  }
  function reorder(direction: number) {
    const items = [...docRef.current.elements],
      index = items.findIndex((e) => e.id === selectedId),
      next = index + direction;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    updateDocument({ ...docRef.current, elements: items });
  }
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 8000000
    ) {
      setError("Sube una imagen PNG o JPEG de hasta 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { asset } = await api("upload", { data, name: file.name });
      const ratio = asset.width / asset.height,
        width = Math.min(750, height * 0.75 * ratio),
        h = width / ratio;
      const element: DesignElement = {
        id: crypto.randomUUID(),
        type: "image",
        assetId: asset.id,
        naturalWidth: asset.width,
        naturalHeight: asset.height,
        x: (1000 - width) / 2,
        y: (height - h) / 2,
        width,
        height: h,
        rotation: 0,
      };
      setAssets((old) => [...old, asset]);
      updateDocument({
        ...docRef.current,
        elements: [...docRef.current.elements, element],
      });
      setSelectedId(element.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir la imagen.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function canvasPoint(event: React.PointerEvent) {
    const svg = svgRef.current!,
      point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return {
      x: ((local.x - product.areaX) / product.areaWidth) * 1000,
      y: ((local.y - product.areaY) / product.areaWidth) * 1000,
    };
  }
  function startDrag(
    event: React.PointerEvent<SVGRectElement>,
    element: DesignElement,
    mode: "move" | "resize",
  ) {
    event.stopPropagation();
    event.preventDefault();
    const point = canvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { element: { ...element }, ...point, mode };
    history.current.past.push(docRef.current);
    history.current.future = [];
    setHistoryVersion((v) => v + 1);
    setSelectedId(element.id);
    setTool(element.type === "text" ? "text" : "image");
  }
  function moveDrag(event: React.PointerEvent) {
    if (!drag.current) return;
    const point = canvasPoint(event),
      { element, x, y, mode } = drag.current;
    const dx = point.x - x,
      dy = point.y - y;
    const patch =
      mode === "move"
        ? {
            x: Math.max(-300, Math.min(1100, element.x + dx)),
            y: Math.max(-300, Math.min(height + 100, element.y + dy)),
          }
        : {
            width: Math.max(20, Math.min(1800, element.width + dx)),
            height: Math.max(
              10,
              Math.min(
                height * 2,
                ((element.width + dx) / element.width) * element.height,
              ),
            ),
          };
    updateDocument(
      {
        ...docRef.current,
        elements: docRef.current.elements.map((e) =>
          e.id === element.id ? { ...e, ...patch } : e,
        ),
      },
      false,
    );
  }
  async function submit() {
    if (issues.length || !confirmed) return;
    setError("");
    try {
      const saved = await saveCurrent();
      setBusy(true);
      const result = await api("submit", {
        id: saved.id,
        revision: saved.revision,
      });
      designRef.current = result.design;
      setDesign(result.design);
      if (!demo && product.verified && product.variantId) {
        const cart = await api("cart", {
          id: saved.id,
          revision: saved.revision,
        });
        if (window.parent === window)
          throw new Error(
            "Diseño enviado. Abre el personalizador desde el producto de tu tienda para añadirlo al carrito.",
          );
        window.parent.postMessage(
          { type: "souvenir:add-to-cart", item: cart.item },
          `https://${shop}`,
        );
      }
      setReviewOpen(false);
      setMessage("Enviado al taller · pendiente de revisión");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar el diseño.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (demo) return;
    const receive = (event: MessageEvent) => {
      if (
        event.source === window.parent &&
        event.origin === `https://${shop}` &&
        event.data?.type === "souvenir:cart-error"
      )
        setError(String(event.data.message).slice(0, 400));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [shop, demo]);
  const isLocked =
    !ready ||
    !!(
      design?.orderId ||
      design?.quoteId ||
      design?.payment === "paid" ||
      design?.status === "production"
    );
  function makeCopy() {
    designRef.current = null;
    setDesign(null);
    lastSaved.current = "";
    try {
      localStorage.removeItem(recoveryKey);
    } catch {}
    setMessage("Copia creada · guarda tu nuevo diseño");
    setError("");
  }
  const buttonIcons = [
    { id: "text", icon: Type, name: "Texto" },
    { id: "image", icon: ImagePlus, name: "Imagen" },
    { id: "templates", icon: LayoutTemplate, name: "Diseños" },
    { id: "layers", icon: Layers, name: "Capas" },
  ] as const;
  const assignedHandle = product.assignments[0]?.handle;
  const storefrontUrl = `https://${shop}`;
  const returnUrl = assignedHandle
    ? `${storefrontUrl}/products/${encodeURIComponent(assignedHandle)}${product.variantId ? `?variant=${encodeURIComponent(product.variantId)}` : ""}`
    : storefrontUrl;
  return (
    <div className="studio-app">
      <header className="topbar">
        <Brand
          href={demo ? "/app" : storefrontUrl}
          target={demo ? undefined : "_top"}
        />
        <div className="studio-header-title">
          <span>Tu idea, hecha recuerdo.</span>
          <strong>{product.name}</strong>
        </div>
        <div className="header-actions">
          <a
            className="button quiet compact"
            href={demo ? "/app" : returnUrl}
            target={demo ? undefined : "_top"}
          >
            <ArrowLeft size={17} />
            <span>{demo ? "Catálogo" : "Volver al producto"}</span>
          </a>
          <button
            className="secondary compact"
            disabled={busy || !ready || isLocked}
            onClick={() => void saveCurrent().catch((e) => setError(e.message))}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Save size={17} />
            )}
            <span>Guardar diseño</span>
          </button>
        </div>
      </header>
      {demo && (
        <div className="environment-banner">
          <span className="demo-dot" />
          Vista de prueba{" "}
          <span className="banner-detail">
            Modelos del catálogo · medidas pendientes de validar · sin cobros
          </span>
        </div>
      )}
      <main className="studio-layout">
        <aside
          className="editor-sidebar"
          aria-label="Herramientas de personalización"
        >
          <nav className="tool-tabs">
            {buttonIcons.map(({ id, icon: Icon, name }) => (
              <button
                key={id}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
              >
                <Icon size={22} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="tool-panel">
            {tool === "text" && (
              <>
                <div className="panel-heading">
                  <h2>Dilo a tu manera</h2>
                  <p>Un nombre, una fecha, tu marca.</p>
                </div>
                <button
                  className="secondary full"
                  onClick={() => addText()}
                  disabled={isLocked || document.elements.length >= 30}
                >
                  <Type size={17} />
                  Añadir texto
                </button>
                {selected?.type === "text" && (
                  <div className="field-stack">
                    <label>
                      Tu texto
                      <textarea
                        value={selected.text}
                        maxLength={240}
                        onChange={(event) =>
                          updateElement({ text: event.target.value })
                        }
                        disabled={isLocked}
                        rows={3}
                      />
                    </label>
                    <span className="field-hint">
                      {selected.text.length}/240 caracteres
                    </span>
                    <label>
                      Tipografía
                      <select
                        value={selected.font}
                        onChange={(event) =>
                          updateElement({
                            font: event.target.value as (typeof fonts)[number],
                          })
                        }
                        disabled={isLocked}
                      >
                        {fonts.map((font) => (
                          <option key={font}>{font}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tamaño del texto
                      <input
                        type="range"
                        min="20"
                        max="220"
                        value={selected.fontSize}
                        onChange={(event) =>
                          updateElement({
                            fontSize: Number(event.target.value),
                          })
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>Color del texto</label>
                    <div className="swatches">
                      {inkOptions.map((color) => (
                        <button
                          key={color}
                          className={`swatch ${selected.color === color ? "selected" : ""}`}
                          style={{ background: color }}
                          aria-label={`Tinta ${color}`}
                          onClick={() => updateElement({ color })}
                          disabled={isLocked}
                        >
                          {selected.color === color && (
                            <Check
                              size={14}
                              color={color === "#ffffff" ? "#122d4e" : "white"}
                            />
                          )}
                        </button>
                      ))}
                      <input
                        className="color-picker"
                        type="color"
                        aria-label="Elegir otro color de texto"
                        value={selected.color}
                        onChange={(e) =>
                          updateElement({ color: e.target.value })
                        }
                        disabled={isLocked}
                      />
                    </div>
                    <label>
                      Alineación
                      <select
                        value={selected.align}
                        onChange={(e) =>
                          updateElement({
                            align: e.target.value as
                              | "left"
                              | "center"
                              | "right",
                          })
                        }
                        disabled={isLocked}
                      >
                        <option value="left">Izquierda</option>
                        <option value="center">Centrada</option>
                        <option value="right">Derecha</option>
                      </select>
                    </label>
                  </div>
                )}
              </>
            )}
            {tool === "image" && (
              <>
                <div className="panel-heading">
                  <h2>Tu imagen, tu historia</h2>
                  <p>Añade tu logo o una fotografía.</p>
                </div>
                <button
                  className="upload-area"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || isLocked}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!isLocked) void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <ImagePlus size={34} />
                  <strong>Subir una imagen</strong>
                  <span>Arrástrala aquí o elige un archivo</span>
                  <small>PNG o JPG · hasta 8 MB</small>
                </button>
                <p className="help-text">
                  Una imagen con fondo transparente suele funcionar mejor para
                  logos. Conservamos el original normalizado en PNG.
                </p>
                {selected?.type === "image" && (
                  <div className="info-note">
                    {selected.naturalWidth} × {selected.naturalHeight} px
                    <br />
                    La calidad se comprueba al tamaño del diseño.
                  </div>
                )}
              </>
            )}
            {tool === "templates" && (
              <>
                <div className="panel-heading">
                  <h2>Un punto de partida</h2>
                  <p>Elige una idea y hazla tuya.</p>
                </div>
                {[
                  { title: "Tu marca", text: "TU MARCA", font: "Arial" },
                  {
                    title: "Un recuerdo especial",
                    text: "Un recuerdo\npara siempre",
                    font: "Georgia",
                  },
                  { title: "Iniciales", text: "A & M", font: "Georgia" },
                ].map((template) => (
                  <button
                    className="template-option"
                    key={template.title}
                    onClick={() =>
                      addText(
                        template.text,
                        template.font as (typeof fonts)[number],
                      )
                    }
                    disabled={isLocked || document.elements.length >= 30}
                  >
                    <span style={{ fontFamily: template.font }}>
                      {template.text}
                    </span>
                    <small>{template.title}</small>
                  </button>
                ))}
              </>
            )}
            {tool === "layers" && (
              <>
                <div className="panel-heading">
                  <h2>Capas del diseño</h2>
                  <p>Selecciona y ordena tus elementos.</p>
                </div>
                <div className="layer-list">
                  {[...document.elements].reverse().map((element) => (
                    <button
                      key={element.id}
                      className={selectedId === element.id ? "active" : ""}
                      onClick={() => setSelectedId(element.id)}
                    >
                      {element.type === "text" ? (
                        <Type size={18} />
                      ) : (
                        <ImagePlus size={18} />
                      )}
                      <span>
                        {element.type === "text"
                          ? element.text || "Texto vacío"
                          : "Imagen"}
                      </span>
                    </button>
                  ))}
                </div>
                {!document.elements.length && (
                  <p className="help-text">
                    Añade texto o sube una imagen para empezar.
                  </p>
                )}
              </>
            )}
            {selected && (
              <div className="position-tools">
                <h3>Ajusta tu elemento</h3>
                <div className="numeric-grid">
                  <label>
                    Ancho
                    <input
                      type="number"
                      min="5"
                      max="1000"
                      value={Math.round(selected.width)}
                      disabled={isLocked}
                      onChange={(e) => {
                        const width = Math.max(5, Number(e.target.value));
                        updateElement({
                          width,
                          height: (selected.height / selected.width) * width,
                        });
                      }}
                    />
                  </label>
                  <label>
                    Giro (°)
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      value={Math.round(selected.rotation)}
                      disabled={isLocked}
                      onChange={(e) =>
                        updateElement({
                          rotation: Math.max(
                            -180,
                            Math.min(180, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Posición X
                    <input
                      type="number"
                      value={Math.round(selected.x)}
                      min="0"
                      max="1000"
                      disabled={isLocked}
                      onChange={(e) =>
                        updateElement({ x: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Posición Y
                    <input
                      type="number"
                      value={Math.round(selected.y)}
                      min="0"
                      max={height}
                      disabled={isLocked}
                      onChange={(e) =>
                        updateElement({ y: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <div className="element-actions">
                  <button
                    title="Centrar elemento"
                    aria-label="Centrar elemento"
                    disabled={isLocked}
                    onClick={() =>
                      updateElement({
                        x: (1000 - selected.width) / 2,
                        y: (height - selected.height) / 2,
                      })
                    }
                  >
                    <AlignCenter size={18} />
                  </button>
                  <button
                    title="Duplicar elemento"
                    aria-label="Duplicar elemento"
                    disabled={isLocked || document.elements.length >= 30}
                    onClick={duplicate}
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    title="Subir capa"
                    aria-label="Subir capa"
                    disabled={isLocked}
                    onClick={() => reorder(1)}
                  >
                    <MoveUp size={18} />
                  </button>
                  <button
                    title="Bajar capa"
                    aria-label="Bajar capa"
                    disabled={isLocked}
                    onClick={() => reorder(-1)}
                  >
                    <MoveDown size={18} />
                  </button>
                  <button
                    title="Eliminar elemento"
                    aria-label="Eliminar elemento"
                    disabled={isLocked}
                    onClick={removeElement}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </aside>
        <section className="workspace" aria-label="Diseño del producto">
          <div className="canvas-topline">
            <div className="view-pill">Vista frontal</div>
            <div className="canvas-controls">
              <button
                aria-label="Deshacer"
                disabled={!history.current.past.length || isLocked}
                onClick={() => undo()}
              >
                <Undo2 size={18} />
              </button>
              <button
                aria-label="Rehacer"
                disabled={!history.current.future.length || isLocked}
                onClick={() => undo(true)}
              >
                <Redo2 size={18} />
              </button>
              <span className="control-divider" />
              <button
                className={guides ? "active" : ""}
                aria-label="Mostrar área de personalización"
                aria-pressed={guides}
                onClick={() => setGuides((v) => !v)}
              >
                <Eye size={18} />
              </button>
            </div>
          </div>
          <div className="canvas-stage">
            <div
              className="canvas-paper"
              style={{ transform: `scale(${zoom})` }}
            >
              <svg
                ref={svgRef}
                viewBox="0 0 1000 900"
                className="product-scene interactive"
                aria-label="Lienzo de personalización"
                onPointerMove={moveDrag}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onPointerDown={() => setSelectedId("")}
              >
                <ProductBase product={product} color={document.color} />
                <defs>
                  <clipPath id="editor-print-area">
                    {product.mask === "ellipse" ? (
                      <ellipse
                        cx="500"
                        cy={height / 2}
                        rx="500"
                        ry={height / 2}
                      />
                    ) : (
                      <rect width="1000" height={height} />
                    )}
                  </clipPath>
                </defs>
                <g
                  transform={`translate(${product.areaX} ${product.areaY}) scale(${product.areaWidth / 1000})`}
                >
                  {!product.canvas &&
                    (product.id === "cap-patch" ||
                      product.templateId === "cap-patch") && (
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
                  <g clipPath="url(#editor-print-area)">
                    <Artwork document={document} assets={assets} />
                  </g>
                  {guides && (
                    <g pointerEvents="none">
                      <rect
                        width="1000"
                        height={height}
                        fill="none"
                        stroke="#ba2476"
                        strokeWidth="5"
                        strokeDasharray="18 13"
                        rx={
                          product.mask === "ellipse"
                            ? Math.min(500, height / 2)
                            : 0
                        }
                      />
                      <rect
                        x="0"
                        y="-82"
                        width="450"
                        height="70"
                        rx="10"
                        fill="#ba2476"
                      />
                      <text
                        x="25"
                        y="-34"
                        fontSize="40"
                        fontFamily="Arial"
                        fill="#fff"
                      >
                        Área de personalización
                      </text>
                    </g>
                  )}
                  {!isLocked &&
                    document.elements.map((element) => (
                      <g
                        key={element.id}
                        transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}
                      >
                        <rect
                          width={element.width}
                          height={element.height}
                          fill="transparent"
                          stroke={
                            selectedId === element.id
                              ? "#087f8c"
                              : "transparent"
                          }
                          strokeWidth="6"
                          style={{ cursor: "move" }}
                          onPointerDown={(e) => startDrag(e, element, "move")}
                        />
                        {selectedId === element.id && (
                          <rect
                            x={element.width - 18}
                            y={element.height - 18}
                            width="36"
                            height="36"
                            rx="4"
                            fill="#fff"
                            stroke="#087f8c"
                            strokeWidth="7"
                            style={{ cursor: "nwse-resize" }}
                            onPointerDown={(e) =>
                              startDrag(e, element, "resize")
                            }
                          />
                        )}
                      </g>
                    ))}
                </g>
              </svg>
            </div>
          </div>
          <div className="canvas-bottomline">
            <span>
              {product.widthMm} × {product.heightMm} mm{" "}
              <span className="muted">
                {product.verified ? "· área validada" : "· área de prueba"}
              </span>
            </span>
            <div className="zoom-controls">
              <button
                aria-label="Alejar"
                disabled={zoom <= 0.8}
                onClick={() => setZoom((v) => Math.max(0.8, v - 0.1))}
              >
                <ZoomOut size={17} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Acercar"
                disabled={zoom >= 1.4}
                onClick={() => setZoom((v) => Math.min(1.4, v + 0.1))}
              >
                <ZoomIn size={17} />
              </button>
              <button aria-label="Restablecer zoom" onClick={() => setZoom(1)}>
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </section>
        <aside className="product-sidebar">
          <div className="product-summary">
            <span className="technique-label">{product.technique}</span>
            <h1>{product.name}</h1>
            <p>Hazlo único. Nosotros cuidamos cada detalle.</p>
            <div className="summary-divider" />
            <label>Color del producto</label>
            <div className="swatches product-swatches">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  className={`swatch ${document.color === color.value ? "selected" : ""}`}
                  style={{ background: color.value }}
                  aria-label={`Producto ${color.label}`}
                  disabled={isLocked || !demo}
                  onClick={() =>
                    updateDocument({ ...docRef.current, color: color.value })
                  }
                >
                  {document.color === color.value && (
                    <Check
                      size={14}
                      color={
                        ["#151515", "#182b4f"].includes(color.value)
                          ? "white"
                          : "#122d4e"
                      }
                    />
                  )}
                </button>
              ))}
            </div>
            <small className="field-hint">
              {colorOptions.find((c) => c.value === document.color)?.label ||
                "Personalizado"}
              {!demo && " · muestra visual; confirma la variante"}
            </small>
            <label className="quantity-field">
              Cantidad
              <input
                type="number"
                min="1"
                max="1000"
                value={document.quantity}
                disabled={isLocked}
                onChange={(e) =>
                  updateDocument({
                    ...docRef.current,
                    quantity: Math.max(
                      1,
                      Math.min(1000, Number(e.target.value)),
                    ),
                  })
                }
              />
            </label>
            <div className="review-promise">
              <ShieldCheck size={23} />
              <div>
                <strong>Revisado por nuestro taller</strong>
                <p>Validamos tu diseño antes de fabricar.</p>
              </div>
            </div>
            {design?.note && (
              <div className="info-note">
                <strong>Nota del taller</strong>
                <p>{design.note}</p>
              </div>
            )}
            {issues.length > 0 && (
              <div className="validation-list" role="note">
                <strong>Antes de continuar</strong>
                {issues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </div>
            )}
            <div className="quote-summary">
              <span>
                {!demo && product.variantId && product.verified
                  ? "Precio según variante de la tienda"
                  : "Precio por cotización"}
              </span>
              <small>
                {demo
                  ? "Esta prueba no realiza compras"
                  : "Te confirmaremos el importe y la entrega"}
              </small>
            </div>
            {ready && isLocked ? (
              <button className="primary full" onClick={makeCopy}>
                <Copy size={18} />
                Crear una copia editable
              </button>
            ) : (
              <button
                className="primary full"
                disabled={busy || !ready || issues.length > 0}
                onClick={() => {
                  setConfirmed(false);
                  setReviewOpen(true);
                }}
              >
                <Check size={18} />
                Revisar diseño
              </button>
            )}
            <p className="fine-print">
              La vista es ilustrativa. El acabado depende de la técnica y el
              material.
            </p>
          </div>
        </aside>
      </main>
      <footer className="studio-status">
        <span role="status" aria-live="polite">
          <span className={busy ? "saving-dot" : "saved-dot"} />
          {busy ? "Guardando…" : message}
        </span>
        <span className="status-extra">
          {design
            ? `Diseño ${design.id.slice(0, 8)} · revisión ${design.revision}`
            : "Diseñado por ti. Hecho para durar."}
        </span>
      </footer>
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="Cerrar aviso" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {reviewOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setReviewOpen(false)}
        >
          <section
            className="modal review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Cerrar revisión"
              onClick={() => setReviewOpen(false)}
              disabled={busy}
            >
              <X size={20} />
            </button>
            <div className="review-picture">
              <ProductScene
                product={product}
                document={document}
                assets={assets}
              />
            </div>
            <div className="review-content">
              <span className="technique-label">Un último vistazo</span>
              <h2 id="review-title">¿Todo como lo imaginaste?</h2>
              <p>
                {product.name} · {product.technique}
              </p>
              <dl>
                <div>
                  <dt>Cantidad</dt>
                  <dd>{document.quantity}</dd>
                </div>
                <div>
                  <dt>Área</dt>
                  <dd>
                    {product.widthMm} × {product.heightMm} mm
                  </dd>
                </div>
                <div>
                  <dt>Siguiente paso</dt>
                  <dd>Revisión del taller</dd>
                </div>
              </dl>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirmo que el texto y la distribución son correctos
              </label>
              <p className="help-text">
                Si necesitamos ajustar tu diseño, te pediremos confirmar la
                nueva versión antes de fabricar.
              </p>
              <button
                className="primary full"
                disabled={!confirmed || busy || issues.length > 0}
                onClick={() => void submit()}
              >
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Check size={18} />
                )}
                {!demo && product.verified && product.variantId
                  ? "Enviar y añadir al carrito"
                  : "Enviar al taller"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
