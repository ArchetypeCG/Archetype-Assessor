import { randomBytes, createHash } from "node:crypto";
import { validateNewPassword } from "./passwords.mjs";
import { today, derive } from "./model.mjs";
import { applicationOrigins } from "./origins.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function urgentItems(s, u, canSee, day = today()) {
  const learners = s.learners.filter((l) => !l.fictional && canSee(u, l)),
    ids = new Set(learners.map((l) => l.id));
  const items = [];
  for (const t of s.tasks.filter(
    (t) =>
      ids.has(t.learnerId) &&
      t.status === "Open" &&
      t.due &&
      t.due <= day &&
      (!t.owner || t.owner === u.id || u.role === "Manager"),
  ))
    items.push(
      `Action: ${t.title || t.text || "Outstanding task"} (due ${t.due})`,
    );
  if (["Manager", "Assessor"].includes(u.role))
    for (const action of (s.assessorActions || []).filter(
      (action) =>
        action.status === "Open" &&
        action.due &&
        action.due <= day &&
        (u.role === "Manager" || action.owner === u.id) &&
        (s.assessorOneToOnes || []).some(
          (record) =>
            record.id === action.oneToOneId && record.status !== "Draft",
        ) &&
        (!action.learnerId ||
          !s.learners.find((learner) => learner.id === action.learnerId)
            ?.fictional),
    ))
      items.push(`Assessor 1:1 action: ${action.title} (due ${action.due})`);
  for (const a of (s.appointments || []).filter(
    (a) =>
      ids.has(a.learnerId) &&
      a.date <= day &&
      !["Completed", "Cancelled"].includes(a.status),
  ))
    items.push(`Session / review: ${a.title} (${a.date})`);
  if (["Manager", "IQA"].includes(u.role))
    for (const p of (s.samplingPlans || []).filter(
      (p) =>
        ids.has(p.learnerId) &&
        p.status === "Planned" &&
        p.date <= day &&
        (u.role === "Manager" || p.ownerId === u.id),
    ))
      items.push(`IQA sample: ${p.title} (due ${p.date})`);
  if (["Manager", "Assessor", "IQA"].includes(u.role))
    for (const l of learners)
      for (const e of derive(l, s, day).exceptions.filter(
        (e) => e.severity === "Red",
      ))
        items.push(`${l.name}: ${e.text}`);
  for (const p of (s.learningPlans || []).filter(
    (p) =>
      ids.has(p.learnerId) &&
      p.due <= day &&
      !["Completed", "Cancelled"].includes(p.status),
  ))
    items.push(`Learning activity: ${p.title} (due ${p.due})`);
  if (["Manager", "Assessor"].includes(u.role)) {
    for (const e of s.evidence.filter(
      (e) => ids.has(e.learnerId) && e.status === "Submitted",
    ))
      items.push(`Awaiting assessment: ${e.title}`);
    for (const o of s.otj.filter(
      (o) => ids.has(o.learnerId) && o.status === "Pending",
    ))
      items.push(`Learning log awaiting approval: ${o.activity || o.date}`);
  }
  return [...new Set(items)];
}
export function createMailService({
  db,
  get,
  password,
  canSee,
  env = process.env,
  send,
}) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS password_resets (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,last_error TEXT); CREATE TABLE IF NOT EXISTS mail_daily (day TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(day,user_id));`,
  );
  const digestHour = Number(env.MORNING_DIGEST_HOUR ?? 8);
  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23)
    throw Error("MORNING_DIGEST_HOUR must be an integer from 0 to 23.");
  const origin = applicationOrigins(env).primary;
  const configured = !!(
    env.RESEND_API_KEY &&
    env.MAIL_FROM &&
    origin &&
    new URL(origin).protocol === "https:"
  );
  const available = !!send || configured;
  const deliver =
    send ||
    (async (message, id) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": id,
        },
        body: JSON.stringify({ from: env.MAIL_FROM, ...message }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw Error(`Email provider returned ${response.status}`);
    });
  function queue(u, kind, subject, text) {
    const id = randomBytes(16).toString("hex");
    db.prepare(
      "INSERT INTO mail_outbox(id,user_id,kind,payload,created) VALUES(?,?,?,?,?)",
    ).run(
      id,
      u.id,
      kind,
      JSON.stringify({ to: [u.email], subject, text }),
      Date.now(),
    );
  }
  function reset(u) {
    if (!available) {
      const e = Error(
        "Email delivery is not configured. Set RESEND_API_KEY, MAIL_FROM and the HTTPS application URL in Render.",
      );
      e.status = 503;
      throw e;
    }
    db.prepare(
      "UPDATE mail_outbox SET status='Cancelled',payload='{}' WHERE user_id=? AND kind='reset' AND status='Queued'",
    ).run(u.id);
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM password_resets WHERE user_id=? OR expires<?").run(
      u.id,
      Date.now(),
    );
    db.prepare("INSERT INTO password_resets VALUES(?,?,?)").run(
      hash(token),
      u.id,
      Date.now() + 3600000,
    );
    queue(
      u,
      "reset",
      "Reset your Archetype password",
      `Hello ${u.name},\n\nUse this link to set a new password within one hour:\n${origin || "https://example.test"}/#reset=${token}\n\nIf you did not request this, contact your administrator. Never share this link.`,
    );
    return { emailQueued: true };
  }
  function redeem(token, pw) {
    pw = validateNewPassword(pw);
    if (
      typeof token !== "string" ||
      typeof pw !== "string" ||
      pw.length < 12 ||
      pw.length > 200
    ) {
      const e = Error(
        "Enter a valid reset link and a password of 12–200 characters.",
      );
      e.status = 400;
      throw e;
    }
    const record = db
      .prepare("SELECT * FROM password_resets WHERE token=? AND expires>?")
      .get(hash(token), Date.now());
    const u =
      record && get().users.find((u) => u.id === record.user_id && u.active);
    if (!u) {
      const e = Error(
        "This reset link is invalid or expired. Request a new one.",
      );
      e.status = 400;
      throw e;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      password(u.id, pw);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
      db.prepare("DELETE FROM password_resets WHERE user_id=?").run(u.id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  let running = false,
    timer;
  async function processQueue() {
    if (running || !available) return;
    running = true;
    try {
      db.prepare(
        "UPDATE mail_outbox SET payload='{}',status='Expired' WHERE kind='reset' AND payload!='{}' AND created<?",
      ).run(Date.now() - 3600000);
      db.prepare(
        "UPDATE mail_outbox SET status='Expired',payload='{}' WHERE kind='digest' AND status='Queued' AND created<?",
      ).run(Date.now() - 86400000);
      for (const row of db
        .prepare(
          "SELECT * FROM mail_outbox WHERE status='Queued' AND next_attempt<=? ORDER BY created LIMIT 20",
        )
        .all(Date.now())) {
        const u = get().users.find((u) => u.id === row.user_id && u.active);
        if (!u || (row.kind === "digest" && u.morningDigest === false)) {
          db.prepare(
            "UPDATE mail_outbox SET status='Cancelled',payload='{}' WHERE id=?",
          ).run(row.id);
          continue;
        }
        try {
          const message = JSON.parse(row.payload);
          if (message.to[0] !== u.email) {
            db.prepare(
              "UPDATE mail_outbox SET status='Cancelled',payload='{}' WHERE id=?",
            ).run(row.id);
            continue;
          }
          await deliver(message, row.id);
          db.prepare(
            "UPDATE mail_outbox SET status='Sent',payload='{}',last_error=NULL WHERE id=?",
          ).run(row.id);
        } catch (e) {
          const count = row.attempts + 1;
          db.prepare(
            "UPDATE mail_outbox SET attempts=?,status=?,next_attempt=?,last_error=? WHERE id=?",
          ).run(
            count,
            count >= 8 ? "Failed" : "Queued",
            Date.now() + Math.min(3600000, 60000 * 2 ** count),
            "Email provider delivery failed",
            row.id,
          );
        }
      }
      db.prepare(
        "UPDATE mail_outbox SET payload='{}',status='Expired' WHERE kind='reset' AND payload!='{}' AND created<?",
      ).run(Date.now() - 3600000);
      db.prepare("DELETE FROM password_resets WHERE expires<?").run(Date.now());
    } finally {
      running = false;
    }
  }
  function daily(now = new Date()) {
    if (!available || env.MORNING_DIGEST_ENABLED !== "1") return;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (k) => parts.find((p) => p.type === k).value,
      day = `${part("year")}-${part("month")}-${part("day")}`;
    if (Number(part("hour")) < digestHour) return;
    const s = get();
    for (const u of s.users.filter(
      (u) => u.active && u.morningDigest !== false,
    )) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const inserted = db
          .prepare("INSERT OR IGNORE INTO mail_daily VALUES(?,?)")
          .run(day, u.id).changes;
        if (inserted) {
          const items = urgentItems(s, u, canSee, day);
          if (items.length)
            queue(
              u,
              "digest",
              "Archetype: urgent actions for today",
              `Hello ${u.name},\n\n${items.slice(0, 100).join("\n")}\n\nOpen your workspace: ${origin}\n\nYou can change morning email reminders in Settings.`,
            );
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  }
  return {
    reset,
    redeem,
    processQueue,
    daily,
    status: () => ({
      configured: available,
      morningDigestEnabled: env.MORNING_DIGEST_ENABLED === "1",
      hour: digestHour,
      timeZone: "Europe/London",
      counts: db
        .prepare(
          "SELECT status,COUNT(*) AS count FROM mail_outbox GROUP BY status",
        )
        .all(),
    }),
    start() {
      timer = setInterval(() => {
        try {
          daily();
        } catch (e) {
          console.error("Email schedule failed");
        }
        processQueue().catch(() => {});
      }, 60000);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
