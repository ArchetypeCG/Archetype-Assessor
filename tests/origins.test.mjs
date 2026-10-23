import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationOrigins } from "../server/origins.mjs";
test("both the configured custom domain and Render service URL work through a proxy, without accepting unrelated domains", () => {
  const policy = applicationOrigins({
    NODE_ENV: "production",
    APP_ORIGIN: " https://portfolio.example.org/ ",
    RENDER_EXTERNAL_URL: "https://archetype-example.onrender.com",
  });
  assert.equal(policy.primary, "https://portfolio.example.org");
  for (const origin of [
    "https://portfolio.example.org",
    "https://archetype-example.onrender.com",
  ])
    assert.equal(policy.allows(origin, "internal-proxy:10000"), true);
  for (const origin of [
    "https://www.portfolio.example.org",
    "https://portfolio.example.org.evil.test",
    "http://portfolio.example.org",
    "https://portfolio.example.org:8443",
    "null",
    "https://portfolio.example.org/path",
    "https://name:secret@portfolio.example.org",
  ])
    assert.equal(policy.allows(origin, "portfolio.example.org"), false);
  assert.equal(
    policy.allows("https://unrelated.example", "unrelated.example"),
    false,
  );
  assert.equal(
    policy.allows("https://unrelated.example", "portfolio.example.org"),
    false,
  );
});
test("additional aliases require an explicit allowlist; copied full URLs produce canonical links", () => {
  const policy = applicationOrigins({
    APP_ORIGIN: "https://portfolio.example.org/login",
    RENDER_EXTERNAL_URL: "https://archetype-example.onrender.com/",
    ADDITIONAL_APP_ORIGINS:
      "https://www.example.org, https://training.example.org",
  });
  assert.equal(policy.primary, "https://portfolio.example.org");
  assert(policy.allows("https://www.example.org", "internal"));
  assert(policy.allows("https://training.example.org", "internal"));
  assert(!policy.allows("https://other.example.org", "internal"));
  assert.throws(
    () => applicationOrigins({ ADDITIONAL_APP_ORIGINS: "*" }),
    /ADDITIONAL_APP_ORIGINS/,
  );
  assert.throws(
    () =>
      applicationOrigins({
        NODE_ENV: "production",
        APP_ORIGIN: "http://example.org",
      }),
    /HTTPS/,
  );
  assert.throws(
    () => applicationOrigins({ APP_ORIGIN: "https://user:secret@example.org" }),
    /APP_ORIGIN/,
  );
});
test("local development preserves same-host validation and rejected requests explain which public address needs configuration", () => {
  const policy = applicationOrigins({});
  assert(policy.allows("http://localhost:5173", "localhost:5173"));
  assert(!policy.allows("http://localhost:5174", "localhost:5173"));
  assert.match(policy.rejection("https://training.example.org"), /APP_ORIGIN/);
  assert.match(
    policy.rejection("https://training.example.org"),
    /https:\/\/training.example.org/,
  );
  assert.equal(policy.rejection("null"), "Invalid request origin.");
});

test("HTTP login accepts both explicit public origins through the proxy and refuses unrelated origins", async () => {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { setTimeout: pause } = await import("node:timers/promises");
  const dir = await mkdtemp("/tmp/archetype-origin-check-"),
    port = 32000 + Math.floor(Math.random() * 20000),
    base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATA_DIR: dir,
      DEMO_MODE: "1",
      COOKIE_SECURE: "0",
      APP_ORIGIN: "https://portfolio.example.org",
      RENDER_EXTERNAL_URL: "https://archetype-example.onrender.com",
      ADDITIONAL_APP_ORIGINS: "",
      MORNING_DIGEST_ENABLED: "0",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const finished = new Promise((resolve) => child.once("exit", resolve));
  let logs = "";
  child.stdout.on("data", (x) => (logs += x));
  child.stderr.on("data", (x) => (logs += x));
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw Error(logs);
      try {
        if ((await fetch(base + "/api/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await pause(100);
    }
    assert(ready, "API must become ready.");
    for (const origin of [
      "https://portfolio.example.org",
      "https://archetype-example.onrender.com",
    ]) {
      const r = await fetch(base + "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          email: "manager@archetype.demo",
          password: "ArchetypeDemo2026!",
        }),
      });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).user.role, "Manager");
    }
    const rejected = await fetch(base + "/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://unrelated.example",
      },
      body: "{}",
    });
    assert.equal(rejected.status, 403);
    assert.match((await rejected.json()).error, /APP_ORIGIN/);
  } finally {
    child.kill("SIGTERM");
    await finished;
    await rm(dir, { recursive: true, force: true });
  }
});
