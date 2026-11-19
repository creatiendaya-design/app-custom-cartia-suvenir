import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    readFileSync("supabase/migrations/202611190001_storage.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

function change(
  id: string,
  data: unknown,
  expectedVersion: number | null = null,
) {
  return {
    kind: "design",
    shop: "test.myshopify.com",
    id,
    data,
    expectedVersion,
    operation: "set",
  };
}
async function commit(changes: unknown[], event: unknown = null) {
  const result = await db.query<{ result: string }>(
    "select public.sm_commit($1::jsonb,$2::jsonb) as result",
    [JSON.stringify(changes), event === null ? null : JSON.stringify(event)],
  );
  return result.rows[0].result;
}
describe("Supabase transactional schema", () => {
  it("saves several records atomically and rejects stale revisions", async () => {
    expect(await commit([change("a", { revision: 1 })])).toBe("committed");
    expect(await commit([change("a", { revision: 2 }, 1)])).toBe("committed");
    expect(
      await commit([
        change("uncommitted", {}),
        change("a", { revision: 3 }, 1),
      ]),
    ).toBe("conflict");
    expect(
      (await db.query("select * from public.sm_records where id='uncommitted'"))
        .rows,
    ).toHaveLength(0);
  });
  it("deduplicates delivery together with writes and rolls back failed claims", async () => {
    const event = { shop: "test.myshopify.com", id: "event-1" };
    expect(await commit([change("event-write", { ok: true })], event)).toBe(
      "committed",
    );
    expect(await commit([change("ignored", {})], event)).toBe("duplicate");
    expect(
      (await db.query("select * from public.sm_records where id='ignored'"))
        .rows,
    ).toHaveLength(0);
    const failedEvent = { ...event, id: "retry-event" };
    expect(await commit([change("a", {}, 99)], failedEvent)).toBe("conflict");
    expect(await commit([], failedEvent)).toBe("committed");
  });
  it("keeps revisions immutable and denies anonymous reads and RPC calls", async () => {
    expect(await commit([{ ...change("a:1", {}), kind: "revision" }])).toBe(
      "committed",
    );
    await expect(
      commit([{ ...change("a:1", {}, 1), kind: "revision" }]),
    ).rejects.toThrow();
    await db.exec("set role anon");
    await expect(db.query("select * from public.sm_records")).rejects.toThrow(
      /permission denied/,
    );
    await expect(commit([])).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    const result = await db.query<{ public: boolean }>(
      "select public from storage.buckets where id='souvenir-assets'",
    );
    expect(result.rows[0].public).toBe(false);
  });
});
