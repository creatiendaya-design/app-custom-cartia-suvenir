export type RecordKind =
  | "product"
  | "design"
  | "revision"
  | "asset"
  | "audit"
  | "session"
  | "event"
  | "quota";
export interface RecordKey {
  kind: RecordKind;
  shop: string;
  id: string;
}
export interface StoredRecord<T = unknown> extends RecordKey {
  version: number;
  data: T;
  createdAt: string;
}
export interface RecordChange extends RecordKey {
  operation: "set" | "delete" | "check";
  expectedVersion: number | null;
  data: unknown;
}
export interface StorageDriver {
  get<T>(key: RecordKey): Promise<StoredRecord<T> | null>;
  list<T>(kind: RecordKind, shop: string): Promise<StoredRecord<T>[]>;
  commit(
    changes: RecordChange[],
    event?: { shop: string; id: string },
  ): Promise<"committed" | "conflict" | "duplicate">;
  putBlob(shop: string, id: string, data: Uint8Array): Promise<void>;
  getBlob(shop: string, id: string): Promise<Uint8Array>;
  deleteBlob(shop: string, id: string): Promise<void>;
  close(): void;
}
