import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createMailService, urgentItems } from "../server/mail.mjs";
import { seed } from "../server/model.mjs";
function setup(options = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE sessions(token TEXT,user_id TEXT,expires INTEGER)");
  const s = seed();
  let changed = [];
  const delivered = [];
  const service = createMailService({
    db,
    get: () => s,
    password: (...args) => changed.push(args),
    canSee: (u, l) =>
      u.role === "Manager" ||
      l.assessorId === u.id ||
      l.iqaId === u.id ||
      l.id === u.learnerId,
    env: {
      APP_ORIGIN: "https://portfolio.example",
      MORNING_DIGEST_ENABLED: "1",
    },
    send: async (m, id) => delivered.push({ m, id }),
    ...options,
  });
  return { db, s, service, changed, delivered };
}
test("password recovery queues a single-use hashed token, expires, and revokes all sessions", async () => {
  const { db, s, service, changed, delivered } = setup();
  const u = s.users[0];
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    "old",
    u.id,
    Date.now() + 1000000,
  );
  assert.deepEqual(service.reset(u), { emailQueued: true });
  assert.equal(changed.length, 0);
  await service.processQueue();
  assert.equal(delivered.length, 1);
  const token = delivered[0].m.text.match(/reset=([a-f0-9]{64})/)[1];
  assert.notEqual(
    db.prepare("SELECT token FROM password_resets").get().token,
    token,
  );
  assert.equal(
    db.prepare("SELECT payload FROM mail_outbox").get().payload,
    "{}",
  );
  service.redeem(token, "DifferentSecurePassword2026!");
  assert.equal(changed[0][0], u.id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
  assert.throws(
    () => service.redeem(token, "AnotherSecurePassword2026!"),
    /invalid or expired/,
  );
  service.reset(u);
  db.prepare("UPDATE password_resets SET expires=1").run();
  await service.processQueue();
  const expired = delivered.at(-1).m.text.match(/reset=([a-f0-9]{64})/)[1];
  assert.throws(
    () => service.redeem(expired, "SecurePasswordAgain2026!"),
    /invalid or expired/,
  );
  db.close();
});
test("unconfigured mail cannot report password reset as sent", () => {
  const { db, s, service } = setup({ env: {}, send: undefined });
  assert.equal(service.status().configured, false);
  assert.throws(() => service.reset(s.users[0]), /not configured/);
  db.close();
});
test("provider failures persist retries; expired reset messages are never sent", async () => {
  const { db, s, service } = setup({
    send: async () => {
      throw Error("failure with potentially secret response");
    },
  });
  service.reset(s.users[0]);
  await service.processQueue();
  assert.equal(
    db.prepare("SELECT attempts FROM mail_outbox").get().attempts,
    1,
  );
  assert.equal(
    db.prepare("SELECT last_error FROM mail_outbox").get().last_error,
    "Email provider delivery failed",
  );
  db.prepare("UPDATE mail_outbox SET created=1,next_attempt=0").run();
  await service.processQueue();
  assert.equal(
    db.prepare("SELECT status FROM mail_outbox").get().status,
    "Expired",
  );
  assert.equal(
    db.prepare("SELECT payload FROM mail_outbox").get().payload,
    "{}",
  );
  db.close();
});
test("daily reminders respect London time, role scope, completed actions, preferences and restart deduplication", async () => {
  const { db, s, service, delivered } = setup();
  s.tasks = [
    {
      learnerId: s.learners[0].id,
      owner: "apprentice",
      status: "Complete",
      title: "Do not send completed task",
      due: "2026-01-01",
    },
    {
      learnerId: s.learners[0].id,
      owner: "apprentice",
      status: "Open",
      title: "Upload urgent work",
      due: "2026-01-01",
    },
    {
      learnerId: s.learners[1].id,
      owner: "assessor",
      status: "Open",
      title: "Private other learner action",
      due: "2026-01-01",
    },
  ];
  const apprentice = s.users.find((u) => u.role === "Apprentice");
  apprentice.learnerId = s.learners[0].id;
  const visible = urgentItems(
    s,
    apprentice,
    (u, l) => u.learnerId === l.id,
    "2026-10-23",
  );
  assert(visible.includes("Action: Upload urgent work (due 2026-01-01)"));
  assert(!visible.some((x) => /completed task|Private other/.test(x)));
  s.users.find((u) => u.role === "Employer").morningDigest = false;
  service.daily(new Date("2026-10-23T06:59:00Z"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mail_daily").get().n, 0);
  service.daily(new Date("2026-10-23T07:00:00Z"));
  const count = db.prepare("SELECT COUNT(*) n FROM mail_outbox").get().n;
  service.daily(new Date("2026-10-23T09:00:00Z"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mail_outbox").get().n, count);
  const restarted = createMailService({
    db,
    get: () => s,
    password: () => {},
    canSee: (u, l) =>
      u.role === "Manager" ||
      l.assessorId === u.id ||
      l.iqaId === u.id ||
      l.id === u.learnerId,
    env: {
      APP_ORIGIN: "https://portfolio.example",
      MORNING_DIGEST_ENABLED: "1",
    },
    send: async () => {},
  });
  restarted.daily(new Date("2026-10-23T10:00:00Z"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mail_outbox").get().n, count);
  await service.processQueue();
  const msg = delivered.find((x) => x.m.to[0] === apprentice.email);
  assert(msg);
  assert(!msg.m.text.includes("Private other learner action"));
  assert(!delivered.some((x) => x.m.to[0] === "employer@archetype.demo"));
  db.close();
});
