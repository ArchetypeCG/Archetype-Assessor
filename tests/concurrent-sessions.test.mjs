import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
let child, dir, base;
const jar = new Map();
const tab = () => randomBytes(16).toString("hex");
async function call(path, { tab: scope, payload, cookie } = {}) {
  const r = await fetch(base + path, {
    method: payload ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(scope ? { "X-Archetype-Tab": scope } : {}),
      cookie: cookie ?? [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) {
    const [name, value] = setCookie.split(";")[0].split("=");
    jar.set(name, value);
  }
  const content = await r.text();
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    data = content;
  }
  return {
    status: r.status,
    data,
    cookie: setCookie?.split(";")[0],
    setCookie,
  };
}
const login = (email, scope, password = "ArchetypeDemo2026!") =>
  call("/api/login", { tab: scope, payload: { email, password } });
before(async () => {
  dir = await mkdtemp("/tmp/archetype-concurrent-");
  const port = 24000 + Math.floor(Math.random() * 2000);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, DEMO_MODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (b) => (logs += b));
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await pause(100);
  }
  throw Error("Concurrent session API did not start");
});
after(async () => {
  child?.kill();
  if (child && child.exitCode === null)
    await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
});
test("accounts coexist in one cookie jar, scoped downloads enforce the selected role, and logout affects only its tab", async () => {
  const manager = tab(),
    apprentice = tab();
  const results = await Promise.all([
    login("manager@archetype.demo", manager),
    login("apprentice@archetype.demo", apprentice),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.match(results[0].setCookie, /HttpOnly/);
  assert.match(results[0].cookie, new RegExp(`^archetype_session_${manager}=`));
  const [a, b] = await Promise.all([
    call("/api/state", { tab: manager }),
    call("/api/state", { tab: apprentice }),
  ]);
  assert.equal(a.data.user.role, "Manager");
  assert.equal(b.data.user.role, "Apprentice");
  assert.equal(b.data.state.learners.length, 1);
  assert.equal((await call("/api/state", { tab: tab() })).status, 401);
  const foreign = a.data.state.learners.find(
    (l) => l.id !== b.data.state.learners[0].id,
  );
  const saved = await call("/api/command", {
    tab: manager,
    payload: {
      revision: a.data.state.revision,
      kind: "evidence.save",
      payload: {
        learnerId: foreign.id,
        title: "Scoped private attachment",
        status: "Draft",
        type: "Reflective account",
        date: "2026-10-23",
        description: "Synthetic file authorization check",
        criteria: [],
        files: [
          {
            name: "private.txt",
            base64: Buffer.from("private synthetic content").toString("base64"),
          },
        ],
      },
    },
  });
  assert.equal(saved.status, 200);
  const evidence = saved.data.state.evidence.find(
    (e) => e.title === "Scoped private attachment",
  );
  const file = evidence.files[0].id;
  assert.equal(
    (await call(`/api/files/${file}?session_tab=${manager}`)).status,
    200,
  );
  assert.equal(
    (await call(`/api/files/${file}?session_tab=${apprentice}`)).status,
    404,
  );
  assert.equal(
    (await call(`/api/files/${file}?session_tab=${manager}`, { cookie: "" }))
      .status,
    401,
  );
  assert.equal(
    (await call(`/api/calendar.ics?session_tab=${apprentice}`)).status,
    200,
  );
  assert.equal((await call("/api/state", { tab: "bad" })).status, 400);
  assert.equal(
    (await call("/api/logout", { tab: apprentice, payload: {} })).status,
    200,
  );
  assert.equal((await call("/api/state", { tab: apprentice })).status, 401);
  assert.equal((await call("/api/state", { tab: manager })).status, 200);
});
test("separate devices and multiple sessions for one account stay independent; password changes revoke only that account", async () => {
  const one = await login("manager@archetype.demo"),
    two = await login("manager@archetype.demo");
  assert.notEqual(one.cookie, two.cookie);
  assert.equal((await call("/api/state", { cookie: one.cookie })).status, 200);
  assert.equal((await call("/api/state", { cookie: two.cookie })).status, 200);
  await call("/api/logout", { cookie: one.cookie, payload: {} });
  assert.equal((await call("/api/state", { cookie: one.cookie })).status, 401);
  assert.equal((await call("/api/state", { cookie: two.cookie })).status, 200);
  const first = tab(),
    second = tab();
  await login("assessor@archetype.demo", first);
  await login("assessor@archetype.demo", second);
  const s = (await call("/api/state", { tab: first })).data.state;
  const changed = await call("/api/command", {
    tab: first,
    payload: {
      kind: "password.change",
      revision: s.revision,
      payload: {
        current: "ArchetypeDemo2026!",
        password: "New concurrent password 2026!",
      },
    },
  });
  assert.equal(changed.status, 200);
  assert.equal((await call("/api/state", { tab: first })).status, 401);
  assert.equal((await call("/api/state", { tab: second })).status, 401);
  assert.equal((await call("/api/state", { cookie: two.cookie })).status, 200);
});
test("failed login attempts do not block another account sharing Render's connection", async () => {
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await login("unknown@example.test", undefined, "incorrect password"))
        .status,
      401,
    );
  assert.equal(
    (await login("unknown@example.test", undefined, "incorrect password"))
      .status,
    429,
  );
  assert.equal((await login("iqa@archetype.demo", tab())).status, 200);
});
