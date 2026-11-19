import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Package, Search, X } from "lucide-react";
import type {
  CatalogProduct,
  CatalogPage,
} from "../lib/shopify-catalog.server";

export function ProductPicker({
  name,
  initial,
  demo,
  onClose,
  onSave,
}: {
  name: string;
  initial: CatalogProduct[];
  demo: boolean;
  onClose: () => void;
  onSave: (products: CatalogProduct[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState(
      new Map(initial.map((p) => [p.id, p])),
    ),
    [query, setQuery] = useState(""),
    [products, setProducts] = useState<CatalogProduct[]>([]),
    [pageInfo, setPageInfo] = useState<CatalogPage["pageInfo"]>({
      hasNextPage: false,
      endCursor: null,
    }),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    searchInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLElement>(null),
    close = useRef(onClose),
    pending = useRef(saving);
  close.current = onClose;
  pending.current = saving;
  async function load(
    search: string,
    after?: string,
    signal?: AbortSignal,
    version = generation.current,
  ) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/shopify-products?${new URLSearchParams({ query: search, ...(after ? { after } : {}) })}`,
        { signal },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "No se pudieron consultar los productos.",
        );
      if (version !== generation.current || signal?.aborted) return;
      setProducts((previous) =>
        after ? [...previous, ...result.products] : result.products,
      );
      setPageInfo(result.pageInfo);
    } catch (e) {
      if (version === generation.current && !signal?.aborted)
        setError(e instanceof Error ? e.message : "Revisa la conexión.");
    } finally {
      if (version === generation.current && !signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    searchInput.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending.current) close.current();
      if (e.key === "Tab") {
        const elements = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),a[href]",
          ) || []),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      version = ++generation.current;
    setProducts([]);
    setPageInfo({ hasNextPage: false, endCursor: null });
    setLoading(true);
    const timer = setTimeout(
      () => void load(query, undefined, controller.signal, version),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  function toggle(product: CatalogProduct) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(product.id)) next.delete(product.id);
      else next.set(product.id, product);
      return next;
    });
  }
  const allVisible =
    products.length > 0 && products.every((p) => selected.has(p.id));
  return (
    <div className="modal-backdrop product-picker-backdrop">
      <section
        ref={dialog}
        className="modal product-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
      >
        <div className="modal-heading">
          <div>
            <h2 id="assign-title">Asignar productos</h2>
            <p>Selecciona los productos para {name}.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar asignación"
            disabled={saving}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="picker-search">
          <label className="search-field">
            <Search size={18} />
            <input
              ref={searchInput}
              aria-label="Buscar productos de Shopify"
              placeholder="Buscar productos de la tienda…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {demo && <small>Catálogo de prueba local</small>}
        </div>
        <div className="picker-select-all">
          <label>
            <input
              type="checkbox"
              checked={allVisible}
              disabled={!products.length || saving}
              onChange={() =>
                setSelected((previous) => {
                  const next = new Map(previous);
                  products.forEach((p) =>
                    allVisible ? next.delete(p.id) : next.set(p.id, p),
                  );
                  return next;
                })
              }
            />
            Seleccionar los productos mostrados
          </label>
          <span>{products.length} mostrados</span>
        </div>
        <div className="picker-products" aria-busy={loading}>
          {products.map((p) => (
            <label
              className={`picker-product ${selected.has(p.id) ? "selected" : ""}`}
              key={p.id}
            >
              <input
                type="checkbox"
                aria-label={`Asignar ${p.title}`}
                checked={selected.has(p.id)}
                disabled={saving}
                onChange={() => toggle(p)}
              />
              <span className="picker-image">
                {p.featuredImage ? (
                  <img src={p.featuredImage.url} alt="" />
                ) : (
                  <Package size={23} />
                )}
              </span>
              <span>
                <strong>{p.title}</strong>
                <small>
                  {p.status === "ACTIVE"
                    ? "Activo"
                    : p.status === "DRAFT"
                      ? "Borrador"
                      : "Archivado"}
                </small>
              </span>
            </label>
          ))}
          {loading && (
            <p className="picker-loading">
              <LoaderCircle size={19} className="spin" />
              Consultando productos…
            </p>
          )}
          {!loading && !error && !products.length && (
            <p className="picker-empty">
              No hay productos que coincidan con la búsqueda.
            </p>
          )}
          {pageInfo.hasNextPage && !loading && (
            <button
              className="secondary picker-more"
              onClick={() => void load(query, pageInfo.endCursor || undefined)}
            >
              Cargar más productos
            </button>
          )}
        </div>
        {selected.size > 0 && (
          <div className="picker-selection">
            <strong>Selección ({selected.size})</strong>
            <div>
              {[...selected.values()].map((p) => (
                <button
                  key={p.id}
                  disabled={saving}
                  onClick={() => toggle(p)}
                  aria-label={`Quitar ${p.title}`}
                >
                  {p.title}
                  <X size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="picker-error" role="alert">
            {error}
          </p>
        )}
        <div className="picker-footer">
          <span>{selected.size} productos seleccionados</span>
          <button className="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary"
            disabled={saving || selected.size > 100}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await onSave([...selected.values()]);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "No se pudo guardar la asignación.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <LoaderCircle className="spin" size={16} /> : null}Guardar
            asignación
          </button>
        </div>
      </section>
    </div>
  );
}
