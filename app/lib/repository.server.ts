import { randomUUID } from "node:crypto";
import {
  canProduce,
  documentSchema,
  productSchema,
  assignmentSchema,
  resolveAssignedProduct,
  validateDocument,
  type DesignDocument,
  type PaymentStatus,
  type Product,
  type ProductAssignment,
  type ReviewStatus,
} from "./domain";
import { seedCatalog } from "./catalog";
import { SqliteStorage } from "./storage-sqlite.server";
import { SupabaseStorage } from "./storage-supabase.server";
import { UnitOfWork } from "./unit-of-work.server";
import type { StorageDriver } from "./storage-types";

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
  purpose?: "canvas";
}
export interface AssetMetadata extends Omit<Asset, "data"> {
  bytes: number;
}
export interface Audit {
  id: string;
  designId: string;
  actor: string;
  action: string;
  revision: number;
  note: string;
  createdAt: string;
}
export interface StoredSession {
  id: string;
  shop: string;
  properties: [string, string | number | boolean][];
}
export interface OrderUpdate {
  id: string;
  revision: number;
  orderId: string;
  paid: boolean;
}

export class Repository {
  readonly driver: StorageDriver;
  constructor(storage: string | StorageDriver) {
    this.driver =
      typeof storage === "string" ? new SqliteStorage(storage) : storage;
  }
  close() {
    this.driver.close();
  }
  private async atomic<T>(
    work: (tx: UnitOfWork) => Promise<T>,
    event?: { shop: string; id: string },
  ): Promise<T | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const tx = new UnitOfWork(this.driver),
        result = await work(tx),
        state = await this.driver.commit(tx.changes(), event);
      if (state === "committed") return result;
      if (state === "duplicate") return null;
    }
    throw new Error(
      "El diseño cambió en otra sesión. Recarga y vuelve a intentarlo.",
    );
  }
  private async audit(
    tx: UnitOfWork,
    shop: string,
    id: string,
    actor: string,
    action: string,
    revision: number,
    note: string,
  ) {
    const event: Audit = {
      id: randomUUID(),
      designId: id,
      actor,
      action,
      revision,
      note: note.slice(0, 2000),
      createdAt: new Date().toISOString(),
    };
    await tx.set("audit", shop, event.id, event);
  }
  private async persist(tx: UnitOfWork, record: Design) {
    record.updatedAt = new Date().toISOString();
    await tx.set("design", record.shop, record.id, record);
  }
  async seed(shop: string) {
    await this.atomic(async (tx) => {
      for (const product of seedCatalog)
        if (!(await tx.get("product", shop, product.id)))
          await tx.set("product", shop, product.id, {
            ...product,
            enabled: shop === "demo" && product.id === "cap-patch",
          });
    });
  }
  async getProduct(shop: string, id: string): Promise<Product | null> {
    const row = await this.driver.get<Product>({ kind: "product", shop, id });
    return row ? productSchema.parse(row.data) : null;
  }
  async listProducts(shop: string): Promise<Product[]> {
    const rows = await this.driver.list<Product>("product", shop),
      order = new Map(seedCatalog.map((p, i) => [p.id, i]));
    return rows
      .map((row) => productSchema.parse(row.data))
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }
  async updateProduct(shop: string, input: Product) {
    const product = productSchema.parse(input);
    return (await this.atomic(async (tx) => {
      const existing = await tx.get<Product>("product", shop, product.id);
      if (!existing) throw new Error("Producto no encontrado.");
      await this.validateCanvas(tx, shop, product);
      const updated = {
        ...product,
        templateId:
          existing.templateId ||
          seedCatalog.find((p) => p.id === existing.id)?.id ||
          "",
        assignments: existing.assignments || [],
        createdAt: existing.createdAt || "",
      };
      await this.syncProductClaims(
        tx,
        shop,
        productSchema.parse(existing),
        updated,
      );
      await tx.set("product", shop, product.id, updated);
      return updated;
    }))!;
  }
  private async validateCanvas(tx: UnitOfWork, shop: string, product: Product) {
    if (!product.canvas) return;
    const asset = await tx.get<AssetMetadata>(
      "asset",
      shop,
      product.canvas.assetId,
    );
    if (product.canvas.shop !== shop || asset?.purpose !== "canvas")
      throw new Error(
        "La imagen del lienzo no pertenece a esta tienda o no es una imagen base válida.",
      );
  }
  private assignedIds(product: Product) {
    return product.assignments.length
      ? product.assignments.map((a) => a.productId)
      : product.shopifyProductId
        ? [product.shopifyProductId]
        : [];
  }
  private async syncProductClaims(
    tx: UnitOfWork,
    shop: string,
    previous: Product,
    next: Product,
  ) {
    const oldIds = previous.enabled ? this.assignedIds(previous) : [],
      newIds = next.enabled ? this.assignedIds(next) : [];
    if (newIds.length) {
      for (const other of await tx.list<Product>("product", shop)) {
        const parsed = productSchema.parse(other);
        if (
          parsed.id !== next.id &&
          parsed.enabled &&
          this.assignedIds(parsed).some((id) => newIds.includes(id))
        )
          throw new Error(
            `Un producto ya tiene otro personalizador activo: ${parsed.name}. Desactívalo o cambia la asignación.`,
          );
      }
    }
    for (const productId of new Set([...oldIds, ...newIds])) {
      const key = `personalizer-product:${productId.split("/").pop()}`;
      const claim = await tx.get<{ personalizerId: string }>(
        "quota",
        shop,
        key,
      );
      if (newIds.includes(productId)) {
        if (claim && claim.personalizerId !== next.id)
          throw new Error("Este producto ya tiene otro personalizador activo.");
        await tx.set("quota", shop, key, { personalizerId: next.id });
      } else if (claim?.personalizerId === next.id)
        await tx.delete("quota", shop, key);
    }
  }
  async findPersonalizer(shop: string, variantId: string, productId?: string) {
    for (const product of await this.listPersonalizers(shop)) {
      if (!product.enabled) continue;
      try {
        return resolveAssignedProduct(product, variantId, productId);
      } catch {}
    }
    return null;
  }
  async listPersonalizers(shop: string) {
    return (await this.listProducts(shop)).filter(
      (p) => p.templateId || p.enabled || p.variantId || p.assignments.length,
    );
  }
  async createPersonalizer(
    shop: string,
    templateId: string,
    name: string,
    settings?: Partial<Product>,
    assignments: ProductAssignment[] = [],
  ) {
    const template = seedCatalog.find((p) => p.id === templateId);
    if (!template) throw new Error("Plantilla no encontrada.");
    const product = productSchema.parse({
      ...template,
      ...settings,
      id: `p-${randomUUID()}`,
      name: name.trim(),
      templateId,
      createdAt: new Date().toISOString(),
      enabled: settings?.enabled === true,
      verified: settings?.verified === true,
      variantId: "",
      shopifyProductId: "",
      assignments: assignments.map((a) => assignmentSchema.parse(a)),
    });
    await this.atomic(async (tx) => {
      await this.validateCanvas(tx, shop, product);
      await this.syncProductClaims(
        tx,
        shop,
        { ...product, enabled: false },
        product,
      );
      await tx.set("product", shop, product.id, product);
    });
    return product;
  }
  async assignProducts(shop: string, id: string, input: ProductAssignment[]) {
    const assignments = productSchema.shape.assignments.parse(input);
    if (
      new Set(assignments.map((a) => a.productId)).size !== assignments.length
    )
      throw new Error("Hay productos asignados duplicados.");
    return (await this.atomic(async (tx) => {
      const existing = await tx.get<Product>("product", shop, id);
      if (!existing) throw new Error("Personalizador no encontrado.");
      const product = productSchema.parse({
        ...existing,
        templateId:
          existing.templateId ||
          seedCatalog.find((p) => p.id === existing.id)?.id ||
          "",
        assignments,
        variantId: "",
        shopifyProductId: "",
        enabled: assignments.length ? existing.enabled : false,
      });
      await this.syncProductClaims(
        tx,
        shop,
        productSchema.parse(existing),
        product,
      );
      await tx.set("product", shop, id, product);
      return product;
    }))!;
  }
  async getDesign(shop: string, id: string) {
    return (
      (await this.driver.get<Design>({ kind: "design", shop, id }))?.data ??
      null
    );
  }
  async getOwnedDesign(shop: string, owner: string, id: string) {
    const design = await this.getDesign(shop, id);
    return design?.owner === owner ? design : null;
  }
  async listDesigns(shop: string) {
    return (await this.driver.list<Design>("design", shop))
      .map((row) => row.data)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getRevision(shop: string, id: string, revision: number) {
    return (
      (
        await this.driver.get<Revision>({
          kind: "revision",
          shop,
          id: `${id}:${revision}`,
        })
      )?.data ?? null
    );
  }
  async saveDesign(
    shop: string,
    owner: string,
    input: DesignDocument,
    id?: string,
    expectedRevision?: number,
  ) {
    const document = documentSchema.parse(input),
      recordId = id ?? randomUUID();
    return (await this.atomic(async (tx) => {
      const configured = await tx.get<Product>(
        "product",
        shop,
        document.productId,
      );
      if (!configured?.enabled)
        throw new Error("El producto no está disponible.");
      const product = resolveAssignedProduct(
        productSchema.parse(configured),
        document.variantId,
      );
      if (shop !== "demo" && document.color !== product.baseColor)
        throw new Error("El color no coincide con la configuración.");
      const previous = id ? await tx.get<Design>("design", shop, id) : null;
      if (id && previous?.owner !== owner)
        throw new Error("Diseño no encontrado.");
      if (previous) {
        const snapshot = await tx.get<Revision>(
          "revision",
          shop,
          `${id}:${previous.revision}`,
        );
        if (
          snapshot?.document.variantId !== document.variantId ||
          snapshot?.document.productId !== document.productId
        )
          throw new Error(
            "Crea un diseño nuevo para otra variante o personalizador.",
          );
      }
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
        id: recordId,
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
      await tx.set("revision", shop, `${recordId}:${record.revision}`, {
        document,
        product,
        createdAt: record.updatedAt,
      });
      await this.persist(tx, record);
      await this.audit(
        tx,
        shop,
        recordId,
        "customer",
        "saved",
        record.revision,
        "",
      );
      return record;
    }))!;
  }
  async submitDesign(
    shop: string,
    owner: string,
    id: string,
    revision: number,
  ) {
    return (await this.atomic(async (tx) => {
      const record = await tx.get<Design>("design", shop, id);
      if (!record || record.owner !== owner || record.revision !== revision)
        throw new Error("El diseño cambió. Guarda la revisión actual.");
      if (record.status === "production")
        throw new Error("Este diseño ya está en producción.");
      const snapshot = await tx.get<Revision>(
        "revision",
        shop,
        `${id}:${revision}`,
      );
      if (!snapshot) throw new Error("Revisión no encontrada.");
      const issues = validateDocument(snapshot.document, snapshot.product);
      if (issues.length) throw new Error(issues.join(" "));
      record.status = "submitted";
      record.approvedRevision = null;
      await this.persist(tx, record);
      await this.audit(tx, shop, id, "customer", "submitted", revision, "");
      return record;
    }))!;
  }
  async reviewDesign(
    shop: string,
    id: string,
    revision: number,
    status: "approved" | "changes_requested",
    note: string,
    actor: string,
  ) {
    return (await this.atomic(async (tx) => {
      const record = await tx.get<Design>("design", shop, id);
      if (
        !record ||
        record.revision !== revision ||
        !["submitted", "changes_requested", "approved"].includes(record.status)
      )
        throw new Error("La revisión no está disponible para aprobar.");
      if (status === "changes_requested" && !note.trim())
        throw new Error("Indica los cambios que necesita el diseño.");
      const snapshot = await tx.get<Revision>(
        "revision",
        shop,
        `${id}:${revision}`,
      );
      if (!snapshot) throw new Error("Revisión no encontrada.");
      const issues = validateDocument(snapshot.document, snapshot.product);
      if (status === "approved" && issues.length)
        throw new Error(issues.join(" "));
      record.status = status;
      record.note = note.slice(0, 2000);
      record.approvedRevision = status === "approved" ? revision : null;
      await this.persist(tx, record);
      await this.audit(tx, shop, id, actor, status, revision, note);
      return record;
    }))!;
  }
  async setDemoPayment(shop: string, id: string, payment: PaymentStatus) {
    if (shop !== "demo")
      throw new Error("El pago debe confirmarse desde Shopify.");
    return (await this.atomic(async (tx) => {
      const record = await tx.get<Design>("design", shop, id);
      if (!record) throw new Error("Diseño no encontrado.");
      record.payment = payment;
      await this.persist(tx, record);
      await this.audit(
        tx,
        shop,
        id,
        "demo",
        "simulated_payment",
        record.revision,
        payment,
      );
      return record;
    }))!;
  }
  async startProduction(
    shop: string,
    id: string,
    revision: number,
    actor: string,
  ) {
    return (await this.atomic(async (tx) => {
      const record = await tx.get<Design>("design", shop, id),
        snapshot = await tx.get<Revision>(
          "revision",
          shop,
          `${id}:${revision}`,
        ),
        current = snapshot
          ? await tx.get<Product>("product", shop, snapshot.product.id)
          : null;
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
      await this.persist(tx, record);
      await this.audit(tx, shop, id, actor, "production", revision, "");
      return record;
    }))!;
  }
  async putAsset(asset: Asset) {
    const bytes = Buffer.from(asset.data.split(",")[1], "base64");
    await this.driver.putBlob(asset.shop, asset.id, bytes);
    try {
      await this.atomic(async (tx) => {
        if (await tx.get("asset", asset.shop, asset.id))
          throw new Error("La imagen ya existe.");
        const quota = await tx.get<{ bytes: number }>(
          "quota",
          asset.shop,
          "asset-bytes",
        );
        const usage =
          quota?.bytes ??
          (await tx.list<AssetMetadata>("asset", asset.shop)).reduce(
            (sum, a) => sum + a.bytes,
            0,
          );
        if (usage + bytes.length > 256_000_000)
          throw new Error(
            "El almacenamiento de imágenes alcanzó el límite del piloto. Contacta con la tienda.",
          );
        const { data: unused, ...metadata } = asset;
        await tx.set("asset", asset.shop, asset.id, {
          ...metadata,
          bytes: bytes.length,
        });
        await tx.set("quota", asset.shop, "asset-bytes", {
          bytes: usage + bytes.length,
        });
      });
    } catch (error) {
      try {
        if (
          !(await this.driver.get({
            kind: "asset",
            shop: asset.shop,
            id: asset.id,
          }))
        )
          await this.driver.deleteBlob(asset.shop, asset.id);
      } catch {}
      throw error;
    }
  }
  async getAssetMetadata(shop: string, id: string) {
    return (
      (await this.driver.get<AssetMetadata>({ kind: "asset", shop, id }))
        ?.data ?? null
    );
  }
  async getAsset(shop: string, id: string): Promise<Asset | null> {
    const asset = await this.getAssetMetadata(shop, id);
    if (!asset) return null;
    const bytes = await this.driver.getBlob(shop, id);
    return {
      ...asset,
      data: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
    };
  }
  async history(shop: string, id: string) {
    return (await this.driver.list<Audit>("audit", shop))
      .map((row) => row.data)
      .filter((event) => event.designId === id);
  }
  async recordEvent(shop: string, id: string) {
    return (await this.atomic(async () => true, { shop, id })) !== null;
  }
  private async order(tx: UnitOfWork, shop: string, update: OrderUpdate) {
    const record = await tx.get<Design>("design", shop, update.id);
    if (
      !record ||
      record.revision !== update.revision ||
      (record.orderId && record.orderId !== update.orderId)
    )
      return false;
    if (!update.paid && record.payment === "paid") {
      record.status = "changes_requested";
      record.approvedRevision = null;
      record.note =
        "El pago del pedido cambió o se anuló. Detener fabricación y revisar el pedido en Shopify.";
    }
    record.orderId = update.orderId;
    record.payment = update.paid ? "paid" : "pending";
    await this.persist(tx, record);
    await this.audit(
      tx,
      shop,
      record.id,
      "Shopify",
      update.paid ? "payment_confirmed" : "order_received",
      update.revision,
      update.orderId,
    );
    return true;
  }
  async attachOrder(
    shop: string,
    id: string,
    revision: number,
    orderId: string,
    paid: boolean,
  ) {
    return (await this.atomic((tx) =>
      this.order(tx, shop, { id, revision, orderId, paid }),
    ))!;
  }
  private async invalidate(
    tx: UnitOfWork,
    shop: string,
    id: string,
    orderId: string,
  ) {
    const record = await tx.get<Design>("design", shop, id);
    if (!record || record.orderId !== orderId) return;
    record.payment = "pending";
    record.status = "changes_requested";
    record.approvedRevision = null;
    record.note =
      "El pedido cambió y ya no coincide con el diseño firmado. Detener fabricación y revisar en Shopify.";
    await this.persist(tx, record);
    await this.audit(
      tx,
      shop,
      id,
      "Shopify",
      "order_mismatch",
      record.revision,
      orderId,
    );
  }
  async invalidateOrder(shop: string, id: string, orderId: string) {
    await this.atomic((tx) => this.invalidate(tx, shop, id, orderId));
  }
  async attachQuote(
    shop: string,
    id: string,
    quoteId: string,
    invoiceUrl: string,
  ) {
    return (await this.atomic(async (tx) => {
      const record = await tx.get<Design>("design", shop, id);
      if (!record) throw new Error("Diseño no encontrado.");
      record.quoteId = quoteId;
      record.invoiceUrl = invoiceUrl;
      await this.persist(tx, record);
      return record;
    }))!;
  }
  async storeSession(session: StoredSession) {
    await this.atomic(async (tx) => {
      await tx.set("session", session.shop, session.id, session);
    });
  }
  async loadSession(shop: string, id: string) {
    return (
      (await this.driver.get<StoredSession>({ kind: "session", shop, id }))
        ?.data ?? null
    );
  }
  async findSessions(shop: string) {
    return (await this.driver.list<StoredSession>("session", shop)).map(
      (row) => row.data,
    );
  }
  async deleteSessions(shop: string, ids?: string[]) {
    await this.atomic(async (tx) => {
      const sessions = await tx.list<StoredSession>("session", shop);
      for (const session of sessions)
        if (!ids || ids.includes(session.id))
          await tx.delete("session", shop, session.id);
    });
  }
  async hasSession(shop: string) {
    return (await this.findSessions(shop)).length > 0;
  }
  async processWebhook(
    shop: string,
    eventId: string,
    orderId: string,
    updates: OrderUpdate[],
    uninstalled = false,
  ) {
    return (
      (await this.atomic(
        async (tx) => {
          if (uninstalled) {
            for (const session of await tx.list<StoredSession>("session", shop))
              await tx.delete("session", shop, session.id);
          }
          if (orderId) {
            const valid = new Set<string>();
            for (const update of updates)
              if (await this.order(tx, shop, update)) valid.add(update.id);
            for (const record of await tx.list<Design>("design", shop))
              if (record.orderId === orderId && !valid.has(record.id))
                await this.invalidate(tx, shop, record.id, orderId);
          }
          return true;
        },
        { shop, id: eventId },
      )) !== null
    );
  }
}

declare global {
  var souvenirRepository: Repository | undefined;
}
export function createRepository(
  env: Record<string, string | undefined> = process.env,
) {
  const provider =
    env.STORAGE_PROVIDER ||
    (env.NODE_ENV === "production" || env.SUPABASE_URL ? "supabase" : "sqlite");
  if (provider === "supabase")
    return new Repository(
      new SupabaseStorage(
        env.SUPABASE_URL || "",
        env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "",
        env.SUPABASE_STORAGE_BUCKET || "souvenir-assets",
      ),
    );
  if (provider !== "sqlite" || env.NODE_ENV === "production")
    throw new Error(
      "En producción configura STORAGE_PROVIDER=supabase y sus credenciales. No se permite guardar datos en el disco temporal.",
    );
  return new Repository(env.DATABASE_PATH || "./data/souvenir.sqlite");
}
export function getRepository() {
  return (globalThis.souvenirRepository ??= createRepository());
}
