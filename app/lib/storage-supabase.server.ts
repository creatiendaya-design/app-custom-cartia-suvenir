import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type {
  RecordChange,
  RecordKey,
  RecordKind,
  StorageDriver,
  StoredRecord,
} from "./storage-types";

export class SupabaseStorage implements StorageDriver {
  readonly client: SupabaseClient;
  readonly bucket: string;
  constructor(
    url: string,
    secret: string,
    bucket = "souvenir-assets",
    client?: SupabaseClient,
  ) {
    if (!url.startsWith("https://") || !secret)
      throw new Error(
        "Configura SUPABASE_URL y SUPABASE_SECRET_KEY en el servidor.",
      );
    if (!secret.startsWith("sb_secret_")) {
      let role = "";
      try {
        role = JSON.parse(
          Buffer.from(secret.split(".")[1], "base64url").toString(),
        ).role;
      } catch {}
      if (role !== "service_role")
        throw new Error(
          "Usa una Secret key de Supabase (sb_secret_), no una clave pública.",
        );
    }
    this.client =
      client ??
      createClient(url, secret, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: init?.signal ?? AbortSignal.timeout(15000),
            }),
        },
      });
    this.bucket = bucket;
  }
  private row<T>(row: {
    kind: RecordKind;
    shop: string;
    id: string;
    version: number;
    data: T;
    created_at: string;
  }): StoredRecord<T> {
    return { ...row, createdAt: row.created_at };
  }
  private failure(operation: string): never {
    throw new Error(
      `No se pudo ${operation} en Supabase. Comprueba la conexión, las credenciales del servidor y la migración SQL.`,
    );
  }
  async get<T>(key: RecordKey): Promise<StoredRecord<T> | null> {
    const { data, error } = await this.client
      .from("sm_records")
      .select("*")
      .eq("kind", key.kind)
      .eq("shop", key.shop)
      .eq("id", key.id)
      .maybeSingle();
    if (error) this.failure("leer el registro");
    return data ? this.row<T>(data) : null;
  }
  async list<T>(kind: RecordKind, shop: string): Promise<StoredRecord<T>[]> {
    const rows: StoredRecord<T>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.client
        .from("sm_records")
        .select("*")
        .eq("kind", kind)
        .eq("shop", shop)
        .order("id")
        .range(offset, offset + 499);
      if (error) this.failure("consultar los registros");
      rows.push(...(data ?? []).map((row) => this.row<T>(row)));
      if (!data || data.length < 500) break;
    }
    return rows.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  }
  async commit(changes: RecordChange[], event?: { shop: string; id: string }) {
    const { data, error } = await this.client.rpc("sm_commit", {
      p_changes: changes,
      p_event: event ?? null,
    });
    if (error || !["committed", "conflict", "duplicate"].includes(data))
      this.failure("guardar la transacción");
    return data as "committed" | "conflict" | "duplicate";
  }
  private path(shop: string, id: string) {
    return `${createHash("sha256").update(shop).digest("hex")}/${createHash("sha256").update(id).digest("hex")}.png`;
  }
  async putBlob(shop: string, id: string, data: Uint8Array) {
    const result = await this.client.storage
      .from(this.bucket)
      .upload(this.path(shop, id), data, {
        contentType: "image/png",
        upsert: false,
      });
    if (result.error) this.failure("guardar la imagen");
  }
  async getBlob(shop: string, id: string) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(this.path(shop, id));
    if (error || !data) this.failure("descargar la imagen");
    return new Uint8Array(await data.arrayBuffer());
  }
  async deleteBlob(shop: string, id: string) {
    const result = await this.client.storage
      .from(this.bucket)
      .remove([this.path(shop, id)]);
    if (result.error) this.failure("retirar la imagen incompleta");
  }
  close() {}
}
