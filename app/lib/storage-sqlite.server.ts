import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  RecordChange,
  RecordKey,
  RecordKind,
  StorageDriver,
  StoredRecord,
} from "./storage-types";

export class SqliteStorage implements StorageDriver {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sm_records(kind TEXT,shop TEXT,id TEXT,version INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(kind,shop,id));
      CREATE TABLE IF NOT EXISTS sm_blobs(shop TEXT,id TEXT,data BLOB NOT NULL,PRIMARY KEY(shop,id));`);
    this.importLegacy();
  }
  private importLegacy() {
    if (
      !this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='products'",
        )
        .get()
    )
      return;
    if (
      this.db
        .prepare(
          "SELECT id FROM sm_records WHERE kind='quota' AND shop='__system__' AND id='legacy-import'",
        )
        .get()
    )
      return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO sm_records VALUES(?,?,?,?,?,?)",
      );
      const tables = [
        "products",
        "designs",
        "revisions",
        "assets",
        "audit",
        "sessions",
        "events",
      ] as const;
      for (const table of tables) {
        if (
          !this.db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table)
        )
          continue;
        const rows = this.db.prepare(`SELECT * FROM ${table}`).all() as Record<
          string,
          string | number
        >[];
        for (const row of rows) {
          const kind = (
            {
              products: "product",
              designs: "design",
              revisions: "revision",
              assets: "asset",
              audit: "audit",
              sessions: "session",
              events: "event",
            } as const
          )[table as (typeof tables)[number]];
          let data: Record<string, unknown> = row.json
            ? JSON.parse(String(row.json))
            : table === "audit"
              ? { ...row }
              : {};
          const shop = String(row.shop),
            id =
              table === "revisions"
                ? `${row.id}:${row.revision}`
                : String(row.id);
          if (table === "sessions") data = { id, shop, properties: data };
          if (table === "assets") {
            this.db
              .prepare("INSERT OR IGNORE INTO sm_blobs VALUES(?,?,?)")
              .run(
                shop,
                id,
                Buffer.from(String(data.data).split(",")[1], "base64"),
              );
            const { data: binary, ...metadata } = data;
            data = {
              ...metadata,
              bytes: Buffer.from(String(binary).split(",")[1], "base64").length,
            };
          }
          insert.run(
            kind,
            shop,
            id,
            1,
            JSON.stringify(data),
            String(
              data.createdAt || data.updatedAt || new Date().toISOString(),
            ),
          );
        }
      }
      insert.run(
        "quota",
        "__system__",
        "legacy-import",
        1,
        "{}",
        new Date().toISOString(),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async get<T>(key: RecordKey): Promise<StoredRecord<T> | null> {
    const row = this.db
      .prepare("SELECT * FROM sm_records WHERE kind=? AND shop=? AND id=?")
      .get(key.kind, key.shop, key.id) as
      | { version: number; data: string; created_at: string }
      | undefined;
    return row
      ? {
          ...key,
          version: row.version,
          data: JSON.parse(row.data) as T,
          createdAt: row.created_at,
        }
      : null;
  }
  async list<T>(kind: RecordKind, shop: string): Promise<StoredRecord<T>[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM sm_records WHERE kind=? AND shop=? ORDER BY created_at DESC,id",
      )
      .all(kind, shop) as Array<{
      id: string;
      version: number;
      data: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      kind,
      shop,
      id: row.id,
      version: row.version,
      data: JSON.parse(row.data) as T,
      createdAt: row.created_at,
    }));
  }
  async commit(changes: RecordChange[], event?: { shop: string; id: string }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (event) {
        const result = this.db
          .prepare(
            "INSERT OR IGNORE INTO sm_records VALUES('event',?,?,1,'{}',?)",
          )
          .run(event.shop, event.id, new Date().toISOString());
        if (!result.changes) {
          this.db.exec("ROLLBACK");
          return "duplicate" as const;
        }
      }
      for (const change of changes) {
        const previous = this.db
          .prepare(
            "SELECT version FROM sm_records WHERE kind=? AND shop=? AND id=?",
          )
          .get(change.kind, change.shop, change.id) as
          | { version: number }
          | undefined;
        if ((previous?.version ?? null) !== change.expectedVersion) {
          this.db.exec("ROLLBACK");
          return "conflict" as const;
        }
        if (
          change.kind === "revision" &&
          previous &&
          change.operation !== "check"
        )
          throw new Error("Revisions are immutable");
      }
      for (const change of changes) {
        if (change.operation === "delete")
          this.db
            .prepare("DELETE FROM sm_records WHERE kind=? AND shop=? AND id=?")
            .run(change.kind, change.shop, change.id);
        if (change.operation === "set")
          this.db
            .prepare(
              "INSERT INTO sm_records VALUES(?,?,?,?,?,?) ON CONFLICT(kind,shop,id) DO UPDATE SET version=version+1,data=excluded.data",
            )
            .run(
              change.kind,
              change.shop,
              change.id,
              1,
              JSON.stringify(change.data),
              new Date().toISOString(),
            );
      }
      this.db.exec("COMMIT");
      return "committed" as const;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async putBlob(shop: string, id: string, data: Uint8Array) {
    this.db.prepare("INSERT INTO sm_blobs VALUES(?,?,?)").run(shop, id, data);
  }
  async getBlob(shop: string, id: string) {
    const row = this.db
      .prepare("SELECT data FROM sm_blobs WHERE shop=? AND id=?")
      .get(shop, id) as { data: Uint8Array } | undefined;
    if (!row) throw new Error("No se encontró la imagen original.");
    return row.data;
  }
  async deleteBlob(shop: string, id: string) {
    this.db.prepare("DELETE FROM sm_blobs WHERE shop=? AND id=?").run(shop, id);
  }
  close() {
    this.db.close();
  }
}
