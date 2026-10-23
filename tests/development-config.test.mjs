import { test } from "node:test";
import assert from "node:assert/strict";
import { developmentConfig } from "../scripts/development-config.mjs";
test("Codespaces permits only its own forwarded preview host and configures the matching HTTPS origin", () => {
  const config = developmentConfig({
    CODESPACE_NAME: "example-space-123",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
  });
  assert.deepEqual(config.allowedHosts, [
    "example-space-123-5173.app.github.dev",
  ]);
  assert.equal(config.origin, "https://example-space-123-5173.app.github.dev");
  assert.equal(config.secureCookies, "1");
  assert.equal(
    developmentConfig({
      CODESPACE_NAME: "example-space-123",
      APP_ORIGIN: "https://explicit.example",
    }).origin,
    "https://explicit.example",
  );
  assert.deepEqual(
    developmentConfig({
      CODESPACE_NAME: "bad.example",
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "*",
    }).allowedHosts,
    [],
  );
  assert.deepEqual(developmentConfig({}), {
    origin: undefined,
    allowedHosts: [],
    secureCookies: "0",
  });
});
