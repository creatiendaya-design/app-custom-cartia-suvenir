import type {
  RecordChange,
  RecordKey,
  RecordKind,
  StorageDriver,
  StoredRecord,
} from "./storage-types";
const keyOf = (key: RecordKey) => JSON.stringify([key.kind, key.shop, key.id]);
export class UnitOfWork {
  private reads = new Map<string, StoredRecord | null>();
  private writes = new Map<string, RecordChange>();
  constructor(private driver: StorageDriver) {}
  async get<T>(kind: RecordKind, shop: string, id: string): Promise<T | null> {
    const key = { kind, shop, id },
      tag = keyOf(key),
      write = this.writes.get(tag);
    if (write)
      return write.operation === "delete"
        ? null
        : (structuredClone(write.data) as T);
    if (!this.reads.has(tag)) this.reads.set(tag, await this.driver.get(key));
    return structuredClone(this.reads.get(tag)?.data ?? null) as T | null;
  }
  async list<T>(kind: RecordKind, shop: string): Promise<T[]> {
    const rows = await this.driver.list<T>(kind, shop),
      result = new Map<string, T>();
    for (const row of rows) {
      const key = keyOf(row);
      if (!this.reads.has(key)) this.reads.set(key, row);
      result.set(row.id, structuredClone(row.data));
    }
    for (const write of this.writes.values())
      if (write.kind === kind && write.shop === shop) {
        if (write.operation === "delete") result.delete(write.id);
        else result.set(write.id, structuredClone(write.data) as T);
      }
    return [...result.values()];
  }
  async set(kind: RecordKind, shop: string, id: string, data: unknown) {
    const key = { kind, shop, id },
      tag = keyOf(key);
    if (!this.reads.has(tag)) await this.get(kind, shop, id);
    this.writes.set(tag, {
      ...key,
      expectedVersion: this.reads.get(tag)?.version ?? null,
      operation: "set",
      data: structuredClone(data),
    });
  }
  async delete(kind: RecordKind, shop: string, id: string) {
    const key = { kind, shop, id },
      tag = keyOf(key);
    if (!this.reads.has(tag)) await this.get(kind, shop, id);
    this.writes.set(tag, {
      ...key,
      expectedVersion: this.reads.get(tag)?.version ?? null,
      operation: "delete",
      data: null,
    });
  }
  changes(): RecordChange[] {
    const changes = new Map(this.writes);
    for (const [tag, row] of this.reads)
      if (!changes.has(tag)) {
        const [kind, shop, id] = JSON.parse(tag) as [
          RecordKind,
          string,
          string,
        ];
        changes.set(tag, {
          kind,
          shop,
          id,
          expectedVersion: row?.version ?? null,
          operation: "check",
          data: null,
        });
      }
    return [...changes.values()];
  }
}
