import { useState } from "react";
import {
  ExternalLink,
  Plus,
  Search,
  Settings2,
  Package,
  Layers,
} from "lucide-react";
import { ProductScene } from "./ProductScene";
import { defaultDocument, type Product } from "../lib/domain";

export const assignmentCount = (p: Product) =>
  p.assignments.length || (p.shopifyProductId ? 1 : 0);
export const isActivePersonalizer = (p: Product) =>
  p.enabled && assignmentCount(p) > 0;

export function PersonalizerList({
  products,
  demo,
  storeDomain,
  busy,
  onCreate,
  onAssign,
  onEdit,
  onToggle,
}: {
  products: Product[];
  demo: boolean;
  storeDomain: string;
  busy: boolean;
  onCreate: () => void;
  onAssign: (p: Product) => void;
  onEdit: (p: Product) => void;
  onToggle: (p: Product) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const visible = products.filter(
    (p) =>
      `${p.name} ${p.assignments.map((a) => a.title).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" || isActivePersonalizer(p) === (filter === "active")),
  );
  const assignedIds = new Set(
    products.flatMap((p) =>
      p.assignments.length
        ? p.assignments.map((a) => a.productId)
        : p.shopifyProductId
          ? [p.shopifyProductId]
          : [],
    ),
  );
  return (
    <>
      <div className="page-heading personalizer-heading">
        <div>
          <h1>Personalizadores</h1>
          <p>Un diseño preparado para uno o varios productos de tu tienda.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={18} />
          Crear personalizador
        </button>
      </div>
      <div className="personalizer-metrics">
        <div>
          <span>Personalizadores</span>
          <strong>{products.length}</strong>
        </div>
        <div>
          <span>Activos</span>
          <strong>{products.filter(isActivePersonalizer).length}</strong>
        </div>
        <div>
          <span>Productos asignados</span>
          <strong>{assignedIds.size}</strong>
        </div>
      </div>
      <div className="personalizer-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar personalizadores"
            placeholder="Buscar por personalizador o producto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div
          className="personalizer-filters"
          role="group"
          aria-label="Estado del personalizador"
        >
          {[
            ["all", "Todos"],
            ["active", "Activos"],
            ["inactive", "Inactivos"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="personalizer-list">
        {visible.map((p) => (
          <article className="personalizer-row" key={p.id} aria-label={p.name}>
            <div className="personalizer-thumbnail">
              <ProductScene product={p} document={defaultDocument(p)} />
            </div>
            <div className="personalizer-description">
              <div className="personalizer-row-title">
                <h2>{p.name}</h2>
                <span
                  className={`personalizer-state ${isActivePersonalizer(p) ? "active" : ""}`}
                >
                  {isActivePersonalizer(p)
                    ? "Activo"
                    : !assignmentCount(p)
                      ? "Sin productos"
                      : "Inactivo"}
                </span>
              </div>
              <p>
                {p.technique} <span>·</span> {p.widthMm} × {p.heightMm} mm
              </p>
              <div className="assigned-products-summary">
                <Package size={14} />
                <span>
                  {assignmentCount(p)}{" "}
                  {assignmentCount(p) === 1
                    ? "producto asignado"
                    : "productos asignados"}
                </span>
                {p.assignments.length > 0 && (
                  <small title={p.assignments.map((a) => a.title).join(", ")}>
                    {p.assignments.map((a) => a.title).join(", ")}
                  </small>
                )}
              </div>
            </div>
            <div className="personalizer-actions">
              <label className="personalizer-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Activar ${p.name}`}
                  checked={p.enabled}
                  disabled={busy}
                  onChange={() => onToggle(p)}
                />
                <span aria-hidden="true" />
              </label>
              <button className="secondary compact" onClick={() => onAssign(p)}>
                <Package size={16} />
                Asignar productos
              </button>
              <button
                className="secondary icon-button"
                aria-label={`Configurar ${p.name}`}
                onClick={() => onEdit(p)}
              >
                <Settings2 size={18} />
              </button>
              {p.enabled && (
                <a
                  className="button secondary icon-button"
                  title="Abrir vista previa"
                  aria-label={`Vista previa de ${p.name}`}
                  href={`/studio/${p.id}${demo ? "" : `?shop=${encodeURIComponent(storeDomain)}`}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={17} />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="empty-state">
          <Layers size={30} />
          <h2>
            {products.length
              ? "No encontramos personalizadores"
              : "Crea tu primer personalizador"}
          </h2>
          <p>
            {products.length
              ? "Prueba otro nombre o cambia el filtro."
              : "Elige una plantilla del catálogo, prepara el diseño y asígnalo a tus productos."}
          </p>
          {!products.length && (
            <button className="primary" onClick={onCreate}>
              Elegir una plantilla
            </button>
          )}
        </div>
      )}
      <p className="personalizer-footnote">
        Cada producto puede tener un personalizador activo. Las asignaciones
        incluyen todas sus variantes; el precio se conserva en Shopify.
      </p>
    </>
  );
}
