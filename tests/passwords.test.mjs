import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewPassword } from "../server/passwords.mjs";
test("new passwords retain every character, including leading/trailing spaces and Unicode", () => {
  for (const value of [
    "  My password 2026!  ",
    "é🙂 Strong password 42",
    "x".repeat(200),
  ])
    assert.equal(validateNewPassword(value), value);
  for (const value of [
    undefined,
    null,
    "short",
    " ".repeat(20),
    "x".repeat(201),
  ])
    assert.throws(() => validateNewPassword(value), /12–200/);
});

test("administrator and assessor passwords survive restart and changed bootstrap variables without trimming", async () => {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { randomBytes } = await import("node:crypto");
  const { setTimeout: pause } = await import("node:timers/promises");
  const dir = await mkdtemp("/tmp/archetype-password-persist-"),
    port = 32000 + Math.floor(Math.random() * 20000),
    base = `http://127.0.0.1:${port}`,
    key = randomBytes(32).toString("hex");
  const initial = "  Initial Owner Password 2026!  ",
    chosen = "  Chosen Owner Password 2026!  ",
    environmentChanged = "Different bootstrap secret 2026!",
    assessorInitial = "  Assessor Temporary 2026!  ",
    assessorChosen = "  Assessor Own Password 2026!  ";
  let child, finished, session;
  async function start(adminPassword) {
    child = spawn(process.execPath, ["server/index.mjs"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        DATA_DIR: dir,
        DEMO_MODE: "0",
        COOKIE_SECURE: "1",
        ADMIN_EMAIL: "owner@example.test",
        ADMIN_PASSWORD: adminPassword,
        BACKUP_ENCRYPTION_KEY: key,
        APP_ORIGIN: "https://portfolio.example.test",
        RENDER_EXTERNAL_URL: "",
        ADDITIONAL_APP_ORIGINS: "",
        RESEND_API_KEY: "",
        MAIL_FROM: "",
        MORNING_DIGEST_ENABLED: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    finished = new Promise((resolve) => child.once("exit", resolve));
    let logs = "";
    child.stdout.on("data", (x) => (logs += x));
    child.stderr.on("data", (x) => (logs += x));
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw Error(logs);
      try {
        if ((await fetch(base + "/api/health")).ok) return;
      } catch {}
      await pause(100);
    }
    throw Error("API did not start.");
  }
  async function stop() {
    if (child) {
      child.kill("SIGTERM");
      await finished;
      child = null;
    }
  }
  async function call(path, payload, cookie) {
    const r = await fetch(base + path, {
      method: payload ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function login(email, password) {
    return call("/api/login", { email, password });
  }
  async function command(kind, payload, cookie = session) {
    const current = await call("/api/state", null, cookie);
    return call(
      "/api/command",
      { kind, payload, revision: current.data.state.revision },
      cookie,
    );
  }
  try {
    await start(initial);
    let r = await login("owner@example.test", initial);
    assert.equal(r.status, 200);
    assert.equal(r.data.user.mustChangePassword, true);
    session = r.cookie;
    assert.equal(
      (await command("password.change", { current: initial, password: chosen }))
        .status,
      200,
    );
    assert.equal(
      (await login("owner@example.test", chosen.trim())).status,
      401,
    );
    r = await login("owner@example.test", chosen);
    assert.equal(r.status, 200);
    assert.equal(r.data.user.mustChangePassword, false);
    session = r.cookie;
    assert.equal(
      (
        await command("user.add", {
          name: "Assessor for persistence check",
          email: "assessor@example.test",
          role: "Assessor",
          password: assessorInitial,
        })
      ).status,
      200,
    );
    r = await login("assessor@example.test", assessorInitial);
    assert.equal(r.status, 200);
    assert.equal(
      (
        await command(
          "password.change",
          { current: assessorInitial, password: assessorChosen },
          r.cookie,
        )
      ).status,
      200,
    );
    const installed = (await call("/api/state", null, session)).data.state;
    assert.equal(installed.learners.filter((l) => l.fictional).length, 0);
    assert.equal(installed.standards.length, 3);
    const installedIds = installed.learners.map((l) => l.id);
    const marker = (
      await call("/api/state", null, session)
    ).data.state.users.find((u) => u.email === "assessor@example.test").id;
    await stop();
    await start(environmentChanged);
    r = await login("owner@example.test", chosen);
    assert.equal(r.status, 200);
    assert.equal(r.data.user.mustChangePassword, false);
    session = r.cookie;
    assert.equal((await login("owner@example.test", initial)).status, 401);
    assert.equal(
      (await login("owner@example.test", environmentChanged)).status,
      401,
    );
    assert.equal(
      (await login("assessor@example.test", assessorChosen)).status,
      200,
    );
    assert(
      (await call("/api/state", null, session)).data.state.users.some(
        (u) => u.id === marker,
      ),
    );
    const restarted = (await call("/api/state", null, session)).data.state;
    assert.deepEqual(
      restarted.learners.map((l) => l.id),
      installedIds,
    );
    assert.equal(restarted.standards.length, 3);
    const max = "x".repeat(200);
    assert.equal(
      (await command("password.change", { current: chosen, password: max }))
        .status,
      200,
    );
    assert.equal((await login("owner@example.test", max + "x")).status, 401);
    assert.equal((await login("owner@example.test", max)).status, 200);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
