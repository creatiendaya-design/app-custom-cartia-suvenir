import "dotenv/config";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router",
      "lucide-react",
      "zod",
      "@shopify/shopify-app-react-router/react",
      "@shopify/shopify-app-react-router/server",
    ],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 3000),
    strictPort: true,
    allowedHosts: [
      new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname,
    ],
  },
  build: { assetsInlineLimit: 0 },
});
