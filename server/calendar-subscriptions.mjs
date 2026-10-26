import { createHash, randomBytes } from "node:crypto";
import { calendarICS } from "./scheduling.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const roles = ["Assessor", "Manager"];
function denied(message, status = 403) {
  throw Object.assign(Error(message), { status });
}
export function createCalendarSubscriptions({ db, get, origin }) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS calendar_subscriptions(user_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,issued_role TEXT NOT NULL,created TEXT NOT NULL,last_fetched TEXT)",
  );
  const eligible = (user) =>
    user?.active &&
    roles.includes(user.role) &&
    db
      .prepare("SELECT must_change FROM credentials WHERE user_id=?")
      .get(user.id)?.must_change === 0;
  function ensure(user) {
    if (!eligible(user))
      denied(
        "An active assessor or master account with a confirmed password is required.",
      );
  }
  function status(user) {
    ensure(user);
    const row = db
      .prepare(
        "SELECT created,last_fetched,issued_role FROM calendar_subscriptions WHERE user_id=?",
      )
      .get(user.id);
    return {
      enabled: !!row && row.issued_role === user.role,
      created: row?.created || null,
      lastFetched: row?.last_fetched || null,
    };
  }
  function create(user) {
    ensure(user);
    if (!origin)
      denied(
        "Configure APP_ORIGIN before creating an Outlook subscription.",
        503,
      );
    const token = randomBytes(32).toString("base64url"),
      created = new Date().toISOString();
    db.prepare(
      "INSERT OR REPLACE INTO calendar_subscriptions(user_id,token_hash,issued_role,created,last_fetched) VALUES(?,?,?,?,NULL)",
    ).run(user.id, hash(token), user.role, created);
    return {
      url: new URL(`/api/calendar/subscription/${token}.ics`, origin).href,
      created,
    };
  }
  function revoke(user) {
    ensure(user);
    db.prepare("DELETE FROM calendar_subscriptions WHERE user_id=?").run(
      user.id,
    );
    return { enabled: false };
  }
  function read(token, { head = false } = {}) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      return null;
    const row = db
      .prepare("SELECT * FROM calendar_subscriptions WHERE token_hash=?")
      .get(hash(token));
    if (!row) return null;
    const s = get(),
      user = s.users.find((u) => u.id === row.user_id);
    if (!eligible(user) || user.role !== row.issued_role) return null;
    const learners = s.learners.filter(
        (l) => user.role === "Manager" || l.assessorId === user.id,
      ),
      ids = new Set(learners.map((l) => l.id));
    const appointments = s.appointments
      .filter((a) => ids.has(a.learnerId))
      .map((a) => ({
        id: a.id,
        learnerId: a.learnerId,
        title: `${a.title} · ${learners.find((l) => l.id === a.learnerId)?.name || "Apprentice"}`,
        date: a.date,
        time: a.time,
        endTime: a.endTime,
        allDay: a.allDay,
        status: a.status,
        updated: a.updated,
        created: a.created,
        sequence: a.sequence,
        location: a.location,
        meetingUrl: a.meetingUrl,
      }));
    if (!head)
      db.prepare(
        "UPDATE calendar_subscriptions SET last_fetched=? WHERE user_id=? AND token_hash=?",
      ).run(new Date().toISOString(), user.id, row.token_hash);
    return calendarICS(
      {
        learners: learners.map((l) => ({ id: l.id, name: l.name })),
        appointments,
      },
      {
        privateEvents: true,
        subscription: true,
        name: `Archetype · ${user.name}`,
      },
    );
  }
  return { status, create, revoke, read };
}
