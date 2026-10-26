import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createCalendarSubscriptions } from "../server/calendar-subscriptions.mjs";
import { createBackupService } from "../server/backups.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const fixture = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE credentials(user_id TEXT PRIMARY KEY,must_change INTEGER)",
  );
  const s = {
    users: [
      { id: "assessor", name: "Test Assessor", role: "Assessor", active: true },
      { id: "other", name: "Other Assessor", role: "Assessor", active: true },
      { id: "master", name: "Master", role: "Manager", active: true },
      { id: "apprentice", role: "Apprentice", active: true },
    ],
    learners: [
      {
        id: "learner",
        name: "Example Learner",
        assessorId: "assessor",
        notes: "PRIVATE LEARNER NOTE",
      },
      { id: "foreign", name: "Other Learner", assessorId: "other" },
    ],
    appointments: [
      {
        id: "session",
        learnerId: "learner",
        title: "Learning session",
        date: "2026-07-01",
        time: "10:00",
        endTime: "11:00",
        status: "Planned",
        notes: "PRIVATE DISCUSSION",
        staffNotes: "PRIVATE STAFF NOTE",
        description: "PRIVATE REVIEW BODY",
        preparation: "PRIVATE PREPARATION",
        location: "Training room",
        meetingUrl: "https://example.org/meeting",
        created: "2026-01-01T00:00:00Z",
        sequence: 0,
      },
      {
        id: "all-day",
        learnerId: "learner",
        title: "Ten-week review",
        date: "2026-11-10",
        allDay: true,
        status: "Planned",
        created: "2026-01-01T00:00:00Z",
      },
      {
        id: "foreign-session",
        learnerId: "foreign",
        title: "Other caseload session",
        date: "2026-11-11",
        time: "10:00",
        endTime: "11:00",
        status: "Planned",
      },
    ],
  };
  for (const u of s.users)
    db.prepare("INSERT INTO credentials VALUES(?,0)").run(u.id);
  const service = createCalendarSubscriptions({
    db,
    get: () => s,
    origin: "https://portfolio.example.test",
  });
  return { db, s, service, user: s.users[0] };
};
const token = (url) =>
  new URL(url).pathname
    .split("/")
    .at(-1)
    .replace(/\.ics$/, "");
test("private calendar links use hashed tokens, exclude confidential detail and preserve Outlook event identities and UK times", () => {
  const { db, s, service, user } = fixture();
  try {
    const link = service.create(user),
      secret = token(link.url);
    assert.equal(secret.length, 43);
    assert.ok(
      !JSON.stringify(
        db.prepare("SELECT * FROM calendar_subscriptions").all(),
      ).includes(secret),
    );
    assert.equal(service.status(user).enabled, true);
    assert.ok(!JSON.stringify(service.status(user)).includes(secret));
    const feed = service.read(secret);
    assert.match(feed, /BEGIN:VCALENDAR/);
    assert.match(feed, /CLASS:PRIVATE/);
    assert.match(feed, /UID:session-session@archetype/);
    assert.match(feed, /DTSTART:20260701T090000Z/);
    assert.match(feed, /DTSTART;VALUE=DATE:20261110/);
    assert.match(feed, /Example Learner/);
    assert.match(feed, /https:\/\/example.org\/meeting/);
    assert.doesNotMatch(
      feed,
      /PRIVATE LEARNER|PRIVATE DISCUSSION|PRIVATE STAFF|PRIVATE REVIEW|PRIVATE PREPARATION|Other caseload session|Other Learner/,
    );
  } finally {
    db.close();
  }
});
test("subscription rotation, revocation, dynamic assignments and current account eligibility are enforced on every read", () => {
  const { db, s, service, user } = fixture();
  try {
    const first = service.create(user);
    const second = service.create(user);
    assert.equal(service.read(token(first.url)), null);
    assert.ok(service.read(token(second.url)));
    assert.ok(service.status(user).lastFetched);
    s.appointments[0].status = "Cancelled";
    s.appointments[0].sequence = 2;
    s.appointments[0].updated = "2026-10-26T12:00:00Z";
    assert.match(service.read(token(second.url)), /STATUS:CANCELLED/);
    assert.match(service.read(token(second.url)), /SEQUENCE:2/);
    s.learners[0].assessorId = "other";
    assert.doesNotMatch(service.read(token(second.url)), /Example Learner/);
    user.active = false;
    assert.equal(service.read(token(second.url)), null);
    user.active = true;
    user.role = "Manager";
    assert.equal(service.read(token(second.url)), null);
    user.role = "Assessor";
    service.revoke(user);
    assert.equal(service.read(token(second.url)), null);
    assert.equal(service.status(user).enabled, false);
    assert.throws(() => service.create(s.users[3]), /active assessor/);
    db.prepare("UPDATE credentials SET must_change=1 WHERE user_id=?").run(
      user.id,
    );
    assert.throws(() => service.create(user), /confirmed password/);
  } finally {
    db.close();
  }
});
test("restoring an encrypted backup invalidates calendar capabilities as well as login sessions", async () => {
  const dir = await mkdtemp("/tmp/archetype-calendar-restore-");
  const db = new DatabaseSync(dir + "/source.sqlite");
  try {
    db.exec(
      "CREATE TABLE workspace(id INTEGER PRIMARY KEY,data TEXT);CREATE TABLE sessions(token TEXT);CREATE TABLE credentials(user_id TEXT PRIMARY KEY,must_change INTEGER)",
    );
    const s = {
      users: [{ id: "master", name: "Master", role: "Manager", active: true }],
      learners: [],
      appointments: [],
    };
    db.prepare("INSERT INTO workspace VALUES(1,?)").run(JSON.stringify(s));
    db.exec(
      "INSERT INTO sessions VALUES('old-session');INSERT INTO credentials VALUES('master',0)",
    );
    const service = createCalendarSubscriptions({
      db,
      get: () => s,
      origin: "https://example.test",
    });
    service.create(s.users[0]);
    const key = "test-only-calendar-backup-key-2026-long-secret",
      backups = createBackupService(db, dir, { BACKUP_ENCRYPTION_KEY: key });
    const backup = await backups.create(),
      target = dir + "/restored.sqlite";
    execFileSync(
      process.execPath,
      [
        "scripts/restore-backup.mjs",
        await backups.downloadPath(backup.name),
        target,
      ],
      {
        env: { ...process.env, BACKUP_ENCRYPTION_KEY: key },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const restored = new DatabaseSync(target);
    assert.equal(
      restored.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      0,
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) AS n FROM calendar_subscriptions").get()
        .n,
      0,
    );
    restored.close();
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
