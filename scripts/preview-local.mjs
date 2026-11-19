import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const position = process.argv.indexOf("--port");
const port = position >= 0 ? Number(process.argv[position + 1]) : 3000;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Puerto local no válido.");
const server = join(
  dirname(require.resolve("@react-router/serve/package.json")),
  "bin.js",
);
// Explicitly local pilot. Production uses npm start and never this launcher.
const child = spawn(process.execPath, [server, "./build/server/index.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    LOCAL_DEMO: "true",
    STORAGE_PROVIDER: "sqlite",
    HOST: "127.0.0.1",
    PORT: String(port),
  },
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
