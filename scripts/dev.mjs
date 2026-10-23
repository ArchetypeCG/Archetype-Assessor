import { spawn } from "node:child_process";
import { developmentConfig } from "./development-config.mjs";
const config = developmentConfig();
const children = [
  spawn(process.execPath, ["--watch", "server/index.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: "3001",
      ...(config.origin ? { APP_ORIGIN: config.origin } : {}),
      COOKIE_SECURE: config.secureCookies,
      DEMO_MODE: process.env.DEMO_MODE ?? "1",
    },
  }),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "0.0.0.0",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300).unref();
}
children.forEach((c) => {
  c.on("error", () => stop(1));
  c.on("exit", (code) => stop(code ?? 1));
});
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
