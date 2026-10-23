import { defineConfig } from "vite";
import { developmentConfig } from "./scripts/development-config.mjs";
const development = developmentConfig();
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: development.allowedHosts,
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
