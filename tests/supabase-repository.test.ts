import { createClient } from "@supabase/supabase-js";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Repository, createRepository } from "../app/lib/repository.server";
import { SupabaseStorage } from "../app/lib/storage-supabase.server";
import { defaultDocument } from "../app/lib/domain";

let db: PGlite;
const blobs = new Map<string, Uint8Array>();
const requests: { path: string; method: string; body?: unknown }[] = [];
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    readFileSync("supabase/migrations/202611190001_storage.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

// Execute the real schema through the real Supabase SDK. Only the HTTP boundary
// is local: no production credentials, external writes or fake successful commits.
const transport: typeof fetch = async (input, init) => {
  const request = new Request(input, init),
    url = new URL(request.url),
    method = request.method;
  const log: { path: string; method: string; body?: unknown } = {
    path: url.pathname,
    method,
  };
  requests.push(log);
  if (url.pathname === "/rest/v1/rpc/sm_commit") {
    const body = await request.json();
    log.body = body;
    const result = await db.query<{ result: string }>(
      "select public.sm_commit($1::jsonb,$2::jsonb) result",
      [
        JSON.stringify(body.p_changes),
        body.p_event ? JSON.stringify(body.p_event) : null,
      ],
    );
    return Response.json(result.rows[0].result);
  }
  if (url.pathname === "/rest/v1/sm_records") {
    const params: unknown[] = [
      url.searchParams.get("kind")?.slice(3),
      url.searchParams.get("shop")?.slice(3),
    ];
    let sql = "select * from public.sm_records where kind=$1 and shop=$2";
    if (url.searchParams.has("id")) {
      params.push(url.searchParams.get("id")!.slice(3));
      sql += " and id=$3";
    }
    sql += " order by id";
    const result = await db.query(sql, params);
    return Response.json(result.rows);
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const key = url.pathname
      .replace("/storage/v1/object/", "")
      .replace(/^authenticated\//, "");
    if (method === "POST") {
      if (blobs.has(key))
        return Response.json({ error: "Duplicate" }, { status: 400 });
      blobs.set(key, new Uint8Array(await request.arrayBuffer()));
      return Response.json({ Key: key });
    }
    if (method === "DELETE") {
      const { prefixes } = await request.json();
      prefixes.forEach((prefix: string) => blobs.delete(`${key}/${prefix}`));
      return Response.json([]);
    }
    const data = blobs.get(key);
    return data
      ? new Response(data as unknown as BodyInit, {
          headers: { "Content-Type": "image/png" },
        })
      : Response.json({ error: "Missing" }, { status: 404 });
  }
  return Response.json({ error: "Unexpected route" }, { status: 500 });
};
function repository() {
  const client = createClient(
    "https://test.supabase.co",
    "sb_secret_test_server_only",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: transport },
    },
  );
  return new Repository(
    new SupabaseStorage(
      "https://test.supabase.co",
      "sb_secret_test_server_only",
      "souvenir-assets",
      client,
    ),
  );
}
describe("Supabase persistence across server instances", () => {
  it("restores designs, images and Shopify sessions after the server is replaced", async () => {
    const first = repository();
    await first.seed("demo");
    const product = (await first.getProduct("demo", "cap-patch"))!,
      document = defaultDocument(product);
    await first.putAsset({
      id: "test-logo",
      shop: "demo",
      owner: "customer",
      name: "logo.png",
      width: 400,
      height: 400,
      data: "data:image/png;base64,AQIDBA==",
    });
    const design = await first.saveDesign("demo", "customer", document);
    await first.storeSession({
      id: "offline_demo",
      shop: "demo",
      properties: [
        ["id", "offline_demo"],
        ["shop", "demo"],
      ],
    });
    first.close();
    const restarted = repository();
    expect(
      (await restarted.getOwnedDesign("demo", "customer", design.id))?.revision,
    ).toBe(1);
    expect(
      (await restarted.getRevision("demo", design.id, 1))?.document,
    ).toEqual(document);
    expect((await restarted.getAsset("demo", "test-logo"))?.data).toBe(
      "data:image/png;base64,AQIDBA==",
    );
    expect(await restarted.hasSession("demo")).toBe(true);
    expect(
      (await restarted.loadSession("demo", "offline_demo"))?.properties,
    ).toContainEqual(["shop", "demo"]);
    expect(
      await restarted.getOwnedDesign("demo", "other", design.id),
    ).toBeNull();
    expect(await restarted.getAsset("other-shop", "test-logo")).toBeNull();
    const assetRow = await db.query<{ data: Record<string, unknown> }>(
      "select data from public.sm_records where kind='asset' and id='test-logo'",
    );
    expect(assetRow.rows[0].data).not.toHaveProperty("data");
    expect(requests.some((r) => r.path.includes("/storage/v1/object/"))).toBe(
      true,
    );
  });
  it("prevents two competing saves from creating the same revision", async () => {
    const a = repository(),
      b = repository(),
      doc = defaultDocument((await a.getProduct("demo", "cap-patch"))!);
    const original = await a.saveDesign("demo", "concurrent", doc);
    const results = await Promise.allSettled([
      a.saveDesign(
        "demo",
        "concurrent",
        { ...doc, quantity: 2 },
        original.id,
        1,
      ),
      b.saveDesign(
        "demo",
        "concurrent",
        { ...doc, quantity: 3 },
        original.id,
        1,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await a.getDesign("demo", original.id))?.revision).toBe(2);
    expect(
      (await a.getRevision("demo", original.id, 1))?.document.quantity,
    ).toBe(1);
  });
  it("commits a payment event and its audit exactly once and persists uninstall", async () => {
    const repo = repository(),
      doc = defaultDocument((await repo.getProduct("demo", "cap-patch"))!);
    const design = await repo.saveDesign("demo", "payer", doc),
      update = { id: design.id, revision: 1, orderId: "order-1", paid: true };
    expect(
      await repo.processWebhook("demo", "payment-event", "order-1", [update]),
    ).toBe(true);
    expect(
      await repo.processWebhook("demo", "payment-event", "order-1", [update]),
    ).toBe(false);
    expect(
      (await repo.history("demo", design.id)).filter(
        (e) => e.action === "payment_confirmed",
      ),
    ).toHaveLength(1);
    await repo.processWebhook("demo", "changed-order", "order-1", []);
    expect((await repo.getDesign("demo", design.id))?.payment).toBe("pending");
    await repo.processWebhook("demo", "uninstalled", "", [], true);
    expect(await repository().hasSession("demo")).toBe(false);
  });
  it("fails closed instead of using ephemeral SQLite in production", () => {
    expect(() => createRepository({ NODE_ENV: "production" })).toThrow(
      /SUPABASE/,
    );
    expect(() =>
      createRepository({ NODE_ENV: "production", STORAGE_PROVIDER: "sqlite" }),
    ).toThrow(/temporal/);
    expect(() => createRepository({ STORAGE_PROVIDER: "unknown" })).toThrow();
  });
  it("persists multi-product assignments and serializes competing activations in PostgreSQL", async () => {
    const a = repository(),
      b = repository(),
      shop = "assignment-store";
    const first = await a.createPersonalizer(shop, "cap-patch", "Empresas"),
      second = await b.createPersonalizer(shop, "cap-patch", "Eventos");
    const assigned = [
      {
        productId: "gid://shopify/Product/701",
        title: "Gorra",
        handle: "gorra",
        image: "",
        status: "ACTIVE" as const,
        variants: [{ id: "7011", title: "Única", price: "10.00" }],
      },
      {
        productId: "gid://shopify/Product/702",
        title: "Otra gorra",
        handle: "otra",
        image: "",
        status: "ACTIVE" as const,
        variants: [{ id: "7021", title: "Única", price: "12.00" }],
      },
    ];
    const one = await a.assignProducts(shop, first.id, assigned),
      two = await b.assignProducts(shop, second.id, assigned);
    const result = await Promise.allSettled([
      a.updateProduct(shop, { ...one, enabled: true }),
      b.updateProduct(shop, { ...two, enabled: true }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await repository().getProduct(shop, first.id))?.assignments,
    ).toHaveLength(2);
    expect(
      (await repository().findPersonalizer(shop, "7021", "702"))?.variantId,
    ).toBe("7021");
  });
});
