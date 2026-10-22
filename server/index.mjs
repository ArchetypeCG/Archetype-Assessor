import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { seed, id, derive, roles, today } from "./model.mjs";
const PORT = Number(process.env.PORT || 3000),
  demo = process.env.DEMO_MODE === "1",
  root = resolve("dist"),
  dataDir = resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(resolve(dataDir, "archetype.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY,learner_id TEXT,name TEXT NOT NULL,body BLOB NOT NULL);",
);
const get = () =>
  JSON.parse(db.prepare("SELECT data FROM workspace WHERE id=1").get().data);
const put = (s) =>
  db
    .prepare("INSERT OR REPLACE INTO workspace(id,data) VALUES(1,?)")
    .run(JSON.stringify(s));
function password(userId, pw) {
  const salt = randomBytes(16).toString("hex");
  db.prepare("INSERT OR REPLACE INTO credentials VALUES(?,?,?)").run(
    userId,
    salt,
    scryptSync(pw, salt, 64).toString("hex"),
  );
}
if (!db.prepare("SELECT id FROM workspace WHERE id=1").get()) {
  if (
    !demo &&
    (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
  )
    throw Error(
      "First production start requires ADMIN_PASSWORD (at least 12 characters) and optionally ADMIN_EMAIL. Use npm run dev for fictional demo data.",
    );
  const s = seed();
  if (!demo) {
    s.users = [
      {
        id: "manager",
        name: "Workspace Administrator",
        role: "Manager",
        email: process.env.ADMIN_EMAIL || "admin@archetype.local",
        active: true,
      },
    ];
    for (const k of [
      "learners",
      "standards",
      "evidence",
      "otj",
      "reviews",
      "tasks",
    ])
      s[k] = [];
  }
  put(s);
  for (const u of s.users)
    password(u.id, demo ? "ArchetypeDemo2026!" : process.env.ADMIN_PASSWORD);
}
if (!demo && get().users.some((u) => u.email.endsWith("@archetype.demo")))
  throw Error(
    "This database contains public demo credentials. Start with DEMO_MODE=1 for preview, or use a separate DATA_DIR and ADMIN_PASSWORD for production.",
  );
function fail(message, status = 400) {
  const e = Error(message);
  e.status = status;
  throw e;
}
function requireRole(user, allowed) {
  if (!allowed.includes(user.role))
    fail("Your role does not allow this action.", 403);
}
const staff = ["Manager", "Assessor", "IQA"],
  editors = ["Manager", "Assessor"];
function canSee(user, l) {
  return (
    user.role === "Manager" ||
    (user.role === "Assessor" && l.assessorId === user.id) ||
    (user.role === "IQA" && l.iqaId === user.id) ||
    (user.role === "Apprentice" && user.learnerId === l.id) ||
    (user.role === "Employer" && user.employer === l.employer)
  );
}
function learnerFor(s, user, learnerId) {
  const l = s.learners.find((l) => l.id === learnerId);
  if (!l || !canSee(user, l)) fail("Learner not found or access denied.", 404);
  return l;
}
function visible(s, u) {
  const ls = s.learners.filter((l) => canSee(u, l));
  const ids = new Set(ls.map((l) => l.id));
  const out = {
    ...s,
    users: s.users
      .filter((x) => x.active)
      .map(({ id, name, role, email, employer, learnerId }) => ({
        id,
        name,
        role,
        ...(u.role === "Manager" ? { email, employer, learnerId } : {}),
      })),
    learners: ls.map((l) => derive(l, s)),
    audit: staff.includes(u.role)
      ? s.audit.filter((x) => u.role === "Manager" || ids.has(x.learnerId))
      : [],
    snapshots:
      u.role === "Manager"
        ? s.snapshots.map(({ id, date, by }) => ({ id, date, by }))
        : [],
  };
  for (const k of [
    "evidence",
    "otj",
    "reviews",
    "tasks",
    "appointments",
    "quality",
  ])
    out[k] = s[k].filter((x) => ids.has(x.learnerId));
  out.messages = s.messages.filter((x) => x.from === u.id || x.to === u.id);
  out.resources = s.resources.filter(
    (x) =>
      !x.standardId ||
      ls.some((l) => l.standardId === x.standardId) ||
      u.role === "Manager",
  );
  if (u.role === "Employer") {
    out.evidence = [];
    out.quality = [];
    out.learners = out.learners.map(({ email, notes, ...l }) => l);
  }
  return out;
}
const text = (v, label, max = 10000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(`${label} is required (maximum ${max} characters).`);
  return v.trim();
};
const optional = (v, max = 10000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
function number(v, label, min = 0, max = 100) {
  const n = Number(v);
  if (v === "" || v === undefined || !Number.isFinite(n) || n < min || n > max)
    fail(`${label} must be between ${min} and ${max}.`);
  return n;
}
function date(v, label, required = false) {
  if (!v && !required) return "";
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail(`Enter a valid ${label}.`);
  return v;
}
function choice(v, values, label) {
  if (!values.includes(v)) fail(`Invalid ${label}.`);
  return v;
}
function userBy(s, v, role) {
  if (!s.users.some((u) => u.id === v && u.active && u.role === role))
    fail(`Select an active ${role}.`);
  return v;
}
function normalizeLearner(p, s, old) {
  const standard = s.standards.find((x) => x.id === p.standardId);
  if (!standard) fail("Select a standard.");
  const ref = text(p.ref, "Reference", 80);
  if (s.learners.some((l) => l.ref === ref && l.id !== old?.id))
    fail("Learner reference already exists.");
  return {
    id: old?.id || id(),
    ref,
    name: text(p.name, "Learner name", 160),
    email: optional(p.email, 200),
    employer: text(p.employer, "Employer", 200),
    standardId: standard.id,
    level: standard.level,
    assessorId: userBy(s, p.assessorId, "Assessor"),
    iqaId: userBy(s, p.iqaId, "IQA"),
    status: choice(
      p.status,
      ["Active", "Paused", "Withdrawn", "Completed"],
      "learner status",
    ),
    target: number(p.target, "Progress target"),
    otjTarget: number(p.otjTarget, "OTJ target", 1, 10000),
    startDate: date(p.startDate, "start date"),
    plannedEnd: date(p.plannedEnd, "planned end"),
    predictedEnd: date(p.predictedEnd, "predicted end"),
    lastReview: old?.lastReview || "",
    nextReview: date(p.nextReview, "next review"),
    eliDue: date(p.eliDue, "insurance expiry"),
    riskDue: date(p.riskDue, "risk assessment due"),
    employerDue: date(p.employerDue, "employer assessment due"),
    english: choice(
      p.english,
      ["Pending", "Achieved", "Exempt"],
      "English status",
    ),
    maths: choice(p.maths, ["Pending", "Achieved", "Exempt"], "Maths status"),
    gatewayDate: old?.gatewayDate || "",
    epaDate: date(p.epaDate, "EPA date"),
    gatewayStatus: old?.gatewayStatus || "Not ready",
    notes: optional(p.notes),
  };
}
function uploadFiles(files, learnerId) {
  if (!Array.isArray(files) || files.length > 5) fail("Maximum 5 attachments.");
  return files.map((f) => {
    const name = text(f.name, "Filename", 180),
      b = Buffer.from(text(f.base64, "File data", 7500000), "base64");
    if (b.length > 5 * 1024 * 1024)
      fail("Each attachment must be at most 5 MB.");
    const fid = id();
    db.prepare("INSERT INTO files VALUES(?,?,?,?)").run(
      fid,
      learnerId,
      name,
      b,
    );
    return { id: fid, name, size: b.length };
  });
}
function command(s, u, kind, p) {
  let l;
  if (p.learnerId) l = learnerFor(s, u, p.learnerId);
  switch (kind) {
    case "learner.save": {
      requireRole(u, editors);
      const old = p.id ? s.learners.find((x) => x.id === p.id) : null;
      if (p.id && !old) fail("Learner not found.", 404);
      if (old) learnerFor(s, u, old.id);
      if (
        old &&
        old.standardId !== p.standardId &&
        s.evidence.some((e) => e.learnerId === old.id)
      )
        fail(
          "A learner with evidence cannot change standard. Create a new programme record.",
        );
      const item = normalizeLearner(p, s, old);
      if (u.role === "Assessor" && item.assessorId !== u.id)
        fail("Assessors can only create or retain their own caseload.", 403);
      if (old) Object.assign(old, item);
      else s.learners.push(item);
      return { learnerId: item.id };
    }
    case "learners.import": {
      requireRole(u, ["Manager"]);
      if (!Array.isArray(p.rows) || !p.rows.length || p.rows.length > 1000)
        fail("Import between 1 and 1,000 records.");
      for (const row of p.rows) {
        const old = s.learners.find((l) => l.ref === row.ref);
        if (
          old &&
          old.standardId !== row.standardId &&
          s.evidence.some((e) => e.learnerId === old.id)
        )
          fail("Cannot change a standard with existing evidence.");
        const item = normalizeLearner(row, s, old);
        if (old) Object.assign(old, item);
        else s.learners.push(item);
      }
      return { count: p.rows.length };
    }
    case "standard.save": {
      requireRole(u, ["Manager", "IQA"]);
      if (
        !Array.isArray(p.criteria) ||
        !p.criteria.length ||
        p.criteria.length > 500
      )
        fail("Provide 1–500 criteria.");
      const criteria = p.criteria.map((c) => ({
        code: text(c.code, "Criterion code", 20).toUpperCase(),
        type: choice(
          c.type,
          ["Knowledge", "Skill", "Behaviour", "Other"],
          "criterion type",
        ),
        text: text(c.text, "Criterion wording", 5000),
      }));
      if (new Set(criteria.map((c) => c.code)).size !== criteria.length)
        fail("Criterion codes must be unique.");
      s.standards.push({
        id: id(),
        name: text(p.name, "Standard title", 200),
        reference: text(p.reference, "Standard reference", 100),
        version: text(p.version, "Version", 100),
        level: number(p.level, "Level", 2, 7),
        criteria,
      });
      break;
    }
    case "evidence.save": {
      if (!l) fail("Select a learner.");
      requireRole(u, [...editors, "Apprentice"]);
      const old = p.id
        ? s.evidence.find((x) => x.id === p.id && x.learnerId === l.id)
        : null;
      if (p.id && !old) fail("Evidence not found.", 404);
      if (old && !["Draft", "Changes requested"].includes(old.status))
        fail("Only drafts or returned evidence can be edited.");
      const codes =
        s.standards
          .find((x) => x.id === l.standardId)
          ?.criteria.map((c) => c.code) || [];
      if (
        !Array.isArray(p.criteria) ||
        p.criteria.some((c) => !codes.includes(c))
      )
        fail("Invalid KSB mapping.");
      const status = choice(
        p.status,
        ["Draft", "Submitted"],
        "evidence status",
      );
      if (status === "Submitted" && !p.criteria.length)
        fail("Map at least one criterion before submission.");
      const item = {
        id: old?.id || id(),
        learnerId: l.id,
        title: text(p.title, "Evidence title", 200),
        type: text(p.type, "Evidence type", 80),
        date: date(p.date, "evidence date", true),
        description: text(p.description, "Reflection", 20000),
        criteria: [...new Set(p.criteria)],
        status,
        feedback: old?.feedback || "",
        files: [...(old?.files || []), ...uploadFiles(p.files || [], l.id)],
        by: old?.by || u.id,
        updated: new Date().toISOString(),
        decisions: old?.decisions || [],
      };
      if (item.files.length > 10) fail("Maximum 10 files per evidence item.");
      if (old) Object.assign(old, item);
      else s.evidence.push(item);
      break;
    }
    case "evidence.submit": {
      requireRole(u, [...editors, "Apprentice"]);
      const e = s.evidence.find((x) => x.id === p.id);
      if (!e) fail("Evidence not found.", 404);
      learnerFor(s, u, e.learnerId);
      if (
        !["Draft", "Changes requested"].includes(e.status) ||
        !e.criteria.length
      )
        fail("Map criteria on a draft or returned item first.");
      e.status = "Submitted";
      e.updated = new Date().toISOString();
      break;
    }
    case "evidence.assess": {
      requireRole(u, editors);
      const e = s.evidence.find((x) => x.id === p.id);
      if (!e) fail("Evidence not found.", 404);
      learnerFor(s, u, e.learnerId);
      if (e.status !== "Submitted")
        fail("Only submitted evidence can be assessed.");
      e.status = choice(
        p.status,
        ["Accepted", "Changes requested", "Rejected"],
        "decision",
      );
      e.feedback = text(p.feedback, "Assessor feedback", 20000);
      e.updated = new Date().toISOString();
      e.decisions.push({
        by: u.id,
        date: e.updated,
        status: e.status,
        feedback: e.feedback,
      });
      break;
    }
    case "otj.add": {
      if (!l) fail("Select a learner.");
      requireRole(u, [...editors, "Apprentice"]);
      const d = date(p.date, "learning date", true);
      if (d > today()) fail("Learning logs cannot be dated in the future.");
      s.otj.push({
        id: id(),
        learnerId: l.id,
        date: d,
        hours: number(p.hours, "Hours", 0.25, 24),
        activity: text(p.activity, "Learning activity", 200),
        reflection: text(p.reflection, "Learning reflection"),
        criteria: Array.isArray(p.criteria) ? p.criteria : [],
        status: "Pending",
        by: u.id,
      });
      break;
    }
    case "otj.decide": {
      requireRole(u, editors);
      const x = s.otj.find((x) => x.id === p.id);
      if (!x) fail("Learning log not found.", 404);
      learnerFor(s, u, x.learnerId);
      if (x.status !== "Pending") fail("This log has already been reviewed.");
      x.status = choice(p.status, ["Approved", "Returned"], "decision");
      x.feedback = optional(p.feedback);
      x.reviewedBy = u.id;
      break;
    }
    case "review.add": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      const r = {
        id: id(),
        learnerId: l.id,
        date: date(p.date, "review date", true),
        nextDate: date(p.nextDate, "next review date", true),
        type: text(p.type, "Review type", 80),
        text: text(p.text, "Review discussion", 20000),
        actions: text(p.actions, "Agreed actions"),
        by: u.id,
        acknowledgements: [],
      };
      if (r.nextDate <= r.date) fail("Next review must be after this review.");
      s.reviews.push(r);
      l.lastReview = r.date;
      l.nextReview = r.nextDate;
      break;
    }
    case "review.ack": {
      const r = s.reviews.find((x) => x.id === p.id);
      if (!r) fail("Review not found.", 404);
      learnerFor(s, u, r.learnerId);
      if (!r.acknowledgements.some((a) => a.by === u.id))
        r.acknowledgements.push({
          by: u.id,
          role: u.role,
          date: new Date().toISOString(),
        });
      break;
    }
    case "task.add": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      if (!s.users.some((x) => x.id === p.owner && x.active && canSee(x, l)))
        fail("Select an owner with access to this learner.");
      s.tasks.push({
        id: id(),
        learnerId: l.id,
        title: text(p.title, "Action", 500),
        owner: p.owner,
        due: date(p.due, "due date", true),
        status: "Open",
        by: u.id,
      });
      break;
    }
    case "task.toggle": {
      const t = s.tasks.find((x) => x.id === p.id);
      if (!t) fail("Action not found.", 404);
      learnerFor(s, u, t.learnerId);
      if (!editors.includes(u.role) && t.owner !== u.id)
        fail("Only the owner or assessor can update an action.", 403);
      t.status = t.status === "Open" ? "Complete" : "Open";
      break;
    }
    case "resource.add": {
      requireRole(u, staff);
      const url = optional(p.url, 2000);
      if (url && !/^https:\/\//i.test(url))
        fail("Resource links must use HTTPS.");
      if (p.standardId && !s.standards.some((x) => x.id === p.standardId))
        fail("Invalid standard.");
      s.resources.push({
        id: id(),
        title: text(p.title, "Resource title", 200),
        category: text(p.category, "Category", 100),
        description: optional(p.description),
        url,
        standardId: p.standardId || "",
        files: uploadFiles(p.files || [], null),
        by: u.id,
      });
      break;
    }
    case "appointment.add": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      s.appointments.push({
        id: id(),
        learnerId: l.id,
        title: text(p.title, "Appointment title", 200),
        date: date(p.date, "appointment date", true),
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)
          ? p.time
          : fail("Enter a valid time."),
        location: optional(p.location, 1000),
        notes: optional(p.notes),
        by: u.id,
      });
      break;
    }
    case "message.send": {
      const recipient = s.users.find((x) => x.id === p.to && x.active);
      if (!recipient || recipient.id === u.id) fail("Select a recipient.");
      if (
        !s.learners.some((l) => canSee(u, l) && canSee(recipient, l)) &&
        u.role !== "Manager" &&
        recipient.role !== "Manager"
      )
        fail("Recipient must share a learner with you.", 403);
      s.messages.push({
        id: id(),
        from: u.id,
        to: recipient.id,
        text: text(p.text, "Message", 10000),
        date: new Date().toISOString(),
      });
      break;
    }
    case "quality.add": {
      requireRole(u, ["Manager", "IQA"]);
      const e = s.evidence.find((x) => x.id === p.evidenceId);
      if (!e) fail("Evidence not found.", 404);
      learnerFor(s, u, e.learnerId);
      if (e.status !== "Accepted") fail("Sample accepted evidence only.");
      s.quality.push({
        id: id(),
        learnerId: e.learnerId,
        evidenceId: e.id,
        outcome: choice(
          p.outcome,
          ["Agreed", "Action required"],
          "quality outcome",
        ),
        notes: text(p.notes, "Quality notes"),
        by: u.id,
        date: new Date().toISOString(),
      });
      break;
    }
    case "gateway.record": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      if (!derive(l, s).gatewayChecks.every((x) => x[1]))
        fail(
          "All readiness checks must pass before recording gateway readiness.",
        );
      l.gatewayStatus = "Ready";
      l.gatewayDate = date(p.date, "gateway date", true);
      l.epaDate = date(p.epaDate, "EPA date");
      l.gatewayNotes = text(p.notes, "Gateway declaration notes");
      l.gatewayBy = u.id;
      break;
    }
    case "user.add": {
      requireRole(u, ["Manager"]);
      const email = text(p.email, "Email", 200).toLowerCase();
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        s.users.some((x) => x.email === email)
      )
        fail("Use a unique valid email.");
      const role = choice(p.role, roles, "role");
      const pw = text(p.password, "Initial password", 200);
      if (pw.length < 12)
        fail("Passwords must contain at least 12 characters.");
      if (
        role === "Apprentice" &&
        !s.learners.some((l) => l.id === p.learnerId)
      )
        fail("Link the apprentice to a learner.");
      if (
        role === "Employer" &&
        !s.learners.some((l) => l.employer === p.employer)
      )
        fail("Choose an existing employer.");
      const user = {
        id: id(),
        name: text(p.name, "Name", 160),
        email,
        role,
        active: true,
        ...(role === "Apprentice" ? { learnerId: p.learnerId } : {}),
        ...(role === "Employer" ? { employer: p.employer } : {}),
      };
      s.users.push(user);
      password(user.id, pw);
      break;
    }
    case "password.change": {
      const c = db
        .prepare("SELECT * FROM credentials WHERE user_id=?")
        .get(u.id);
      if (
        !c ||
        typeof p.current !== "string" ||
        !timingSafeEqual(
          Buffer.from(c.hash, "hex"),
          scryptSync(p.current, c.salt, 64),
        )
      )
        fail("Current password is incorrect.");
      const pw = text(p.password, "New password", 200);
      if (pw.length < 12) fail("Use at least 12 characters.");
      password(u.id, pw);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
      break;
    }
    case "snapshot.create": {
      requireRole(u, ["Manager"]);
      const { snapshots, ...data } = s;
      s.snapshots.push({
        id: id(),
        date: new Date().toISOString(),
        by: u.id,
        data: JSON.parse(JSON.stringify(data)),
      });
      s.snapshots = s.snapshots.slice(-5);
      break;
    }
    case "snapshot.restore": {
      requireRole(u, ["Manager"]);
      const snap = s.snapshots.find((x) => x.id === p.id);
      if (!snap) fail("Snapshot not found.");
      const { users, audit, revision, snapshots } = s;
      Object.assign(s, JSON.parse(JSON.stringify(snap.data)), {
        users,
        audit,
        revision,
        snapshots,
      });
      break;
    }
    default:
      fail("Unknown operation.");
  }
  return {};
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 36 * 1024 * 1024)
      fail("Request is too large.", 413);
  }
  try {
    return JSON.parse(data || "{}");
  } catch {
    fail("Invalid JSON.");
  }
}
function json(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}
const attempts = new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  try {
    const path = new URL(req.url, "http://local").pathname;
    if (path.startsWith("/api/")) {
      if (req.method !== "GET") {
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          fail("JSON requests required.", 415);
        if (req.headers.origin) {
          let origin;
          try {
            origin = new URL(req.headers.origin);
          } catch {
            fail("Invalid request origin.", 403);
          }
          if (origin.host !== req.headers.host)
            fail("Cross-origin requests are not allowed.", 403);
        }
      }
      if (path === "/api/health") return json(res, 200, { ok: true });
      if (path === "/api/login" && req.method === "POST") {
        const key = req.socket.remoteAddress,
          now = Date.now(),
          record = attempts.get(key) || { count: 0, until: now + 600000 };
        if (record.until < now) {
          record.count = 0;
          record.until = now + 600000;
        }
        if (record.count >= 30)
          fail("Too many attempts. Try again in 10 minutes.", 429);
        const p = await body(req),
          s = get(),
          u = s.users.find(
            (x) => x.email === String(p.email).toLowerCase() && x.active,
          ),
          c = u
            ? db.prepare("SELECT * FROM credentials WHERE user_id=?").get(u.id)
            : null;
        const hash = scryptSync(
          typeof p.password === "string" ? p.password.slice(0, 200) : "",
          c?.salt || "dummy-salt",
          64,
        );
        if (!c || !timingSafeEqual(hash, Buffer.from(c.hash, "hex"))) {
          record.count++;
          attempts.set(key, record);
          fail("Email or password is incorrect.", 401);
        }
        attempts.delete(key);
        const token = randomBytes(32).toString("hex");
        db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          createHash("sha256").update(token).digest("hex"),
          u.id,
          now + 8 * 3600000,
        );
        res.setHeader(
          "Set-Cookie",
          `archetype_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
        );
        return json(res, 200, { user: u });
      }
      if (path === "/api/demo" && req.method === "GET")
        return json(res, 200, {
          enabled: demo,
          accounts: demo
            ? get()
                .users.filter((u) =>
                  [
                    "manager",
                    "assessor",
                    "iqa",
                    "apprentice",
                    "employer",
                  ].includes(u.id),
                )
                .map(({ email, name, role }) => ({ email, name, role }))
            : [],
        });
      const token = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("archetype_session="))
        ?.split("=")[1];
      const session = token
        ? db
            .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
            .get(createHash("sha256").update(token).digest("hex"), Date.now())
        : null;
      const s = get(),
        u = session
          ? s.users.find((x) => x.id === session.user_id && x.active)
          : null;
      if (!u) fail("Please sign in.", 401);
      if (path === "/api/logout" && req.method === "POST") {
        db.prepare("DELETE FROM sessions WHERE token=?").run(session.token);
        res.setHeader(
          "Set-Cookie",
          "archetype_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return json(res, 200, { ok: true });
      }
      if (path === "/api/state" && req.method === "GET")
        return json(res, 200, { user: u, state: visible(s, u), demo });
      if (path.startsWith("/api/files/") && req.method === "GET") {
        const fileId = path.split("/").at(-1),
          f = db.prepare("SELECT * FROM files WHERE id=?").get(fileId);
        if (!f) fail("File not found.", 404);
        if (f.learner_id) {
          learnerFor(s, u, f.learner_id);
          if (u.role === "Employer")
            fail(
              "Evidence downloads are restricted to learner and assessment staff.",
              403,
            );
        } else if (
          !visible(s, u).resources.some((r) =>
            r.files.some((x) => x.id === fileId),
          )
        )
          fail("Resource not found.", 404);
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
          "Cache-Control": "no-store",
          "Content-Security-Policy": "sandbox; default-src 'none'",
        });
        return res.end(Buffer.from(f.body));
      }
      if (path === "/api/command" && req.method === "POST") {
        const p = await body(req);
        db.exec("BEGIN IMMEDIATE");
        try {
          const current = get();
          if (p.revision !== current.revision)
            fail(
              "The workspace changed in another session. Refresh and try again.",
              409,
            );
          const actor = current.users.find((x) => x.id === u.id && x.active);
          if (!actor) fail("Please sign in.", 401);
          const result = command(current, actor, p.kind, p.payload || {});
          const s = current;
          s.audit.unshift({
            id: id(),
            by: u.id,
            actor: u.name,
            role: u.role,
            action: p.kind,
            learnerId: p.payload?.learnerId || null,
            date: new Date().toISOString(),
          });
          s.audit = s.audit.slice(0, 5000);
          s.revision++;
          put(s);
          db.exec("COMMIT");
          return json(res, 200, { result, state: visible(s, u) });
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      }
      fail("Endpoint not found.", 404);
    }
    if (!["GET", "HEAD"].includes(req.method)) fail("Method not allowed.", 405);
    let decoded;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      fail("Invalid path.");
    }
    let file = resolve(root, "." + decoded);
    if (!file.startsWith(root + "/")) file = resolve(root, "index.html");
    if (!existsSync(file) || !statSync(file).isFile())
      file = resolve(root, "index.html");
    if (!existsSync(file))
      return json(res, 503, {
        error: "Build the frontend with npm run build, or use npm run dev.",
      });
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent)
      json(res, e.status || 500, {
        error: e.status ? e.message : "An unexpected server error occurred.",
      });
    else res.end();
  }
});
server.listen(PORT, "0.0.0.0", () =>
  console.log(
    `Archetype API listening on ${PORT}. ${demo ? "Fictional demo accounts enabled." : "Production mode."}`,
  ),
);
