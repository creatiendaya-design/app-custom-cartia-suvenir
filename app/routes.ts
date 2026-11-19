import { type RouteConfig, index, route } from "@react-router/dev/routes";
export default [
  index("routes/index.tsx"),
  route("app", "routes/dashboard.tsx"),
  route("studio/:productId", "routes/studio.tsx"),
  route("api/:intent", "routes/api.ts"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/*", "routes/auth.tsx"),
  route("webhooks", "routes/webhooks.ts"),
  route("health", "routes/health.ts"),
] satisfies RouteConfig;
