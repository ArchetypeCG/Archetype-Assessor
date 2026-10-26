import http from "node:http";
import { createIntegrityService } from "./integrity.mjs";
import JSZip from "jszip";
import {
  practiceRestoreNeeded,
  importedLearnerIds,
  restorePracticeWorkspace,
} from "./practice-workspace.mjs";
import { sessionCookieName } from "./session-scope.mjs";
import { importTracker } from "./tracker-import.mjs";
import { installUploadedStarter } from "./uploaded-starter.mjs";
import { validateNewPassword } from "./passwords.mjs";
import { applicationOrigins } from "./origins.mjs";
import {
  setReviewSeries,
  syncReviewSeries,
  syncReviewParticipants,
  nextSeriesReview,
} from "./review-series.mjs";
import { normalizeReview } from "./reviews.mjs";
import { samplingCommand } from "./sampling.mjs";
import { createMailService } from "./mail.mjs";
import { createBackupService } from "./backups.mjs";
import { schedulingCommand, calendarICS } from "./scheduling.mjs";
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
import { assertRenderStorage } from "./storage.mjs";
const origins = applicationOrigins();
const PORT = Number(process.env.PORT || 3000),
  demo = process.env.DEMO_MODE === "1",
  root = resolve("dist"),
  dataDir = resolve(process.env.DATA_DIR || "data");
process.umask(0o077);
if (process.env.NODE_ENV === "production") {
  if (demo) throw Error("Demo accounts cannot run with NODE_ENV=production.");
  if (process.env.COOKIE_SECURE !== "1" || !process.env.DATA_DIR)
    throw Error(
      "Production requires COOKIE_SECURE=1 and an explicit persistent DATA_DIR.",
    );
  if (
    !process.env.BACKUP_ENCRYPTION_KEY ||
    process.env.BACKUP_ENCRYPTION_KEY.length < 32
  )
    throw Error(
      "Production requires a BACKUP_ENCRYPTION_KEY of at least 32 characters.",
    );
  if (
    process.env.S3_BACKUP_BUCKET &&
    (!process.env.S3_BACKUP_ACCESS_KEY_ID ||
      !process.env.S3_BACKUP_SECRET_ACCESS_KEY)
  )
    throw Error(
      "The configured off-site backup bucket requires S3 backup credentials.",
    );
}
assertRenderStorage(process.env, dataDir);
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(dataDir, "archetype.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY,learner_id TEXT,name TEXT NOT NULL,body BLOB NOT NULL);",
);
if (
  !db
    .prepare("PRAGMA table_info(credentials)")
    .all()
    .some((x) => x.name === "must_change")
)
  db.exec(
    "ALTER TABLE credentials ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0",
  );
const backups = createBackupService(db, dataDir);
const get = () =>
  (() => {
    const s = JSON.parse(
      db.prepare("SELECT data FROM workspace WHERE id=1").get().data,
    );
    s.learningPlans ||= [];
    s.learningTemplates ||= [];
    s.privateLearnerNotes ||= [];
    s.samplingPlans ||= [];
    return s;
  })();
const put = (s) =>
  db
    .prepare("INSERT OR REPLACE INTO workspace(id,data) VALUES(1,?)")
    .run(JSON.stringify(s));
function password(userId, pw, mustChange = false) {
  pw = validateNewPassword(pw);
  const salt = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT OR REPLACE INTO credentials(user_id,salt,hash,must_change) VALUES(?,?,?,?)",
  ).run(
    userId,
    salt,
    scryptSync(pw, salt, 64).toString("hex"),
    mustChange ? 1 : 0,
  );
}
if (!db.prepare("SELECT id FROM workspace WHERE id=1").get()) {
  if (!demo) {
    try {
      validateNewPassword(process.env.ADMIN_PASSWORD);
    } catch {
      throw Error(
        "First production start requires ADMIN_PASSWORD (12–200 characters) and optionally ADMIN_EMAIL. Configure these variables before starting the application.",
      );
    }
  }
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
  db.exec("BEGIN IMMEDIATE");
  try {
    put(s);
    for (const u of s.users)
      password(
        u.id,
        demo ? "ArchetypeDemo2026!" : process.env.ADMIN_PASSWORD,
        !demo,
      );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  console.log("New workspace initialised; administrator credentials created.");
}
if (!demo && get().users.some((u) => u.email.endsWith("@archetype.demo")))
  throw Error(
    "This database contains public demo credentials. Start with DEMO_MODE=1 for preview, or use a separate DATA_DIR and ADMIN_PASSWORD for production.",
  );
// Add starter library entries to existing fictional demos without rewriting learners,
// assignments, user edits, or any evidence. Production databases are untouched.
if (demo && get().users.some((u) => u.email.endsWith("@archetype.demo"))) {
  const s = get(),
    examples = seed();
  let added = 0;
  for (const st of examples.standards)
    if (!s.standards.some((x) => x.reference === st.reference)) {
      s.standards.push(st);
      added++;
    }
  for (const resource of examples.resources)
    if (!s.resources.some((x) => x.title === resource.title)) {
      s.resources.push(resource);
      added++;
    }
  if (added) {
    s.revision++;
    s.audit.unshift({
      id: id(),
      by: "system",
      actor: "Workspace upgrade",
      role: "System",
      action: "demo.library.upgrade",
      learnerId: null,
      date: new Date().toISOString(),
    });
    put(s);
  }
}
// The user-requested live starter import runs once, in the same transaction as its marker.
if (!demo) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const s = get();
    const result = installUploadedStarter(s);
    if (result) {
      put(s);
      console.log("Uploaded standards catalogue installed.");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
// Explicitly requested one-time return to fictional practice data. Never reruns on later imports.
if (!demo && practiceRestoreNeeded(get())) {
  // Complete the online encrypted backup before opening a write transaction.
  if (importedLearnerIds(get()).length) await backups.create();
  db.exec("BEGIN IMMEDIATE");
  try {
    const s = get();
    const importedIds = new Set(importedLearnerIds(s));
    const removedEvidenceIds = s.evidence
      .filter((e) => importedIds.has(e.learnerId))
      .map((e) => e.id);
    const result = restorePracticeWorkspace(s);
    if (result) {
      for (const learnerId of result.removedIds)
        db.prepare("DELETE FROM files WHERE learner_id=?").run(learnerId);
      if (
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='evidence_text'")
          .get()
      )
        for (const evidenceId of removedEvidenceIds) {
          db.prepare("DELETE FROM evidence_text WHERE evidence_id=?").run(
            evidenceId,
          );
          db.prepare("DELETE FROM integrity_jobs WHERE evidence_id=?").run(
            evidenceId,
          );
        }
      put(s);
      console.log("Requested fictional practice workspace restored.");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
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
      .filter((x) => u.role === "Manager" || x.active)
      .map(({ id, name, role, email, employer, learnerId, active }) => ({
        id,
        name,
        role,
        ...(u.role === "Manager" ? { email, employer, learnerId, active } : {}),
      })),
    learners: ls.map((l) => ({
      ...derive(l, s),
      ...(!["Manager", "Assessor"].includes(u.role)
        ? { tracker: undefined }
        : {}),
      ...(!["Manager", "Assessor"].includes(u.role)
        ? { notes: undefined }
        : {}),
      participantIds: s.users
        .filter((account) => account.active && canSee(account, l))
        .map((account) => account.id),
    })),
    audit: staff.includes(u.role)
      ? s.audit.filter((x) => u.role === "Manager" || ids.has(x.learnerId))
      : [],
    privateLearnerNotes: ["Manager", "Assessor"].includes(u.role)
      ? (s.privateLearnerNotes || []).filter((n) => ids.has(n.learnerId))
      : [],
    learningTemplates: ["Manager", "Assessor"].includes(u.role)
      ? s.learningTemplates || []
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
    "learningPlans",
    "samplingPlans",
  ])
    out[k] = s[k].filter((x) => ids.has(x.learnerId));
  if (!staff.includes(u.role)) out.samplingPlans = [];
  if (!staff.includes(u.role))
    out.appointments = out.appointments.map(({ staffNotes, ...a }) => a);
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
    out.samplingPlans = [];
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
    ...(old?.fictional ? { fictional: true } : {}),
    ...(old?.tracker ? { tracker: old.tracker } : {}),
    ref,
    name: text(p.name, "Learner name", 160),
    email: optional(p.email, 200),
    employer: text(p.employer, "Employer", 200),
    standardId: standard.id,
    level: standard.level,
    assessorId:
      old?.tracker && !p.assessorId ? "" : userBy(s, p.assessorId, "Assessor"),
    iqaId: old?.tracker && !p.iqaId ? "" : userBy(s, p.iqaId, "IQA"),
    status: choice(
      p.status,
      ["Active", "Paused", "Withdrawn", "Completed"],
      "learner status",
    ),
    target: number(p.target, "Progress target"),
    otjTarget: number(p.otjTarget, "OTJ target", old?.tracker ? 0 : 1, 10000),
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
    englishUpskill:
      p.englishUpskill === undefined
        ? old?.englishUpskill || false
        : p.englishUpskill === true,
    mathsUpskill:
      p.mathsUpskill === undefined
        ? old?.mathsUpskill || false
        : p.mathsUpskill === true,
    englishNotRequired: old?.englishNotRequired || false,
    mathsNotRequired: old?.mathsNotRequired || false,
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
const mail = createMailService({ db, get, password, canSee });
const integrity = createIntegrityService({
  db,
  get,
  put,
  enabled:
    process.env.INTEGRITY_ENABLED === "1" ||
    (!demo && process.env.INTEGRITY_ENABLED !== "0"),
});
function courseName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/team leader(?: or|\/| and)?\s*(?:supervisor)?/, "team leader")
    .replace(
      /operations(?: or|\/| and)?\s*(?:departmental)?\s*manager/,
      "operations manager",
    );
}
function command(s, u, kind, p) {
  const sampleResult = samplingCommand({
    s,
    u,
    kind,
    p,
    fail,
    requireRole,
    id,
    text,
    date,
    choice,
    learnerFor,
  });
  if (sampleResult !== null) return sampleResult;
  let l;
  if (p.learnerId) l = learnerFor(s, u, p.learnerId);
  const scheduleResult = schedulingCommand({
    s,
    u,
    kind,
    p,
    l,
    fail,
    requireRole,
    editors,
    id,
    text,
    optional,
    choice,
    date,
    number,
    canSee,
  });
  if (scheduleResult !== null) return scheduleResult;
  switch (kind) {
    case "learner.privateNote": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      s.privateLearnerNotes.push({
        id: id(),
        learnerId: l.id,
        text: text(p.text, "Confidential note", 20000),
        by: u.id,
        date: new Date().toISOString(),
      });
      break;
    }
    case "learner.functionalSkills": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      if (
        typeof p.englishNotRequired !== "boolean" ||
        typeof p.mathsNotRequired !== "boolean"
      )
        fail("Choose valid functional skills requirements.");
      l.englishNotRequired = p.englishNotRequired;
      l.mathsNotRequired = p.mathsNotRequired;
      l.functionalSkillsConfirmedBy = u.id;
      l.functionalSkillsConfirmedAt = new Date().toISOString();
      break;
    }
    case "evidence.recheck": {
      requireRole(u, [...editors, "Apprentice"]);
      const evidence = s.evidence.find((e) => e.id === p.id);
      if (!evidence) fail("Evidence not found.", 404);
      learnerFor(s, u, evidence.learnerId);
      integrity.enqueue(evidence);
      break;
    }
    case "evidence.epa": {
      requireRole(u, [...editors, "Apprentice"]);
      const e = s.evidence.find((e) => e.id === p.id);
      if (!e) fail("Evidence not found.", 404);
      const owner = learnerFor(s, u, e.learnerId);
      if (e.standardId && e.standardId !== owner.standardId)
        fail(
          "Select evidence from the apprentice's current programme for EPA.",
        );
      if (typeof p.selected !== "boolean")
        fail("Choose a valid EPA selection.");
      e.epaSelected = p.selected;
      e.epaSelectedBy = u.id;
      e.epaSelectedAt = new Date().toISOString();
      break;
    }
    case "plan.template.save": {
      requireRole(u, editors);
      const activity = s.learningPlans.find((a) => a.id === p.id);
      if (!activity) fail("Learning activity not found.", 404);
      learnerFor(s, u, activity.learnerId);
      const {
        title,
        description,
        objectives,
        criteria,
        resources,
        plannedHours,
        method,
        standardId,
      } = activity;
      s.learningTemplates.push({
        id: id(),
        title,
        description,
        objectives,
        criteria: [...criteria],
        resources: [...resources],
        plannedHours,
        method: method || "Other",
        standardId,
        by: u.id,
      });
      break;
    }
    case "learner.save": {
      requireRole(u, editors);
      const old = p.id ? s.learners.find((x) => x.id === p.id) : null;
      if (p.id && !old) fail("Learner not found.", 404);
      if (old) learnerFor(s, u, old.id);
      if (old && old.standardId !== p.standardId)
        fail(
          "Use the dedicated Assign standard action to preserve existing programme history.",
        );
      const item = normalizeLearner(p, s, old);
      if (u.role === "Assessor" && item.assessorId !== u.id)
        fail("Assessors can only create or retain their own caseload.", 403);
      setReviewSeries(s, item, old, p, u, { date, fail });
      if (old) Object.assign(old, item);
      else s.learners.push(item);
      return { learnerId: item.id };
    }
    case "learners.importTracker": {
      requireRole(u, ["Manager"]);
      const previousEvidenceIds = s.evidence.map((e) => e.id);
      let result;
      try {
        result = importTracker(s, p.sheetRows, {
          makeId: id,
          actorId: u.id,
          importedAt: new Date().toISOString(),
          replaceFictional: true,
        });
      } catch (error) {
        fail(error.message);
      }
      for (const learnerId of result.removedIds)
        db.prepare("DELETE FROM files WHERE learner_id=?").run(learnerId);
      const remainingEvidenceIds = new Set(s.evidence.map((e) => e.id));
      for (const evidenceId of previousEvidenceIds)
        if (!remainingEvidenceIds.has(evidenceId)) {
          db.prepare("DELETE FROM evidence_text WHERE evidence_id=?").run(
            evidenceId,
          );
          db.prepare("DELETE FROM integrity_jobs WHERE evidence_id=?").run(
            evidenceId,
          );
        }
      syncReviewParticipants(s);
      return {
        ...result,
        removedFictional: result.removedIds.length,
        removedIds: undefined,
      };
    }
    case "learners.import": {
      requireRole(u, ["Manager"]);
      if (!Array.isArray(p.rows) || !p.rows.length || p.rows.length > 1000)
        fail("Import between 1 and 1,000 records.");
      for (const row of p.rows) {
        const old = s.learners.find((l) => l.ref === row.ref);
        if (old && old.standardId !== row.standardId)
          fail(
            "Use Assign standard for programme changes so existing records retain their history.",
          );
        const item = normalizeLearner(row, s, old);
        setReviewSeries(s, item, old, row, u, { date, fail });
        if (old) Object.assign(old, item);
        else s.learners.push(item);
      }
      return { count: p.rows.length };
    }
    case "learner.assignStandard": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      const standard = s.standards.find((x) => x.id === p.standardId);
      if (!standard) fail("Select a valid standard.");
      if (standard.id === l.standardId)
        fail("This standard is already assigned.");
      const reason = text(p.reason, "Assignment reason", 2000);
      const target = number(p.target, "Target progress");
      const otjTarget = number(p.otjTarget, "Learning target", 1, 10000);
      // Bind pre-migration evidence and hours before changing the active programme.
      for (const key of ["evidence", "otj"])
        for (const record of s[key]) {
          if (record.learnerId === l.id && !record.standardId)
            record.standardId = l.standardId;
        }
      l.programmeHistory ||= [];
      l.programmeHistory.push({
        standardId: l.standardId,
        changedAt: new Date().toISOString(),
        by: u.id,
        reason,
        progress: derive(l, s).progress,
        hours: derive(l, s).hours,
        gatewayStatus: l.gatewayStatus,
        gatewayDate: l.gatewayDate,
        epaDate: l.epaDate,
      });
      l.standardId = standard.id;
      l.level = standard.level;
      l.target = target;
      l.otjTarget = otjTarget;
      l.gatewayStatus = "Not ready";
      l.gatewayDate = "";
      l.epaDate = "";
      l.gatewayNotes = "";
      l.gatewayBy = "";
      if (l.initialReviewDate) syncReviewSeries(s, l);
      return { learnerId: l.id };
    }
    case "standard.save": {
      requireRole(u, ["Manager", "IQA"]);
      const existing = p.id ? s.standards.find((x) => x.id === p.id) : null;
      if (p.id && !existing) fail("Standard not found.", 404);
      if (
        !Array.isArray(p.criteria) ||
        (!p.criteria.length && (!existing || existing.criteria.length > 0)) ||
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
      if (
        s.standards.some(
          (x) =>
            x.id !== existing?.id &&
            ((
              x.reference.match(/^ST\d{4}/i)?.[0] || x.reference.trim()
            ).toLowerCase() ===
              (
                String(p.reference).match(/^ST\d{4}/i)?.[0] ||
                String(p.reference).trim()
              ).toLowerCase() ||
              courseName(x.name) === courseName(p.name)),
        )
      )
        fail(
          "This course already has a standard. Only one version per course is allowed.",
        );
      if (existing) {
        const removed = existing.criteria.filter(
          (c) => !criteria.some((n) => n.code === c.code),
        );
        const used = [
          ...s.evidence,
          ...s.samplingPlans,
          ...s.learningPlans,
          ...s.appointments,
          ...s.quality,
          ...s.otj,
        ];
        if (
          removed.some((c) =>
            used.some(
              (r) =>
                (r.standardId === existing.id ||
                  (!r.standardId &&
                    s.learners.some(
                      (l) =>
                        l.id === r.learnerId && l.standardId === existing.id,
                    ))) &&
                [...(r.criteria || []), ...(r.ksbs || [])].includes(c.code),
            ),
          )
        )
          fail(
            "A criterion used in learner records cannot be removed or renamed. You can edit its wording.",
          );
      }
      const saved = {
        id: existing?.id || id(),
        name: text(p.name, "Standard title", 200),
        reference: text(p.reference, "Standard reference", 100),
        version: text(p.version, "Version", 100),
        level: number(p.level, "Level", 2, 7),
        criteria,
      };
      if (existing) Object.assign(existing, saved);
      else s.standards.push(saved);
      for (const learner of s.learners.filter((l) => l.standardId === saved.id))
        learner.level = saved.level;
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
      if (old?.standardId && old.standardId !== l.standardId)
        fail("Archived programme evidence is read-only.");
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
        standardId: l.standardId,
        title: text(p.title, "Evidence title", 200),
        type: text(p.type, "Evidence type", 80),
        date: date(p.date, "evidence date", true),
        description: text(p.description, "Reflection", 20000),
        criteria: [...new Set(p.criteria)],
        status,
        epaSelected: old?.epaSelected || false,
        feedback: old?.feedback || "",
        files: [...(old?.files || []), ...uploadFiles(p.files || [], l.id)],
        by: old?.by || u.id,
        updated: new Date().toISOString(),
        decisions: old?.decisions || [],
      };
      if (item.files.length > 10) fail("Maximum 10 files per evidence item.");
      integrity.enqueue(item);
      if (old) Object.assign(old, item);
      else s.evidence.push(item);
      break;
    }
    case "evidence.submit": {
      requireRole(u, [...editors, "Apprentice"]);
      const e = s.evidence.find((x) => x.id === p.id);
      if (!e) fail("Evidence not found.", 404);
      const programmeLearner = learnerFor(s, u, e.learnerId);
      if (e.standardId && e.standardId !== programmeLearner.standardId)
        fail("Archived programme evidence is read-only.");
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
      const programmeLearner = learnerFor(s, u, e.learnerId);
      if (e.standardId && e.standardId !== programmeLearner.standardId)
        fail("Archived programme evidence is read-only.");
      if (e.status !== "Submitted")
        fail("Only submitted evidence can be assessed.");
      e.status = choice(
        p.status,
        ["Accepted", "Changes requested"],
        "decision",
      );
      e.feedback = text(p.feedback, "Assessor feedback", 20000);
      e.feedbackFiles = uploadFiles(p.files || [], e.learnerId);
      e.updated = new Date().toISOString();
      e.decisions ||= [];
      e.decisions.push({
        by: u.id,
        date: e.updated,
        status: e.status,
        feedback: e.feedback,
        files: e.feedbackFiles,
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
        standardId: l.standardId,
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
      const programmeLearner = learnerFor(s, u, x.learnerId);
      if (x.standardId && x.standardId !== programmeLearner.standardId)
        fail("Archived programme learning logs are read-only.");
      if (x.status !== "Pending") fail("This log has already been reviewed.");
      x.status = choice(p.status, ["Approved", "Returned"], "decision");
      x.feedback = optional(p.feedback);
      x.reviewedBy = u.id;
      break;
    }
    case "review.add": {
      requireRole(u, editors);
      if (!l) fail("Select a learner.");
      const template = normalizeReview(p, {
        s,
        l,
        u,
        text,
        choice,
        number,
        date,
        fail,
        canSee,
      });
      const r = {
        template,
        createdAt: new Date().toISOString(),
        id: id(),
        learnerId: l.id,
        date: date(p.date, "review date", true),
        nextDate: date(p.nextDate, "next review date", true),
        type: text(p.type, "Review type", 80),
        text: text(p.text, "Review discussion", 20000),
        actions: template.targets
          .map(
            (t) =>
              `${t.category}: ${t.what}\nSteps: ${t.how}${t.why ? `\nPurpose: ${t.why}` : ""}\nOwner: ${t.ownerName} · Due: ${t.due}`,
          )
          .join("\n\n"),
        by: u.id,
        acknowledgements: [],
        appointmentId: optional(p.appointmentId, 100),
        location: optional(p.location, 1000),
        learnerVoice: optional(p.learnerVoice, 10000),
        employerVoice: optional(p.employerVoice, 10000),
        wellbeing: optional(p.wellbeing, 10000),
        nextObjectives: optional(p.nextObjectives, 10000),
      };
      if (r.date > today())
        fail(
          "Completed reviews cannot be dated in the future. Schedule a review in the calendar instead.",
        );
      if (
        !r.appointmentId &&
        l.initialReviewDate &&
        ["Progress review", "Tripartite review", "Gateway review"].includes(
          r.type,
        )
      ) {
        const occurrence = s.appointments.find(
          (a) =>
            a.learnerId === l.id &&
            a.standardId === l.standardId &&
            a.source === "ten-week-review" &&
            a.status === "Planned" &&
            a.date === r.template.dueDate,
        );
        if (occurrence) r.appointmentId = occurrence.id;
      }
      if (r.appointmentId) {
        const appointment = s.appointments.find(
          (a) => a.id === r.appointmentId && a.learnerId === l.id,
        );
        if (
          !appointment ||
          appointment.status === "Cancelled" ||
          appointment.reviewId
        )
          fail("Scheduled review not found, cancelled or already recorded.");
        appointment.status = "Completed";
        appointment.reviewId = r.id;
        appointment.updated = new Date().toISOString();
        appointment.outcomeNotes = r.text;
        appointment.attendance = "Attended";
        appointment.sequence = (appointment.sequence || 0) + 1;
      }
      if (r.nextDate <= r.date) fail("Next review must be after this review.");
      r.targetPlanIds = [];
      r.targetTaskIds = template.targets.map((t) => {
        const task = {
          id: id(),
          learnerId: l.id,
          title: t.what,
          description: t.how + (t.why ? `\nPurpose: ${t.why}` : ""),
          owner: t.owner,
          due: t.due,
          status: "Open",
          by: u.id,
          reviewId: r.id,
          category: t.category,
        };
        s.tasks.push(task);
        const activity = {
          id: id(),
          learnerId: l.id,
          standardId: l.standardId,
          title: t.what.slice(0, 200),
          description: t.how,
          objectives: t.what,
          criteria: [],
          resources: [],
          startDate: r.date,
          due: t.due,
          plannedHours: t.hours || 0,
          method: t.category === "Support" ? "Learner support" : "Review",
          status: "Planned",
          outcomeNotes: "",
          by: u.id,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          reflection: "",
          sessionId: "",
          reviewId: r.id,
          reviewTaskId: task.id,
        };
        s.learningPlans.push(activity);
        r.targetPlanIds.push(activity.id);
        return task.id;
      });
      s.reviews.push(r);
      l.lastReview = r.date;
      l.nextReview = l.initialReviewDate ? nextSeriesReview(s, l) : r.nextDate;
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
          name: u.name,
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
    case "task.setStatus":
    case "task.toggle": {
      const t = s.tasks.find((x) => x.id === p.id);
      if (!t) fail("Action not found.", 404);
      learnerFor(s, u, t.learnerId);
      if (!editors.includes(u.role) && t.owner !== u.id)
        fail("Only the owner or assessor can update an action.", 403);
      const status =
        kind === "task.setStatus"
          ? choice(p.status, ["Open", "Complete"], "action status")
          : ["Complete", "Completed"].includes(t.status)
            ? "Open"
            : "Complete";
      if (t.status !== status) {
        t.status = status;
        if (status === "Complete") {
          t.completedAt = new Date().toISOString();
          t.completedBy = u.id;
        } else {
          delete t.completedAt;
          delete t.completedBy;
        }
        for (const activity of s.learningPlans.filter(
          (a) => a.reviewTaskId === t.id,
        )) {
          activity.status = status === "Complete" ? "Completed" : "In progress";
          activity.outcomeNotes =
            status === "Complete"
              ? "Completed from the linked review action."
              : "";
          activity.updated = new Date().toISOString();
        }
      }
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
      const plan = p.planId
        ? s.samplingPlans.find(
            (x) =>
              x.id === p.planId &&
              x.learnerId === e.learnerId &&
              x.status === "Planned",
          )
        : null;
      if (p.planId && !plan) fail("Active sampling plan not found.");
      const criteria = plan
        ? plan.criteria.filter((c) => e.criteria.includes(c))
        : e.criteria;
      if (
        plan &&
        ((!e.standardId
          ? s.learners.find((l) => l.id === e.learnerId)?.standardId
          : e.standardId) !== plan.standardId ||
          !criteria.length ||
          (plan.evidenceIds.length && !plan.evidenceIds.includes(e.id)))
      )
        fail(
          "Evidence must match the sampling plan, standard and selected KSBs.",
        );
      s.quality.push({
        planId: plan?.id || null,
        criteria,
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
      const pw = validateNewPassword(p.password);
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
      password(user.id, pw, true);
      syncReviewParticipants(s);
      break;
    }
    case "user.update": {
      requireRole(u, ["Manager"]);
      const account = s.users.find((x) => x.id === p.id);
      if (!account) fail("Account not found.", 404);
      const role = choice(p.role, roles, "role");
      const email = text(p.email, "Email", 200).toLowerCase();
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        s.users.some(
          (x) => x.id !== account.id && x.email.toLowerCase() === email,
        )
      )
        fail("Use a unique valid email.");
      if (account.id === u.id && role !== "Manager")
        fail("You cannot remove your own administrator access.");
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
      if (
        role !== account.role &&
        s.learners.some(
          (l) => l.assessorId === account.id || l.iqaId === account.id,
        )
      )
        fail(
          "Reassign this account's assessor/IQA caseload before changing its role.",
        );
      if (
        !Array.isArray(p.caseload) ||
        p.caseload.some((id) => !s.learners.some((l) => l.id === id))
      )
        fail("Choose valid caseload learners.");
      const name = text(p.name, "Name", 160);
      const securityChanged =
        email !== account.email ||
        role !== account.role ||
        p.learnerId !== (account.learnerId || "") ||
        p.employer !== (account.employer || "");
      Object.assign(account, { name, email, role });
      delete account.learnerId;
      delete account.employer;
      if (role === "Apprentice") account.learnerId = p.learnerId;
      if (role === "Employer") account.employer = p.employer;
      if (["Assessor", "IQA"].includes(role)) {
        const key = role === "Assessor" ? "assessorId" : "iqaId";
        for (const learner of s.learners) {
          if (p.caseload.includes(learner.id)) learner[key] = account.id;
          else if (learner[key] === account.id) learner[key] = "";
        }
      }
      if (securityChanged) {
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(account.id);
        db.prepare("DELETE FROM password_resets WHERE user_id=?").run(
          account.id,
        );
      }
      syncReviewParticipants(s);
      break;
    }
    case "user.resetPassword": {
      requireRole(u, ["Manager"]);
      const account = s.users.find((x) => x.id === p.id && x.active);
      if (!account) fail("Active account not found.", 404);
      if (account.id === u.id) fail("Change your own password in Settings.");
      if (!demo || mail.status().configured) {
        const result = mail.reset(account);
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(account.id);
        return result;
      }
      const temporaryPassword = randomBytes(18).toString("base64url");
      password(account.id, temporaryPassword, true);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(account.id);
      return { temporaryPassword };
    }
    case "user.setActive": {
      requireRole(u, ["Manager"]);
      const account = s.users.find((x) => x.id === p.id);
      if (!account) fail("Account not found.", 404);
      if (typeof p.active !== "boolean") fail("Invalid account status.");
      if (account.id === u.id && !p.active)
        fail("You cannot deactivate your own account.");
      account.active = p.active;
      syncReviewParticipants(s);
      if (!p.active) {
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(account.id);
        db.prepare("DELETE FROM password_resets WHERE user_id=?").run(
          account.id,
        );
      }
      return {};
    }
    case "notifications.preferences": {
      if (typeof p.morningDigest !== "boolean")
        fail("Choose a valid email preference.");
      s.users.find((x) => x.id === u.id).morningDigest = p.morningDigest;
      return {};
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
      const pw = validateNewPassword(p.password);
      password(u.id, pw);
      db.prepare("DELETE FROM password_resets WHERE user_id=?").run(u.id);
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
      Object.assign(
        s,
        { learningPlans: [], ...JSON.parse(JSON.stringify(snap.data)) },
        {
          users,
          audit,
          revision,
          snapshots,
        },
      );
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
  if (process.env.COOKIE_SECURE === "1")
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  try {
    const requestUrl = new URL(req.url, "http://local");
    const path = requestUrl.pathname;
    const cookieName = path.startsWith("/api/")
      ? sessionCookieName(req.headers, requestUrl, req.method)
      : "archetype_session";
    if (path.startsWith("/api/")) {
      if (req.method !== "GET") {
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          fail("JSON requests required.", 415);
        if (
          req.headers.origin &&
          !origins.allows(req.headers.origin, req.headers.host)
        )
          fail(origins.rejection(req.headers.origin), 403);
      }
      if (path === "/api/health") {
        db.prepare("SELECT 1").get();
        return json(res, 200, { ok: true });
      }
      if (
        ["/api/password/forgot", "/api/password/reset"].includes(path) &&
        req.method === "POST"
      ) {
        const key = `reset:${req.socket.remoteAddress}`,
          now = Date.now();
        const record = attempts.get(key) || { count: 0, until: now + 600000 };
        if (record.until < now) {
          record.count = 0;
          record.until = now + 600000;
        }
        record.count++;
        attempts.set(key, record);
        if (record.count > 10)
          fail("Too many requests. Try again in 10 minutes.", 429);
        const p = await body(req);
        if (path.endsWith("/reset")) {
          mail.redeem(p.token, p.password);
          return json(res, 200, { ok: true });
        }
        if (!mail.status().configured)
          fail(
            "Password recovery email is not configured. Contact your administrator.",
            503,
          );
        const account = get().users.find(
          (u) => u.active && u.email === String(p.email).trim().toLowerCase(),
        );
        if (account) mail.reset(account);
        return json(res, 200, {
          message:
            "If an active account matches that email, a reset link will be emailed shortly.",
        });
      }
      if (path === "/api/login" && req.method === "POST") {
        const p = await body(req);
        const email = String(p.email ?? "")
          .trim()
          .toLowerCase()
          .slice(0, 200);
        const key = `login:${req.socket.remoteAddress}:${email}`,
          now = Date.now(),
          record = attempts.get(key) || { count: 0, until: now + 600000 };
        if (record.until < now) {
          record.count = 0;
          record.until = now + 600000;
        }
        if (record.count >= 30)
          fail("Too many attempts. Try again in 10 minutes.", 429);
        const s = get(),
          u = s.users.find(
            (x) =>
              x.email.toLowerCase() === String(p.email).trim().toLowerCase() &&
              x.active,
          ),
          c = u
            ? db.prepare("SELECT * FROM credentials WHERE user_id=?").get(u.id)
            : null;
        const validCandidate =
          typeof p.password === "string" && p.password.length <= 200;
        const hash = scryptSync(
          typeof p.password === "string" ? p.password.slice(0, 200) : "",
          c?.salt || "dummy-salt",
          64,
        );
        if (
          !c ||
          !validCandidate ||
          !timingSafeEqual(hash, Buffer.from(c.hash, "hex"))
        ) {
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
          `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
        );
        return json(res, 200, {
          user: { ...u, mustChangePassword: !!c.must_change },
        });
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
        .find((x) => x.startsWith(cookieName + "="))
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
          `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
        );
        return json(res, 200, { ok: true });
      }
      if (path === "/api/state" && req.method === "GET")
        return json(res, 200, {
          user: {
            ...u,
            mustChangePassword: !!db
              .prepare("SELECT must_change FROM credentials WHERE user_id=?")
              .get(u.id)?.must_change,
          },
          state: db
            .prepare("SELECT must_change FROM credentials WHERE user_id=?")
            .get(u.id)?.must_change
            ? { revision: s.revision, learners: [] }
            : visible(s, u),
          demo,
        });
      const passwordRequired = !!db
        .prepare("SELECT must_change FROM credentials WHERE user_id=?")
        .get(u.id)?.must_change;
      if (passwordRequired && path !== "/api/command")
        fail(
          "Change your temporary password before accessing workspace data.",
          403,
        );
      if (path === "/api/email/status" && req.method === "GET") {
        requireRole(u, ["Manager"]);
        return json(res, 200, mail.status());
      }
      if (path === "/api/admin/backups" && req.method === "GET") {
        requireRole(u, ["Manager"]);
        return json(res, 200, {
          ...(await backups.status()),
          production: !demo,
          secureCookies: process.env.COOKIE_SECURE === "1",
          persistentDirectoryConfigured: !!process.env.DATA_DIR,
        });
      }
      if (path === "/api/admin/backups" && req.method === "POST") {
        requireRole(u, ["Manager"]);
        await body(req);
        const result = await backups.create();
        const current = get();
        current.audit.unshift({
          id: id(),
          by: u.id,
          actor: u.name,
          role: u.role,
          action: "backup.create",
          learnerId: null,
          date: new Date().toISOString(),
        });
        current.revision++;
        put(current);
        return json(res, 200, result);
      }
      if (path.startsWith("/api/admin/backups/") && req.method === "GET") {
        requireRole(u, ["Manager"]);
        const file = await backups.downloadPath(
          decodeURIComponent(path.split("/").at(-1)),
        );
        if (!file) fail("Backup not found.", 404);
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition":
            'attachment; filename="' + file.split("/").at(-1) + '"',
          "Cache-Control": "no-store",
        });
        return res.end(readFileSync(file));
      }
      if (path.startsWith("/api/epa/") && req.method === "GET") {
        if (u.role === "Employer")
          fail(
            "EPA exports are restricted to the learner and assessment staff.",
            403,
          );
        const learnerId = decodeURIComponent(
          path.slice("/api/epa/".length).replace(/\.zip$/, ""),
        );
        const learner = learnerFor(s, u, learnerId);
        const evidence = s.evidence.filter(
          (e) =>
            e.learnerId === learner.id &&
            e.epaSelected &&
            e.status === "Accepted" &&
            (!e.standardId || e.standardId === learner.standardId),
        );
        if (!evidence.length)
          fail("Select accepted evidence for the EPA portfolio first.");
        const zip = new JSZip();
        let bytes = 0;
        const manifest = [];
        for (const e of evidence) {
          manifest.push({
            id: e.id,
            title: e.title,
            type: e.type,
            date: e.date,
            description: e.description,
            criteria: e.criteria,
            status: e.status,
            feedback: e.feedback,
            assessments: (e.decisions || []).map((d) => ({
              date: d.date,
              status: d.status,
              feedback: d.feedback,
              assessor:
                s.users.find((account) => account.id === d.by)?.name ||
                "Assessment staff",
            })),
          });
          const includedFiles = new Set();
          for (const f of [
            ...e.files,
            ...(e.feedbackFiles || []),
            ...(e.decisions || []).flatMap((d) => d.files || []),
          ]) {
            if (includedFiles.has(f.id)) continue;
            includedFiles.add(f.id);
            const file = db
              .prepare("SELECT * FROM files WHERE id=? AND learner_id=?")
              .get(f.id, learner.id);
            if (!file) continue;
            bytes += file.body.length;
            if (bytes > 100 * 1024 * 1024)
              fail(
                "EPA export exceeds 100 MB; select fewer evidence items.",
                413,
              );
            zip.file(
              `${e.id}/${f.id}-${f.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}`,
              file.body,
            );
          }
        }
        zip.file(
          "portfolio.json",
          JSON.stringify(
            {
              learner: learner.name,
              reference: learner.ref,
              standard: s.standards.find((st) => st.id === learner.standardId)
                ?.name,
              evidence: manifest,
            },
            null,
            2,
          ),
        );
        zip.file(
          "portfolio.txt",
          `EPA portfolio\n${learner.name} · ${learner.ref}\n\n` +
            manifest
              .map(
                (e, index) =>
                  `${index + 1}. ${e.title}\nMethod: ${e.type}\nDate: ${e.date}\nKSBs: ${e.criteria.join(", ")}\n\n${e.description}\n\nAssessor feedback: ${e.feedback || ""}\nAttachments: ${e.id}/\n`,
              )
              .join("\n"),
        );
        const archive = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        });
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="epa-portfolio.zip"',
          "Cache-Control": "no-store",
        });
        return res.end(archive);
      }
      if (path === "/api/calendar.ics" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="archetype-calendar.ics"',
          "Cache-Control": "no-store",
        });
        return res.end(calendarICS(visible(s, u)));
      }
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
        if (passwordRequired && p.kind !== "password.change")
          fail(
            "Change your temporary password before making other changes.",
            403,
          );
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

backups.start();
mail.start();
integrity.start();
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    backups.stop();
    mail.stop();
    integrity.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
