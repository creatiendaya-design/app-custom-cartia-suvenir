import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "app/lib/domain.ts",
        "app/lib/repository.server.ts",
        "app/lib/storage-sqlite.server.ts",
        "app/lib/storage-supabase.server.ts",
        "app/lib/unit-of-work.server.ts",
        "app/lib/app-url.server.ts",
        "app/lib/shopify-catalog.server.ts",
        "app/lib/export.server.ts",
        "app/lib/access.server.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
