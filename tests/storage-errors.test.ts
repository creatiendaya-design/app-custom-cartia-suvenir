import { describe, expect, it } from "vitest";
import { SupabaseStorage } from "../app/lib/storage-supabase.server";
import { createClient } from "@supabase/supabase-js";
import { getAppUrl } from "../app/lib/app-url.server";
import { Repository } from "../app/lib/repository.server";
import { SqliteStorage } from "../app/lib/storage-sqlite.server";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("storage failure boundaries", () => {
  it("rejects public keys and preserves server-only error messages", async () => {
    expect(
      () => new SupabaseStorage("http://project.supabase.co", "sb_secret_fake"),
    ).toThrow();
    expect(
      () =>
        new SupabaseStorage(
          "https://project.supabase.co",
          "sb_publishable_fake",
        ),
    ).toThrow(/Secret/);
    const client = createClient(
      "https://project.supabase.co",
      "sb_secret_fake",
      {
        auth: { persistSession: false },
        global: {
          fetch: async () =>
            Response.json(
              { message: "private internal detail", error: "denied" },
              { status: 403 },
            ),
        },
      },
    );
    const driver = new SupabaseStorage(
      "https://project.supabase.co",
      "sb_secret_fake",
      "souvenir-assets",
      client,
    );
    const key = { kind: "product" as const, shop: "test", id: "p" };
    for (const operation of [
      () => driver.get(key),
      () => driver.list("product", "test"),
      () => driver.commit([]),
      () => driver.putBlob("test", "id", new Uint8Array([1])),
      () => driver.getBlob("test", "id"),
      () => driver.deleteBlob("test", "id"),
    ]) {
      await expect(operation()).rejects.toThrow(/Supabase/);
      await expect(operation()).rejects.not.toThrow(/private internal/);
    }
    driver.close();
  });
  it("uses the Render public URL and normalizes configured origins", () => {
    expect(
      getAppUrl({ RENDER_EXTERNAL_URL: "https://example.onrender.com" }),
    ).toBe("https://example.onrender.com");
    expect(
      getAppUrl({
        SHOPIFY_APP_URL: "https://custom.example/app",
        RENDER_EXTERNAL_URL: "https://example.onrender.com",
      }),
    ).toBe("https://custom.example");
    expect(getAppUrl({})).toBe("");
    expect(() =>
      getAppUrl({
        NODE_ENV: "production",
        SHOPIFY_APP_URL: "http://example.com",
      }),
    ).toThrow(/HTTPS/);
    expect(getAppUrl({ SHOPIFY_APP_URL: "http://127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000",
    );
  });
  it("rolls back asset metadata and removes an uncommitted image on quota failure", async () => {
    const driver = new SqliteStorage(":memory:"),
      repo = new Repository(driver);
    await driver.commit([
      {
        kind: "quota",
        shop: "demo",
        id: "asset-bytes",
        expectedVersion: null,
        operation: "set",
        data: { bytes: 256_000_000 },
      },
    ]);
    await expect(
      repo.putAsset({
        id: "rejected",
        shop: "demo",
        owner: "owner",
        name: "a.png",
        width: 1,
        height: 1,
        data: "data:image/png;base64,AQID",
      }),
    ).rejects.toThrow(/límite/);
    expect(await repo.getAsset("demo", "rejected")).toBeNull();
    await expect(driver.getBlob("demo", "rejected")).rejects.toThrow();
    repo.close();
  });
  it("imports legacy local data once and keeps local files recoverable", async () => {
    const directory = mkdtempSync(join(tmpdir(), "souvenir-migration-")),
      path = join(directory, "pilot.sqlite");
    try {
      const old = new DatabaseSync(path);
      old.exec(
        "create table products(shop text,id text,json text);create table sessions(id text,shop text,json text);create table assets(id text,shop text,owner text,json text);",
      );
      const initial = new Repository(":memory:");
      await initial.seed("demo");
      old
        .prepare("insert into products values(?,?,?)")
        .run(
          "demo",
          "cap-patch",
          JSON.stringify(await initial.getProduct("demo", "cap-patch")),
        );
      initial.close();
      old
        .prepare("insert into sessions values(?,?,?)")
        .run("offline_demo", "demo", JSON.stringify([["shop", "demo"]]));
      old
        .prepare("insert into assets values(?,?,?,?)")
        .run(
          "old-image",
          "demo",
          "owner",
          JSON.stringify({
            id: "old-image",
            shop: "demo",
            owner: "owner",
            name: "logo",
            width: 1,
            height: 1,
            data: "data:image/png;base64,AQID",
          }),
        );
      old.close();
      const first = new Repository(path);
      expect((await first.getProduct("demo", "cap-patch"))?.name).toBe(
        "Gorra con parche",
      );
      expect(
        (await first.loadSession("demo", "offline_demo"))?.properties,
      ).toEqual([["shop", "demo"]]);
      expect((await first.getAsset("demo", "old-image"))?.data).toBe(
        "data:image/png;base64,AQID",
      );
      first.close();
      const restarted = new Repository(path);
      expect(await restarted.listProducts("demo")).toHaveLength(1);
      restarted.close();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        const file = path + suffix;
        if (existsSync(file)) unlinkSync(file);
      }
      rmdirSync(directory);
    }
  });
});
