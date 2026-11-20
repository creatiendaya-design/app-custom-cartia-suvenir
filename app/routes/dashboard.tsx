import { useEffect, useState } from "react";
import {
  useLoaderData,
  useRevalidator,
  useRouteError,
  useSearchParams,
  type LoaderFunctionArgs,
  type HeadersFunction,
} from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Search,
  SlidersHorizontal,
  Grid2X2,
  ClipboardCheck,
  Settings2,
  ExternalLink,
  X,
  Check,
  Download,
  PackageCheck,
  LoaderCircle,
  Link2,
  Copy,
  Layers,
  ShieldCheck,
  Layers3,
  Package,
  Plus,
} from "lucide-react";
import { Brand } from "../components/Brand";
import { ProductScene, type PreviewAsset } from "../components/ProductScene";
import { PersonalizerList } from "../components/PersonalizerList";
import { ProductPicker } from "../components/ProductPicker";
import { CanvasImagePicker } from "../components/CanvasImagePicker";
import { seedCatalog } from "../lib/catalog";
import type { CatalogProduct } from "../lib/shopify-catalog.server";
import { defaultDocument, statusLabels, type Product } from "../lib/domain";
import { requireMerchant } from "../lib/access.server";
import {
  getRepository,
  type Design,
  type Revision,
} from "../lib/repository.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const merchant = await requireMerchant(request),
    repo = getRepository();
  if (merchant.demo || !(await repo.listProducts(merchant.shop)).length)
    await repo.seed(merchant.shop);
  return {
    ...merchant,
    products: await repo.listProducts(merchant.shop),
    personalizers: await repo.listPersonalizers(merchant.shop),
    templates: seedCatalog,
    designs: (await repo.listDesigns(merchant.shop)).map((record) => ({
      ...record,
      owner: "",
    })),
    storeDomain:
      process.env.SHOPIFY_STORE_DOMAIN ||
      "souvenir-made-xbc1wrvr.myshopify.com",
  };
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
interface ReviewDetail {
  design: Design;
  snapshot: Revision;
  assets: PreviewAsset[];
  history: Array<{
    action: string;
    actor: string;
    revision: number;
    createdAt: string;
    note: string;
  }>;
}
type ShopifyProduct = {
  id: string;
  title: string;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      price: string;
      inventoryQuantity: number;
    }>;
  };
};
function Dashboard() {
  const { products, personalizers, templates, designs, demo, storeDomain } =
      useLoaderData<typeof loader>(),
    revalidator = useRevalidator();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Todos"),
    [stage, setStage] = useState("all");
  const [searchParams, setSearchParams] = useSearchParams(),
    tab = searchParams.get("tab") || "personalizers";
  const [configuration, setConfiguration] = useState<Product | null>(null),
    [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState("");
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [createSelection, setCreateSelection] = useState<CatalogProduct[]>([]);
  const [assignmentTarget, setAssignmentTarget] = useState<{
    product: Product;
    draft: boolean;
    inConfiguration: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [quote, setQuote] = useState("");
  const [liveProducts, setLiveProducts] = useState<ShopifyProduct[]>([]),
    [filterStatus, setFilterStatus] = useState("all");
  const categories = ["Todos", ...new Set(templates.map((p) => p.category))];
  const filtered = templates.filter(
    (p) =>
      `${p.name} ${p.technique}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === "Todos" || p.category === category) &&
      (stage === "all" || p.stage === Number(stage)),
  );
  function editConfiguration(product: Product) {
    setCanvasBusy(false);
    setCreatingTemplate("");
    setCreateSelection([]);
    setConfiguration({ ...product });
  }
  function useTemplate(product: Product) {
    setCanvasBusy(false);
    setCreatingTemplate(product.id);
    setCreateSelection([]);
    setConfiguration({ ...product, enabled: false, verified: false });
  }
  function pickerProducts(product: Product): CatalogProduct[] {
    if (product.assignments.length)
      return product.assignments.map((a) => ({
        id: a.productId,
        title: a.title,
        handle: a.handle,
        status: a.status,
        featuredImage: a.image ? { url: a.image } : null,
        variants: {
          nodes: a.variants.map((v) => ({
            ...v,
            id: `gid://shopify/ProductVariant/${v.id}`,
          })),
        },
      }));
    return product.shopifyProductId && product.variantId
      ? [
          {
            id: product.shopifyProductId,
            title: product.name,
            handle: "",
            status: "ACTIVE",
            featuredImage: null,
            variants: {
              nodes: [
                {
                  id: `gid://shopify/ProductVariant/${product.variantId}`,
                  title: "Variante vinculada",
                  price: "0",
                },
              ],
            },
          },
        ]
      : [];
  }
  async function request(intent: string, body?: unknown) {
    const response = await fetch(`/api/${intent}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        result.error ||
          "No se pudo completar la operación. Revisa la conexión e inténtalo de nuevo.",
      );
    return result;
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadDetail(id: string) {
    const next = await request(`review-detail?id=${encodeURIComponent(id)}`);
    setDetail(next);
    setNote(next.design.note);
    setQuote("");
  }
  async function review(status: "approved" | "changes_requested") {
    if (!detail) return;
    await perform(async () => {
      await request("review", {
        id: detail.design.id,
        revision: detail.design.revision,
        status,
        note,
      });
      await loadDetail(detail.design.id);
      revalidator.revalidate();
      setMessage(
        status === "approved" ? "Diseño aprobado" : "Cambios solicitados",
      );
    });
  }
  async function download() {
    if (!detail) return;
    await perform(async () => {
      const response = await fetch(
        `/api/export?id=${detail.design.id}&revision=${detail.design.revision}`,
      );
      if (!response.ok)
        throw new Error("No se pudo preparar el paquete. Vuelve a intentarlo.");
      const url = URL.createObjectURL(await response.blob()),
        anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `souvenir-${detail.design.id}-r${detail.design.revision}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Paquete descargado");
    });
  }
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timeout);
  }, [message]);
  const counts = {
    review: designs.filter((d) => d.status === "submitted").length,
    ready: designs.filter((d) => d.status === "approved").length,
  };
  const currentProduct =
    detail && products.find((p) => p.id === detail.snapshot.product.id);
  const productionReady =
    detail?.design.status === "approved" &&
    detail.design.payment === "paid" &&
    currentProduct?.verified &&
    currentProduct.widthMm === detail.snapshot.product.widthMm &&
    currentProduct.heightMm === detail.snapshot.product.heightMm &&
    currentProduct.mask === detail.snapshot.product.mask &&
    currentProduct.technique === detail.snapshot.product.technique &&
    currentProduct.minDpi === detail.snapshot.product.minDpi;
  const actionLabel: Record<string, string> = {
    saved: "Diseño guardado",
    submitted: "Enviado a revisión",
    approved: "Aprobado por taller",
    changes_requested: "Se solicitaron cambios",
    production: "Autorizado para producción",
    simulated_payment: "Pago simulado en prueba",
    payment_confirmed: "Pago confirmado por Shopify",
    order_received: "Pedido recibido de Shopify",
  };
  return (
    <div className="dashboard-app">
      <header className="topbar">
        <Brand />
        <nav className="main-nav" aria-label="Navegación principal">
          {[
            { id: "personalizers", label: "Personalizadores", icon: Layers3 },
            { id: "catalog", label: "Plantillas", icon: Grid2X2 },
            {
              id: "designs",
              label: "Revisión del taller",
              icon: ClipboardCheck,
            },
            { id: "settings", label: "Conexión", icon: Settings2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() =>
                setSearchParams(id === "personalizers" ? {} : { tab: id })
              }
            >
              <Icon size={18} />
              {label}
              {id === "designs" && counts.review > 0 && (
                <span className="nav-count">{counts.review}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="store-identity">
          <span className="store-avatar">SM</span>
          <div>
            <strong>Souvenir Made</strong>
            <small>{demo ? "Prueba local" : "Shopify Basic"}</small>
          </div>
        </div>
      </header>
      <main className="dashboard-main">
        {demo && (
          <div className="pilot-notice">
            <ShieldCheck size={20} />
            <div>
              <strong>Tu estudio está tomando forma.</strong>
              <span>
                Prueba la personalización y la revisión del taller. Las medidas
                son de ejemplo y no se realizan cobros.
              </span>
            </div>
            <a href="/studio/cap-patch" className="button secondary compact">
              Probar editor
              <ExternalLink size={15} />
            </a>
          </div>
        )}
        {tab === "personalizers" && (
          <PersonalizerList
            products={personalizers}
            demo={demo}
            storeDomain={storeDomain}
            busy={busy}
            onCreate={() => setSearchParams({ tab: "catalog" })}
            onEdit={editConfiguration}
            onAssign={(product) =>
              setAssignmentTarget({
                product,
                draft: false,
                inConfiguration: false,
              })
            }
            onToggle={(product) =>
              void perform(async () => {
                await request("product", {
                  product: { ...product, enabled: !product.enabled },
                });
                revalidator.revalidate();
                setMessage(
                  product.enabled
                    ? "Personalizador desactivado"
                    : "Personalizador habilitado",
                );
              })
            }
          />
        )}
        {tab === "catalog" && (
          <>
            <div className="page-heading">
              <div>
                <span className="section-kicker">Hecho para ser único</span>
                <h1>Plantillas para crear.</h1>
                <p>
                  Elige una base para tu personalizador y asígnala a los
                  productos de tu tienda.
                </p>
              </div>
              <div className="catalog-totals">
                <strong>{templates.length}</strong>
                <span>
                  plantillas del catálogo
                  <br />
                  <small>Áreas de ejemplo por validar</small>
                </span>
              </div>
            </div>
            <div className="catalog-toolbar">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label="Buscar productos"
                  placeholder="Buscar un producto o técnica…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="stage-select">
                <SlidersHorizontal size={17} />
                <select
                  aria-label="Filtrar por etapa"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  <option value="all">Todas las etapas</option>
                  <option value="1">Etapa 1 · primer producto</option>
                  <option value="2">Etapa 2 · grabados</option>
                  <option value="3">Etapa 3 · a color</option>
                  <option value="4">Etapa 4 · textiles</option>
                </select>
              </label>
            </div>
            <div className="category-tabs" aria-label="Categorías">
              {categories.map((item) => (
                <button
                  key={item}
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="product-grid">
              {filtered.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-card-image">
                    <span
                      className={`product-badge ${product.verified ? "validated" : ""}`}
                    >
                      {product.verified
                        ? "Área validada"
                        : `Etapa ${product.stage}`}
                    </span>
                    <ProductScene
                      product={product}
                      document={defaultDocument(product)}
                    />
                    <span className="image-caption">
                      {product.shape === "cap"
                        ? "Modelo del catálogo"
                        : "Vista ilustrativa"}
                    </span>
                  </div>
                  <div className="product-card-body">
                    <span className="product-category">{product.category}</span>
                    <h2>{product.name}</h2>
                    <p>{product.technique}</p>
                    <div className="card-details">
                      <span>
                        {product.widthMm} × {product.heightMm} mm
                      </span>
                      <span>Plantilla base</span>
                    </div>
                    <div className="product-card-actions">
                      <button
                        className="primary"
                        onClick={() => useTemplate(product)}
                      >
                        Usar plantilla
                        <Plus size={15} />
                      </button>
                      <button
                        className="secondary icon-button"
                        aria-label={`Crear desde ${product.name}`}
                        onClick={() => useTemplate(product)}
                      >
                        <Settings2 size={18} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <div className="empty-state">
                <Search size={28} />
                <h2>No encontramos ese producto</h2>
                <p>Prueba otro nombre o cambia los filtros.</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("Todos");
                    setStage("all");
                  }}
                >
                  Ver todos los productos
                </button>
              </div>
            )}
          </>
        )}
        {tab === "designs" && (
          <>
            <div className="page-heading">
              <div>
                <span className="section-kicker">Del diseño al taller</span>
                <h1>Cada detalle, revisado.</h1>
                <p>Aprueba la versión correcta antes de empezar a fabricar.</p>
              </div>
              <div className="review-counts">
                <span>
                  <strong>{counts.review}</strong>por revisar
                </span>
                <span>
                  <strong>{counts.ready}</strong>aprobados
                </span>
              </div>
            </div>
            <div className="design-toolbar">
              <h2>
                Diseños recibidos{" "}
                <span className="muted">({designs.length})</span>
              </h2>
              <select
                aria-label="Filtrar estado de diseños"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {!designs.length ? (
              <div className="empty-state">
                <Layers size={36} />
                <h2>Aquí comienza cada recuerdo</h2>
                <p>
                  Los diseños guardados en el editor aparecerán aquí. Los
                  enviados por el cliente pasarán a revisión.
                </p>
                <a className="button primary" href="/studio/cap-patch">
                  Crear el primer diseño
                </a>
              </div>
            ) : (
              <div className="design-table-wrap">
                <table className="design-table">
                  <thead>
                    <tr>
                      <th>Diseño / producto</th>
                      <th>Revisión</th>
                      <th>Estado</th>
                      <th>Pago</th>
                      <th>Actualizado</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {designs
                      .filter(
                        (d) =>
                          filterStatus === "all" || d.status === filterStatus,
                      )
                      .map((design) => (
                        <tr key={design.id}>
                          <td>
                            <strong>{design.productName}</strong>
                            <small>{design.id.slice(0, 8)}</small>
                          </td>
                          <td>r{design.revision}</td>
                          <td>
                            <span className={`status-badge ${design.status}`}>
                              {statusLabels[design.status]}
                            </span>
                          </td>
                          <td>
                            {design.payment === "paid"
                              ? demo
                                ? "Simulado"
                                : "Confirmado"
                              : "Pendiente"}
                          </td>
                          <td>
                            {new Intl.DateTimeFormat("es", {
                              dateStyle: "short",
                              timeZone: "America/Lima",
                            }).format(new Date(design.updatedAt))}
                          </td>
                          <td>
                            <button
                              className="secondary compact"
                              aria-label={`Abrir diseño ${design.id.slice(0, 8)}`}
                              onClick={() =>
                                void perform(() => loadDetail(design.id))
                              }
                            >
                              Revisar
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === "settings" && (
          <>
            <div className="page-heading">
              <div>
                <span className="section-kicker">Tu tienda y tu taller</span>
                <h1>Todo en su lugar.</h1>
                <p>
                  Conecta Shopify y valida la configuración antes de vender.
                </p>
              </div>
            </div>
            <div className="settings-grid">
              <section className="settings-section">
                <div className="settings-icon">
                  <Link2 size={24} />
                </div>
                <h2>Conexión con Shopify</h2>
                <label>
                  Dominio de la tienda
                  <input value={storeDomain} readOnly />
                </label>
                <div className="connection-state">
                  <span className={demo ? "demo-dot" : "saved-dot"} />
                  {demo
                    ? "Pendiente de instalación"
                    : "Sesión autenticada con Shopify"}
                </div>
                <p>
                  {demo
                    ? "La app funciona en este equipo. Para instalarla hay que registrar la app, configurar sus credenciales y publicar el servidor HTTPS."
                    : "El panel utiliza la sesión de Shopify. Los pagos se confirman mediante eventos firmados de la tienda."}
                </p>
                <button
                  className="secondary full"
                  disabled={demo || busy}
                  onClick={() =>
                    void perform(async () => {
                      const result = await request("shopify-products");
                      setLiveProducts(result.products);
                      setMessage("Catálogo consultado en Shopify");
                    })
                  }
                >
                  Consultar productos de Shopify
                </button>
                {liveProducts.length > 0 && (
                  <ul className="live-products">
                    {liveProducts.map((p) => (
                      <li key={p.id}>
                        <strong>{p.title}</strong>
                        {p.variants.nodes.map((v) => (
                          <small key={v.id}>
                            {v.title}: {v.id.split("/").pop()} · {v.price}
                          </small>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="settings-section">
                <div className="settings-icon">
                  <PackageCheck size={24} />
                </div>
                <h2>Preparación del taller</h2>
                <ul className="setup-list">
                  <li>
                    <Check size={17} />
                    Catálogo organizado por familias
                  </li>
                  <li>
                    <Check size={17} />
                    Revisión obligatoria antes de fabricar
                  </li>
                  <li>
                    <span className="setup-bullet" />
                    Validar áreas útiles de cada producto
                  </li>
                  <li>
                    <span className="setup-bullet" />
                    Vincular las variantes y sus precios
                  </li>
                  <li>
                    <span className="setup-bullet" />
                    Comprobar archivos con una muestra física
                  </li>
                  <li>
                    <span className="setup-bullet" />
                    Confirmar ponchado en productos bordados
                  </li>
                </ul>
                <p>
                  Las dimensiones del editor son independientes de la foto.
                  Confirma cada área en la configuración del producto.
                </p>
              </section>
            </div>
          </>
        )}
      </main>
      <footer className="dashboard-footer">
        <span>Souvenir Made · Moments Made to Endure</span>
        <span>Un estudio para crear, un taller para cuidar.</span>
      </footer>
      {message && (
        <div className="toast success" role="status">
          <Check size={18} />
          {message}
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="Cerrar error" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {assignmentTarget && (
        <ProductPicker
          name={assignmentTarget.product.name}
          demo={demo}
          initial={
            assignmentTarget.draft
              ? createSelection
              : pickerProducts(assignmentTarget.product)
          }
          onClose={() => setAssignmentTarget(null)}
          onSave={async (selection) => {
            if (assignmentTarget.draft) setCreateSelection(selection);
            else {
              const result = await request("assign-products", {
                id: assignmentTarget.product.id,
                productIds: selection.map((p) => p.id),
              });
              if (assignmentTarget.inConfiguration)
                setConfiguration((current) =>
                  current
                    ? {
                        ...current,
                        assignments: result.product.assignments,
                        variantId: "",
                        shopifyProductId: "",
                        enabled: result.product.enabled,
                      }
                    : null,
                );
              revalidator.revalidate();
              setMessage("Productos asignados");
            }
            setAssignmentTarget(null);
          }}
        />
      )}
      {configuration && !assignmentTarget && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && !canvasBusy && setConfiguration(null)}
        >
          <section
            className="modal config-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">
                  {creatingTemplate
                    ? "Nuevo personalizador"
                    : "Configuración del personalizador"}
                </span>
                <h2 id="config-title">{configuration.name}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar configuración"
                disabled={busy || canvasBusy}
                onClick={() => setConfiguration(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="config-layout">
              <div className="configuration-preview">
                <ProductScene
                  product={configuration}
                  document={defaultDocument(configuration)}
                  guides
                />
                <CanvasImagePicker
                  key={`${creatingTemplate}:${configuration.id}`}
                  value={configuration.canvas}
                  disabled={busy}
                  onBusyChange={setCanvasBusy}
                  onChange={(canvas) =>
                    setConfiguration((current) =>
                      current ? { ...current, canvas, verified: false } : null,
                    )
                  }
                />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canvasBusy || busy) return;
                  void perform(async () => {
                    await request(
                      creatingTemplate ? "create-personalizer" : "product",
                      {
                        product: configuration,
                        ...(creatingTemplate
                          ? {
                              templateId: creatingTemplate,
                              productIds: createSelection.map((p) => p.id),
                            }
                          : {}),
                      },
                    );
                    setConfiguration(null);
                    if (creatingTemplate) setSearchParams({});
                    revalidator.revalidate();
                    setMessage(
                      creatingTemplate
                        ? "Personalizador creado"
                        : "Configuración guardada",
                    );
                    setCreatingTemplate("");
                    setCreateSelection([]);
                  });
                }}
              >
                <div className="field-stack">
                  <label>
                    Nombre del personalizador
                    <input
                      value={configuration.name}
                      required
                      maxLength={100}
                      onChange={(e) =>
                        setConfiguration({
                          ...configuration,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="configuration-assignments">
                    <strong>Productos de Shopify</strong>
                    <p>
                      {creatingTemplate
                        ? createSelection.length
                        : configuration.assignments.length ||
                          (configuration.shopifyProductId ? 1 : 0)}{" "}
                      productos seleccionados
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setAssignmentTarget({
                          product: configuration,
                          draft: !!creatingTemplate,
                          inConfiguration: true,
                        })
                      }
                    >
                      <Package size={17} />
                      Asignar productos
                    </button>
                    <small>
                      Comparte esta área y técnica con todos los productos
                      asignados.
                    </small>
                  </div>
                  <label>
                    Técnica
                    <input
                      value={configuration.technique}
                      required
                      maxLength={100}
                      onChange={(e) =>
                        setConfiguration({
                          ...configuration,
                          technique: e.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="numeric-grid">
                    <label>
                      Ancho del área (mm)
                      <input
                        type="number"
                        min="5"
                        max="600"
                        required
                        value={configuration.widthMm}
                        onChange={(e) =>
                          setConfiguration({
                            ...configuration,
                            widthMm: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Alto del área (mm)
                      <input
                        type="number"
                        min="5"
                        max="600"
                        required
                        value={configuration.heightMm}
                        onChange={(e) =>
                          setConfiguration({
                            ...configuration,
                            heightMm: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="numeric-grid">
                    <label>
                      Forma del área
                      <select
                        value={configuration.mask}
                        onChange={(e) =>
                          setConfiguration({
                            ...configuration,
                            mask: e.target.value as Product["mask"],
                          })
                        }
                      >
                        <option value="rect">Rectangular</option>
                        <option value="ellipse">Ovalada</option>
                      </select>
                    </label>
                    <label>
                      Mínimo ppp
                      <input
                        type="number"
                        min="72"
                        max="600"
                        value={configuration.minDpi}
                        onChange={(e) =>
                          setConfiguration({
                            ...configuration,
                            minDpi: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <details>
                    <summary>Ajustar posición sobre la imagen</summary>
                    <div className="numeric-grid">
                      <label>
                        Posición horizontal
                        <input
                          type="number"
                          min="0"
                          max="900"
                          value={configuration.areaX}
                          onChange={(e) =>
                            setConfiguration({
                              ...configuration,
                              areaX: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Posición vertical
                        <input
                          type="number"
                          min="0"
                          max="900"
                          value={configuration.areaY}
                          onChange={(e) =>
                            setConfiguration({
                              ...configuration,
                              areaY: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Ancho en la vista
                        <input
                          type="number"
                          min="20"
                          max="800"
                          value={configuration.areaWidth}
                          onChange={(e) =>
                            setConfiguration({
                              ...configuration,
                              areaWidth: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </details>
                  <label>
                    Color de la variante
                    <select
                      value={configuration.baseColor}
                      onChange={(e) =>
                        setConfiguration({
                          ...configuration,
                          baseColor: e.target.value,
                        })
                      }
                    >
                      {[
                        ["#e6d6bc", "Beige"],
                        ["#182b4f", "Azul marino"],
                        ["#151515", "Negro"],
                        ["#f1ece4", "Crema y negro"],
                        ["#c83c3c", "Rojo"],
                        ["#d4e4ec", "Crema y azul cielo"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="field-help">
                    Las variantes se vinculan al asignar productos. El precio de
                    compra se mantiene en Shopify.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={configuration.enabled}
                      onChange={(e) =>
                        setConfiguration({
                          ...configuration,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    Activar personalizador
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={configuration.verified}
                      onChange={(e) =>
                        setConfiguration({
                          ...configuration,
                          verified: e.target.checked,
                        })
                      }
                    />
                    El taller confirmó estas medidas y esta técnica
                  </label>
                  <button
                    className="primary full"
                    disabled={busy || canvasBusy}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <SaveIcon />
                    )}
                    {creatingTemplate
                      ? "Crear personalizador"
                      : "Guardar configuración"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
      {detail && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setDetail(null)}
        >
          <section
            className="modal workshop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workshop-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">
                  Diseño {detail.design.id.slice(0, 8)} · revisión{" "}
                  {detail.design.revision}
                </span>
                <h2 id="workshop-title">{detail.design.productName}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar diseño"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="workshop-layout">
              <div>
                <div className="workshop-picture">
                  <ProductScene
                    product={detail.snapshot.product}
                    document={detail.snapshot.document}
                    assets={detail.assets}
                    guides
                  />
                </div>
                <div className="workshop-metadata">
                  <span>{detail.snapshot.product.technique}</span>
                  <span>{detail.snapshot.document.quantity} unidades</span>
                  <span>
                    {detail.snapshot.product.widthMm} ×{" "}
                    {detail.snapshot.product.heightMm} mm
                  </span>
                </div>
                <button
                  className="secondary full"
                  onClick={() => void download()}
                  disabled={busy}
                >
                  <Download size={18} />
                  Descargar paquete de esta revisión
                </button>
                <p className="help-text">
                  Incluye SVG, PNG a 300 ppp, originales y ficha. Verifica las
                  fuentes en el taller. El bordado requiere ponchado aparte.
                </p>
              </div>
              <div className="workshop-controls">
                <span className={`status-badge ${detail.design.status}`}>
                  {statusLabels[detail.design.status]}
                </span>
                <label>
                  Notas de revisión
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Comprueba texto, tamaño y calidad. Indica aquí cualquier cambio necesario."
                  />
                </label>
                <div className="review-actions">
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !["submitted", "changes_requested"].includes(
                        detail.design.status,
                      )
                    }
                    onClick={() => void review("approved")}
                  >
                    <Check size={18} />
                    Aprobar diseño
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      !note.trim() ||
                      !["submitted", "approved", "changes_requested"].includes(
                        detail.design.status,
                      )
                    }
                    onClick={() => void review("changes_requested")}
                  >
                    Solicitar cambios
                  </button>
                </div>
                <div className="production-checklist">
                  <h3>Antes de fabricar</h3>
                  <p>
                    <span
                      className={
                        detail.design.status === "approved"
                          ? "check-ok"
                          : "muted"
                      }
                    >
                      {detail.design.status === "approved" ? "✓" : "○"}
                    </span>
                    Diseño aprobado
                  </p>
                  <p>
                    <span
                      className={
                        currentProduct?.verified ? "check-ok" : "muted"
                      }
                    >
                      {currentProduct?.verified ? "✓" : "○"}
                    </span>
                    Área y técnica validadas
                  </p>
                  <p>
                    <span
                      className={
                        detail.design.payment === "paid" ? "check-ok" : "muted"
                      }
                    >
                      {detail.design.payment === "paid" ? "✓" : "○"}
                    </span>
                    {detail.design.payment === "paid"
                      ? demo
                        ? "Pago simulado"
                        : "Pago confirmado"
                      : "Pago pendiente"}
                  </p>
                  {demo && detail.design.payment !== "paid" && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          await request("demo-payment", {
                            id: detail.design.id,
                            revision: detail.design.revision,
                          });
                          await loadDetail(detail.design.id);
                          revalidator.revalidate();
                        })
                      }
                    >
                      Simular pago para probar el flujo
                    </button>
                  )}
                  <button
                    className="primary full"
                    disabled={busy || !productionReady}
                    onClick={() =>
                      void perform(async () => {
                        await request("production", {
                          id: detail.design.id,
                          revision: detail.design.revision,
                        });
                        await loadDetail(detail.design.id);
                        revalidator.revalidate();
                        setMessage("Revisión autorizada para producción");
                      })
                    }
                  >
                    <PackageCheck size={18} />
                    Autorizar producción
                  </button>
                </div>
                {!demo && detail.design.status === "approved" && (
                  <div className="quote-form">
                    <h3>Cotización</h3>
                    <label>
                      Precio unitario (moneda de Shopify)
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={quote}
                        onChange={(e) => setQuote(e.target.value)}
                      />
                    </label>
                    <button
                      className="secondary full"
                      disabled={busy || !Number(quote)}
                      onClick={() =>
                        void perform(async () => {
                          const result = await request("quote", {
                            id: detail.design.id,
                            revision: detail.design.revision,
                            unitPriceCents: Math.round(Number(quote) * 100),
                          });
                          await loadDetail(detail.design.id);
                          setMessage(
                            "Enlace de pago creado. Puedes copiarlo para compartir.",
                          );
                        })
                      }
                    >
                      <Link2 size={17} />
                      Crear enlace de pago
                    </button>
                    {detail.design.invoiceUrl && (
                      <a
                        href={detail.design.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir enlace de pago
                      </a>
                    )}
                  </div>
                )}
                <details className="history">
                  <summary>Historial de esta personalización</summary>
                  {detail.history.map((event, index) => (
                    <div key={index}>
                      <strong>
                        {actionLabel[event.action] || event.action}
                      </strong>
                      <small>
                        Revisión {event.revision} ·{" "}
                        {new Intl.DateTimeFormat("es", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "America/Lima",
                        }).format(new Date(event.createdAt))}
                      </small>
                      {event.note && <p>{event.note}</p>}
                    </div>
                  ))}
                </details>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function SaveIcon() {
  return <Check size={18} />;
}
export default function DashboardRoute() {
  const { demo, apiKey } = useLoaderData<typeof loader>();
  return demo ? (
    <Dashboard />
  ) : (
    <AppProvider apiKey={apiKey}>
      <Dashboard />
    </AppProvider>
  );
}
