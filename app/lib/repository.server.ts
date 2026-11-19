import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  canProduce,
  documentSchema,
  productSchema,
  validateDocument,
  type DesignDocument,
  type PaymentStatus,
  type Product,
  type ReviewStatus,
} from "./domain";
import { seedCatalog } from "./catalog";

export interface Revision {
  document: DesignDocument;
  product: Product;
  createdAt: string;
}
export interface Design {
  id: string;
  shop: string;
  owner: string;
  revision: number;
  status: ReviewStatus;
  payment: PaymentStatus;
  approvedRevision: number | null;
  note: string;
  updatedAt: string;
  productName: string;
  orderId: string;
  invoiceUrl?: string;
  quoteId?: string;
}
export interface Asset {
  id: string;
  shop: string;
  owner: string;
  name: string;
  width: number;
  height: number;
  data: string;
}
export class Repository {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS products(shop TEXT,id TEXT,json TEXT NOT NULL,PRIMARY KEY(shop,id));
      CREATE TABLE IF NOT EXISTS designs(shop TEXT,id TEXT,owner TEXT,json TEXT NOT NULL,PRIMARY KEY(shop,id));
      CREATE TABLE IF NOT EXISTS revisions(shop TEXT,id TEXT,revision INTEGER,json TEXT NOT NULL,PRIMARY KEY(shop,id,revision));
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,shop TEXT,owner TEXT,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(shop TEXT,id TEXT,PRIMARY KEY(shop,id));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,shop TEXT,designId TEXT,actor TEXT,action TEXT,revision INTEGER,note TEXT,createdAt TEXT);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,shop TEXT,json TEXT NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  seed(shop: string) {
    const statement = this.db.prepare(
      "INSERT OR IGNORE INTO products VALUES (?,?,?)",
    );
    seedCatalog.forEach((product) =>
      statement.run(shop, product.id, JSON.stringify(product)),
    );
  }
  getProduct(shop: string, id: string): Product | null {
    const value = this.read<Product>(
      "SELECT json FROM products WHERE shop=? AND id=?",
      shop,
      id,
    );
    return value ? productSchema.parse(value) : null;
  }
  listProducts(shop: string): Product[] {
    return this.rows<Product>(
      "SELECT json FROM products WHERE shop=? ORDER BY rowid",
      shop,
    ).map((value) => productSchema.parse(value));
  }
  updateProduct(shop: string, input: Product) {
    const product = productSchema.parse(input);
    if (!this.getProduct(shop, product.id))
      throw new Error("Producto no encontrado.");
    this.db
      .prepare("UPDATE products SET json=? WHERE shop=? AND id=?")
      .run(JSON.stringify(product), shop, product.id);
    return product;
  }
  getDesign(shop: string, id: string) {
    return this.read<Design>(
      "SELECT json FROM designs WHERE shop=? AND id=?",
      shop,
      id,
    );
  }
  getOwnedDesign(shop: string, owner: string, id: string) {
    const record = this.getDesign(shop, id);
    return record?.owner === owner ? record : null;
  }
  listDesigns(shop: string) {
    return this.rows<Design>(
      "SELECT json FROM designs WHERE shop=? ORDER BY rowid DESC",
      shop,
    );
  }
  getRevision(shop: string, id: string, revision: number) {
    return this.read<Revision>(
      "SELECT json FROM revisions WHERE shop=? AND id=? AND revision=?",
      shop,
      id,
      revision,
    );
  }
  saveDesign(
    shop: string,
    owner: string,
    input: DesignDocument,
    id?: string,
    expectedRevision?: number,
  ) {
    const document = documentSchema.parse(input),
      product = this.getProduct(shop, document.productId);
    if (!product?.enabled) throw new Error("El producto no está disponible.");
    const previous = id ? this.getOwnedDesign(shop, owner, id) : null;
    if (id && !previous) throw new Error("Diseño no encontrado.");
    if (
      previous &&
      (previous.payment === "paid" || previous.orderId || previous.quoteId)
    )
      throw new Error(
        "Este diseño ya está vinculado a una compra o cotización. Crea una copia para editarlo.",
      );
    if (
      previous &&
      (previous.revision !== expectedRevision ||
        previous.status === "production")
    )
      throw new Error(
        "El diseño cambió. Recarga para continuar con la última revisión.",
      );
    const record: Design = {
      id: id || randomUUID(),
      shop,
      owner,
      revision: (previous?.revision ?? 0) + 1,
      status: "draft",
      payment: previous?.payment ?? "pending",
      approvedRevision: null,
      note: "",
      productName: product.name,
      updatedAt: new Date().toISOString(),
      orderId: previous?.orderId ?? "",
    };
    const snapshot = { document, product, createdAt: record.updatedAt };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO revisions VALUES (?,?,?,?)")
        .run(shop, record.id, record.revision, JSON.stringify(snapshot));
      this.persist(record);
      this.audit(shop, record.id, "customer", "saved", record.revision, "");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return record;
  }
  submitDesign(shop: string, owner: string, id: string, revision: number) {
    const record = this.getOwnedDesign(shop, owner, id);
    if (!record || record.revision !== revision)
      throw new Error("El diseño cambió. Guarda la revisión actual.");
    if (record.status === "production")
      throw new Error("Este diseño ya está en producción.");
    const snapshot = this.getRevision(shop, id, revision)!;
    const issues = validateDocument(snapshot.document, snapshot.product);
    if (issues.length) throw new Error(issues.join(" "));
    record.status = "submitted";
    record.approvedRevision = null;
    this.persist(record);
    this.audit(shop, id, "customer", "submitted", revision, "");
    return record;
  }
  reviewDesign(
    shop: string,
    id: string,
    revision: number,
    status: "approved" | "changes_requested",
    note: string,
    actor: string,
  ) {
    const record = this.getDesign(shop, id);
    if (
      !record ||
      record.revision !== revision ||
      !["submitted", "changes_requested", "approved"].includes(record.status)
    )
      throw new Error("La revisión no está disponible para aprobar.");
    if (status === "changes_requested" && !note.trim())
      throw new Error("Indica los cambios que necesita el diseño.");
    const snapshot = this.getRevision(shop, id, revision)!;
    const issues = validateDocument(snapshot.document, snapshot.product);
    if (status === "approved" && issues.length)
      throw new Error(issues.join(" "));
    record.status = status;
    record.note = note.slice(0, 2000);
    record.approvedRevision = status === "approved" ? revision : null;
    this.persist(record);
    this.audit(shop, id, actor, status, revision, note);
    return record;
  }
  setDemoPayment(shop: string, id: string, payment: PaymentStatus) {
    if (shop !== "demo")
      throw new Error("El pago debe confirmarse desde Shopify.");
    const record = this.getDesign(shop, id);
    if (!record) throw new Error("Diseño no encontrado.");
    record.payment = payment;
    this.persist(record);
    this.audit(shop, id, "demo", "simulated_payment", record.revision, payment);
    return record;
  }
  startProduction(shop: string, id: string, revision: number, actor: string) {
    const record = this.getDesign(shop, id),
      snapshot = this.getRevision(shop, id, revision);
    const current = snapshot && this.getProduct(shop, snapshot.product.id);
    const verified =
      !!current?.verified &&
      current.widthMm === snapshot?.product.widthMm &&
      current.heightMm === snapshot?.product.heightMm &&
      current.mask === snapshot?.product.mask &&
      current.technique === snapshot?.product.technique &&
      current.minDpi === snapshot?.product.minDpi;
    if (
      !record ||
      record.revision !== revision ||
      !canProduce({ ...record, verified })
    )
      throw new Error(
        "Se requiere diseño aprobado, pago confirmado y medidas de esta revisión validadas.",
      );
    record.status = "production";
    this.persist(record);
    this.audit(shop, id, actor, "production", revision, "");
    return record;
  }
  putAsset(asset: Asset) {
    const usage = this.db
      .prepare(
        "SELECT COALESCE(SUM(length(json)),0) AS bytes FROM assets WHERE shop=?",
      )
      .get(asset.shop) as { bytes: number };
    const json = JSON.stringify(asset);
    if (usage.bytes + json.length > 256_000_000)
      throw new Error(
        "El almacenamiento de imágenes alcanzó el límite del piloto. Contacta con la tienda.",
      );
    this.db
      .prepare("INSERT INTO assets VALUES (?,?,?,?)")
      .run(asset.id, asset.shop, asset.owner, json);
  }
  getAsset(shop: string, id: string) {
    return this.read<Asset>(
      "SELECT json FROM assets WHERE shop=? AND id=?",
      shop,
      id,
    );
  }
  recordEvent(shop: string, id: string) {
    return (
      this.db.prepare("INSERT OR IGNORE INTO events VALUES (?,?)").run(shop, id)
        .changes > 0
    );
  }
  history(shop: string, id: string) {
    return this.db
      .prepare(
        "SELECT actor,action,revision,note,createdAt FROM audit WHERE shop=? AND designId=? ORDER BY id DESC",
      )
      .all(shop, id);
  }
  attachOrder(
    shop: string,
    id: string,
    revision: number,
    orderId: string,
    paid: boolean,
  ) {
    const record = this.getDesign(shop, id);
    if (
      !record ||
      record.revision !== revision ||
      (record.orderId && record.orderId !== orderId)
    )
      return false;
    if (!paid && record.payment === "paid") {
      record.status = "changes_requested";
      record.approvedRevision = null;
      record.note =
        "El pago del pedido cambió o se anuló. Detener fabricación y revisar el pedido en Shopify.";
    }
    record.orderId = orderId;
    record.payment = paid ? "paid" : "pending";
    this.persist(record);
    this.audit(
      shop,
      id,
      "Shopify",
      paid ? "payment_confirmed" : "order_received",
      revision,
      orderId,
    );
    return true;
  }
  attachQuote(shop: string, id: string, quoteId: string, invoiceUrl: string) {
    const record = this.getDesign(shop, id);
    if (!record) throw new Error("Diseño no encontrado.");
    record.quoteId = quoteId;
    record.invoiceUrl = invoiceUrl;
    this.persist(record);
    return record;
  }
  invalidateOrder(shop: string, id: string, orderId: string) {
    const record = this.getDesign(shop, id);
    if (!record || record.orderId !== orderId) return;
    record.payment = "pending";
    record.status = "changes_requested";
    record.approvedRevision = null;
    record.note =
      "El pedido cambió y ya no coincide con el diseño firmado. Detener fabricación y revisar en Shopify.";
    this.persist(record);
    this.audit(shop, id, "Shopify", "order_mismatch", record.revision, orderId);
  }
  private persist(record: Design) {
    record.updatedAt = new Date().toISOString();
    this.db
      .prepare("INSERT OR REPLACE INTO designs VALUES (?,?,?,?)")
      .run(record.shop, record.id, record.owner, JSON.stringify(record));
  }
  private audit(
    shop: string,
    id: string,
    actor: string,
    action: string,
    revision: number,
    note: string,
  ) {
    this.db
      .prepare(
        "INSERT INTO audit(shop,designId,actor,action,revision,note,createdAt) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        shop,
        id,
        actor,
        action,
        revision,
        note.slice(0, 2000),
        new Date().toISOString(),
      );
  }
  private read<T>(sql: string, ...params: (string | number)[]): T | null {
    const row = this.db.prepare(sql).get(...params) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as T) : null;
  }
  private rows<T>(sql: string, ...params: string[]): T[] {
    return (this.db.prepare(sql).all(...params) as Array<{ json: string }>).map(
      (row) => JSON.parse(row.json) as T,
    );
  }
}

declare global {
  var souvenirRepository: Repository | undefined;
}
export function getRepository() {
  return (globalThis.souvenirRepository ??= new Repository(
    process.env.DATABASE_PATH || "./data/souvenir.sqlite",
  ));
}
