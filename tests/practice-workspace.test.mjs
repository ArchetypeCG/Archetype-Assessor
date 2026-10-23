import test from "node:test";
import assert from "node:assert/strict";
import {
  restorePracticeWorkspace,
  practiceRestoreNeeded,
} from "../server/practice-workspace.mjs";
import { installUploadedStarter } from "../server/uploaded-starter.mjs";
import { importTracker } from "../server/tracker-import.mjs";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { decryptBackup } from "../server/backups.mjs";
const fixture = () => ({
  revision: 0,
  users: [
    {
      id: "owner",
      name: "Synthetic owner",
      role: "Manager",
      active: true,
      email: "owner@example.test",
    },
  ],
  standards: [],
  learners: [],
  evidence: [],
  otj: [],
  reviews: [],
  tasks: [],
  appointments: [],
  learningPlans: [],
  audit: [],
  snapshots: [],
  resources: [],
  messages: [],
  quality: [],
  samplingPlans: [],
});
const importedState = () => {
  const s = fixture();
  installUploadedStarter(s);
  importTracker(
    s,
    [
      ["Pro Ref No", "Apprenticeship Title", "Level"],
      ["SYNTHETIC-1", "Business Administrator", 3],
    ],
    {
      makeId: randomUUID,
      actorId: "owner",
      importedAt: new Date().toISOString(),
    },
  );
  return s;
};
test("requested practice reset removes imported learners and links, preserves standards/accounts, and never reruns on future imports", () => {
  const s = importedState(),
    learner = s.learners[0];
  s.tasks.push({ id: "old-task", learnerId: learner.id });
  s.snapshots.push({
    id: "old-snapshot",
    data: structuredClone({ ...s, snapshots: [] }),
  });
  const users = structuredClone(s.users),
    standards = structuredClone(s.standards);
  const result = restorePracticeWorkspace(s);
  assert.deepEqual(result.removedIds, [learner.id]);
  assert.equal(result.addedFictional, 6);
  assert.equal(s.learners.length, 6);
  assert.ok(s.learners.every((l) => l.fictional));
  assert.deepEqual(s.users, users);
  assert.deepEqual(s.standards, standards);
  assert.ok(!s.tasks.some((t) => t.id === "old-task"));
  assert.equal(s.snapshots[0].data.learners.length, 0);
  assert.ok(!practiceRestoreNeeded(s));
  const after = structuredClone(s);
  assert.equal(restorePracticeWorkspace(s), null);
  assert.deepEqual(s, after);
  importTracker(
    s,
    [
      ["Pro Ref No", "Apprenticeship Title", "Level"],
      ["FUTURE-IMPORT", "Business Administrator", 3],
    ],
    {
      makeId: randomUUID,
      actorId: "owner",
      importedAt: new Date().toISOString(),
    },
  );
  assert.equal(restorePracticeWorkspace(s), null);
  assert.equal(s.learners[0].ref, "FUTURE-IMPORT");
});
test("production upgrade backs up imported records and files before replacing them and retains the administrator password", async () => {
  const dir = await mkdtemp("/tmp/archetype-practice-upgrade-");
  const s = importedState();
  const learnerId = s.learners[0].id;
  const secret = randomBytes(32).toString("hex"),
    password = "Synthetic current password 2026!",
    salt = randomBytes(16).toString("hex");
  const db = new DatabaseSync(dir + "/archetype.sqlite");
  db.exec(
    "CREATE TABLE workspace(id INTEGER PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE credentials(user_id TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 0);CREATE TABLE files(id TEXT PRIMARY KEY,learner_id TEXT,name TEXT NOT NULL,body BLOB NOT NULL)",
  );
  db.prepare("INSERT INTO workspace VALUES(1,?)").run(JSON.stringify(s));
  db.prepare("INSERT INTO credentials VALUES(?,?,?,0)").run(
    "owner",
    salt,
    scryptSync(password, salt, 64).toString("hex"),
  );
  db.prepare("INSERT INTO files VALUES(?,?,?,?)").run(
    "imported-file",
    learnerId,
    "synthetic.txt",
    Buffer.from("Recoverable synthetic learner work"),
  );
  db.close();
  const port = 27000 + Math.floor(Math.random() * 2000),
    base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      RENDER: "",
      DATA_DIR: dir,
      DEMO_MODE: "0",
      COOKIE_SECURE: "1",
      BACKUP_ENCRYPTION_KEY: secret,
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      MORNING_DIGEST_ENABLED: "0",
      S3_BACKUP_BUCKET: "",
      APP_ORIGIN: "https://synthetic.example.test",
      RENDER_EXTERNAL_URL: "",
      ADDITIONAL_APP_ORIGINS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (b) => (logs += b));
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
    assert.ok(ready);
    const login = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const current = await (
      await fetch(base + "/api/state", { headers: { cookie } })
    ).json();
    assert.equal(current.state.learners.length, 6);
    assert.ok(current.state.learners.every((l) => l.fictional));
    const file = await fetch(base + "/api/files/imported-file", {
      headers: { cookie },
    });
    assert.equal(file.status, 404);
    const backups = (await readdir(dir + "/backups")).filter((n) =>
      n.endsWith(".enc"),
    );
    assert.ok(backups.length >= 1);
    let recovered = false;
    for (const [i, name] of backups.entries()) {
      const restored = dir + `/restore-${i}.sqlite`;
      await decryptBackup(dir + "/backups/" + name, restored, secret);
      const check = new DatabaseSync(restored);
      const data = JSON.parse(
        check.prepare("SELECT data FROM workspace WHERE id=1").get().data,
      );
      if (data.learners.some((l) => l.id === learnerId)) {
        assert.equal(
          Buffer.from(
            check
              .prepare("SELECT body FROM files WHERE id='imported-file'")
              .get().body,
          ).toString(),
          Buffer.from("Recoverable synthetic learner work").toString(),
        );
        recovered = true;
      }
      check.close();
    }
    assert.ok(recovered);
  } finally {
    child.kill();
    if (child.exitCode === null)
      await new Promise((r) => child.once("exit", r));
    await rm(dir, { recursive: true, force: true });
  }
});
