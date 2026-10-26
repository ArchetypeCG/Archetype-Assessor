import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
test("Microsoft callback browser binding works independently of Strict sign-in cookies without changing the active account", async () => {
  const dir = await mkdtemp("/tmp/archetype-outlook-http-"),
    port = 42000 + Math.floor(Math.random() * 10000),
    base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      DEMO_MODE: "1",
      NODE_ENV: "test",
      APP_ORIGIN: base,
      OUTLOOK_CLIENT_ID: "test-client",
      OUTLOOK_CLIENT_SECRET: "test-secret-not-real",
      BACKUP_ENCRYPTION_KEY: "test-only-encryption-key-for-outlook-http",
      INTEGRITY_ENABLED: "0",
      MORNING_DIGEST_ENABLED: "0",
      COOKIE_SECURE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (d) => (logs += d));
  try {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw Error(logs);
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      await pause(100);
    }
    const tab = "a".repeat(32),
      headers = { "Content-Type": "application/json", "X-Archetype-Tab": tab };
    const login = await fetch(base + "/api/login", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "assessor@archetype.demo",
        password: "ArchetypeDemo2026!",
      }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const start = await fetch(base + "/api/outlook/connect", {
      method: "POST",
      headers: { ...headers, cookie, origin: base },
      body: "{}",
    });
    assert.equal(start.status, 200);
    const oauthCookie = start.headers.get("set-cookie");
    assert.match(oauthCookie, /HttpOnly/);
    assert.match(oauthCookie, /SameSite=Lax/);
    assert.match(oauthCookie, /Path=\/api\/outlook\/callback/);
    const result = await start.json(),
      auth = new URL(result.url);
    assert.equal(
      auth.searchParams.get("redirect_uri"),
      base + "/api/outlook/callback",
    );
    assert(!JSON.stringify(result).includes("test-secret-not-real"));
    const callback =
      base +
      "/api/outlook/callback?" +
      new URLSearchParams({
        state: auth.searchParams.get("state"),
        error: "access_denied",
      });
    const denied = await fetch(callback, {
      headers: { cookie: oauthCookie.split(";")[0] },
    });
    assert.equal(denied.status, 400);
    assert.match(await denied.text(), /was cancelled/);
    assert.match(denied.headers.get("set-cookie"), /Max-Age=0/);
    const replay = await fetch(callback, {
      headers: { cookie: oauthCookie.split(";")[0] },
    });
    assert.match(await replay.text(), /invalid or expired/);
    const state = await (
      await fetch(base + "/api/state", { headers: { ...headers, cookie } })
    ).json();
    assert.equal(state.user.role, "Assessor");
    assert.equal(state.user.id, "assessor");
    const foreign = await fetch(base + "/api/outlook/connect", {
      method: "POST",
      headers: { ...headers, cookie, origin: "https://foreign.example.test" },
      body: "{}",
    });
    assert.equal(foreign.status, 403);
    const managerLogin = await fetch(base + "/api/login", {
      method: "POST",
      headers: { ...headers, "X-Archetype-Tab": "b".repeat(32) },
      body: JSON.stringify({
        email: "manager@archetype.demo",
        password: "ArchetypeDemo2026!",
      }),
    });
    const managerCookie = managerLogin.headers.get("set-cookie").split(";")[0];
    const adminHeaders = {
      ...headers,
      "X-Archetype-Tab": "b".repeat(32),
      cookie: managerCookie,
    };
    const db = new DatabaseSync(dir + "/archetype.sqlite");
    try {
      db.prepare(
        "INSERT INTO outlook_connections(user_id,generation,role,account_id,address,display_name,token,expires) VALUES('assessor','test-generation','Assessor','test-account','work@example.test','Work','fake-encrypted-token',9999999999999)",
      ).run();
      let workspace = (
        await (
          await fetch(base + "/api/state", { headers: adminHeaders })
        ).json()
      ).state;
      const assessor = workspace.users.find((u) => u.id === "assessor");
      const update = await fetch(base + "/api/command", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          kind: "user.update",
          payload: {
            id: assessor.id,
            name: assessor.name,
            email: assessor.email,
            role: assessor.role,
            caseload: [],
          },
          revision: workspace.revision,
        }),
      });
      assert.equal(update.status, 200);
      assert.equal(
        db.prepare("SELECT COUNT(*) n FROM outlook_connections").get().n,
        1,
      );
      assert.equal(
        (await fetch(base + "/api/state", { headers: { ...headers, cookie } }))
          .status,
        200,
      );
      workspace = (await update.json()).state;
      const disabled = await fetch(base + "/api/command", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          kind: "user.setActive",
          payload: { id: "assessor", active: false },
          revision: workspace.revision,
        }),
      });
      assert.equal(disabled.status, 200);
      assert.equal(
        db.prepare("SELECT COUNT(*) n FROM outlook_connections").get().n,
        0,
      );
      assert.equal(
        (await fetch(base + "/api/state", { headers: { ...headers, cookie } }))
          .status,
        401,
      );
    } finally {
      db.close();
    }
  } finally {
    child.kill();
    if (child.exitCode === null)
      await new Promise((r) => child.once("exit", r));
    await rm(dir, { recursive: true, force: true });
  }
});
