import { randomUUID } from "node:crypto";
import { today } from "./model.mjs";
const roles = ["Apprentice", "Employer"];
const publicLearnerFields = [
  "name",
  "standardId",
  "assessorId",
  "status",
  "startDate",
  "plannedEnd",
  "predictedEnd",
  "initialReviewDate",
  "nextReview",
  "english",
  "maths",
  "englishUpskill",
  "mathsUpskill",
  "englishNotRequired",
  "mathsNotRequired",
  "epaResult",
  "epaResultDate",
  "gatewayStatus",
  "gatewayDate",
  "epaDate",
];
const publicSessionFields = [
  "title",
  "type",
  "date",
  "time",
  "endTime",
  "allDay",
  "status",
  "attendance",
  "location",
  "meetingUrl",
  "description",
  "objectives",
  "preparation",
  "outcomeNotes",
  "notes",
  "criteria",
  "resources",
  "participants",
];
const jsonFields = (record, fields) =>
  record
    ? JSON.stringify(
        Object.fromEntries(fields.map((field) => [field, record[field]])),
      )
    : "";
export function createLearnerNotifications({ db, canSee }) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS learner_notifications(id TEXT PRIMARY KEY,recipient_id TEXT NOT NULL,learner_id TEXT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,event_key TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,action_kind TEXT NOT NULL,created TEXT NOT NULL,actor_name TEXT NOT NULL,read_at TEXT,cleared_at TEXT,UNIQUE(recipient_id,event_key)); CREATE INDEX IF NOT EXISTS learner_notification_recipient ON learner_notifications(recipient_id,created);`,
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO learner_notifications(id,recipient_id,learner_id,entity_type,entity_id,event_key,title,body,action_kind,created,actor_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  );
  function ownerEligible(s, u, n) {
    if (!roles.includes(u.role) || n.recipient_id !== u.id) return false;
    if (n.learner_id)
      return s.learners.some(
        (learner) => learner.id === n.learner_id && canSee(u, learner),
      );
    return (
      n.entity_type === "message" &&
      (s.messages || []).some(
        (message) => message.id === n.entity_id && message.to === u.id,
      )
    );
  }
  function spec(type, entity, s, actorName = "Your assessor") {
    if (!entity) return null;
    const learnerId =
      entity.learnerId || (type === "programme" ? entity.id : null);
    let version =
      entity.updated ||
      entity.reviewedAt ||
      entity.createdAt ||
      entity.created ||
      entity.date ||
      entity.due ||
      "initial";
    let title = "",
      body = "",
      action = "";
    if (type === "evidence") {
      version = entity.updated || entity.date;
      title =
        entity.status === "Changes requested"
          ? "Work returned for changes"
          : entity.status === "Accepted"
            ? "Evidence accepted"
            : "Portfolio evidence updated";
      body =
        entity.status === "Changes requested"
          ? `Review the feedback on “${entity.title}” and submit your updated work.`
          : `“${entity.title}” has been updated.`;
      action = entity.status === "Changes requested" ? "evidence_return" : "";
    }
    if (type === "otj") {
      version = entity.reviewedAt || entity.updated || entity.date;
      title =
        entity.status === "Returned"
          ? "Off-the-job log returned"
          : entity.status === "Approved"
            ? "Off-the-job hours approved"
            : "Off-the-job log updated";
      body =
        entity.status === "Returned"
          ? "Review the assessor’s feedback and update your off-the-job learning record."
          : "An assessor has updated an off-the-job learning record.";
      action = entity.status === "Returned" ? "otj_return" : "";
    }
    if (type === "review") {
      title = "Review completed · targets ready";
      body =
        "Read your completed review, acknowledge it and check the agreed targets in your learning plan.";
      action = "review_ack";
    }
    if (type === "task") {
      title =
        entity.status === "Open"
          ? "An action needs attention"
          : "Action completed";
      body = entity.title;
      action = entity.status === "Open" ? "task_open" : "";
    }
    if (type === "plan") {
      title =
        entity.status === "Completed"
          ? "Learning activity completed"
          : "Learning plan updated";
      body = `“${entity.title}” is ${String(entity.status || "planned").toLowerCase()}. Open the learning plan for details.`;
      action = ["Planned", "In progress"].includes(entity.status)
        ? "plan_open"
        : "";
    }
    if (type === "session") {
      version = `${entity.sequence || 0}:${entity.updated || entity.date}`;
      title =
        entity.status === "Cancelled"
          ? "Session or review cancelled"
          : entity.attendance === "Attended"
            ? "Attendance recorded"
            : entity.attendance === "Did not attend"
              ? "Attendance updated"
              : "Session or review scheduled/updated";
      body = `${entity.title} · ${entity.date}${entity.time ? " at " + entity.time : ""}. Open the booking for details.`;
      action =
        entity.status === "Planned" && entity.attendance !== "Attended"
          ? "session_due"
          : "";
    }
    if (type === "programme") {
      version = JSON.stringify(
        publicLearnerFields.map((field) => entity[field]),
      );
      title = "Programme details updated";
      body =
        entity.epaResult && entity.epaResult !== "Not recorded"
          ? `Your recorded EPA result is ${entity.epaResult}. Open the progress report for your programme details.`
          : "Your apprentice programme details have been updated. Check the progress report and learning plan.";
    }
    if (type === "message") {
      title = "New message from " + actorName;
      body = "You have a new message. Open Messages to read it.";
      action = "message_read";
    }
    if (!title) return null;
    return {
      learnerId,
      type,
      id: entity.id,
      key: `${type}:${entity.id}:${version}:${type === "programme" ? "" : entity.status || ""}`,
      title,
      body,
      action,
      actorName,
    };
  }
  function write(recipient, notification) {
    insert.run(
      randomUUID(),
      recipient.id,
      notification.learnerId || null,
      notification.type,
      notification.id,
      notification.key,
      notification.title.slice(0, 300),
      notification.body.slice(0, 1600),
      notification.action,
      new Date().toISOString(),
      notification.actorName,
    );
  }
  function getEntity(s, kind, p, result = {}) {
    if (["evidence.assess", "evidence.save", "evidence.submit"].includes(kind))
      return [
        "evidence",
        p.id ? s.evidence.find((e) => e.id === p.id) : s.evidence.at(-1),
      ];
    if (kind === "otj.decide") return ["otj", s.otj.find((e) => e.id === p.id)];
    if (["review.add", "review.ack"].includes(kind))
      return [
        "review",
        kind === "review.add"
          ? s.reviews.at(-1)
          : s.reviews.find((e) => e.id === p.id),
      ];
    if (["task.add", "task.setStatus", "task.toggle"].includes(kind))
      return [
        "task",
        kind === "task.add"
          ? s.tasks.at(-1)
          : s.tasks.find((e) => e.id === p.id),
      ];
    if (["plan.save", "plan.reflect"].includes(kind))
      return [
        "plan",
        s.learningPlans.find((e) => e.id === (p.id || result.activityId)) ||
          (!p.id ? s.learningPlans.at(-1) : null),
      ];
    if (
      ["session.save", "appointment.add", "session.attendance"].includes(kind)
    )
      return [
        "session",
        s.appointments.find((e) => e.id === (p.id || result.sessionId)) ||
          (!p.id ? s.appointments.at(-1) : null),
      ];
    if (
      [
        "learner.save",
        "learner.assignStandard",
        "learner.functionalSkills",
        "gateway.record",
      ].includes(kind)
    )
      return [
        "programme",
        s.learners.find(
          (e) => e.id === (p.learnerId || p.id || result.learnerId),
        ),
      ];
    if (kind === "message.send") return ["message", s.messages.at(-1)];
    return [null, null];
  }
  function publicState(type, entity) {
    if (!entity) return "";
    if (type === "session") return jsonFields(entity, publicSessionFields);
    if (type === "programme") return jsonFields(entity, publicLearnerFields);
    if (type === "review")
      return JSON.stringify([entity.id, entity.acknowledgements]);
    if (type === "task")
      return JSON.stringify([
        entity.id,
        entity.status,
        entity.title,
        entity.due,
      ]);
    if (type === "plan")
      return jsonFields(entity, [
        "id",
        "title",
        "description",
        "objectives",
        "criteria",
        "resources",
        "due",
        "startDate",
        "status",
        "reflection",
        "learnerReflection",
      ]);
    return JSON.stringify(entity);
  }
  function before(s, kind, p) {
    if (
      !p.id &&
      [
        "evidence.save",
        "task.add",
        "plan.save",
        "session.save",
        "appointment.add",
        "review.add",
        "learner.save",
        "message.send",
      ].includes(kind)
    )
      return "";
    const [type, entity] = getEntity(s, kind, p);
    return publicState(type, entity);
  }
  function publish(s, actor, kind, p, result, previous) {
    if (!["Manager", "Assessor"].includes(actor.role)) return;
    const [type, entity] = getEntity(s, kind, p, result);
    if (!type || !entity || publicState(type, entity) === previous) return;
    const notification = spec(type, entity, s, actor.name);
    if (!notification) return;
    if (type === "review" && kind === "review.ack") {
      notification.title = "Review acknowledgement updated";
      notification.body =
        "Your review has an updated acknowledgement. Open the review to see its shared record.";
      notification.key += ":ack:" + (entity.acknowledgements || []).length;
    }
    const learner = s.learners.find((l) => l.id === notification.learnerId);
    for (const recipient of s.users.filter(
      (user) => user.active && roles.includes(user.role),
    )) {
      if (type === "message") {
        if (recipient.id !== entity.to) continue;
      } else if (!learner || !canSee(recipient, learner)) continue;
      write(recipient, notification);
    }
  }
  function seed(s, u) {
    if (!roles.includes(u.role)) return;
    const ids = new Set(
      s.learners
        .filter((learner) => canSee(u, learner))
        .map((learner) => learner.id),
    );
    const candidates = [];
    for (const e of s.evidence.filter(
      (e) => ids.has(e.learnerId) && e.status === "Changes requested",
    ))
      candidates.push(spec("evidence", e, s));
    for (const e of s.otj.filter(
      (e) => ids.has(e.learnerId) && e.status === "Returned",
    ))
      candidates.push(spec("otj", e, s));
    for (const e of s.reviews.filter(
      (e) =>
        ids.has(e.learnerId) &&
        !(e.acknowledgements || []).some((a) => a.by === u.id),
    ))
      candidates.push(spec("review", e, s));
    for (const e of s.tasks.filter(
      (e) =>
        ids.has(e.learnerId) &&
        e.status === "Open" &&
        (u.role === "Employer" ||
          e.owner === u.id ||
          e.ownerLearnerId === u.learnerId),
    ))
      candidates.push(spec("task", e, s));
    for (const e of (s.learningPlans || []).filter(
      (e) =>
        ids.has(e.learnerId) &&
        !e.reviewTaskId &&
        ["Planned", "In progress"].includes(e.status),
    ))
      candidates.push(spec("plan", e, s));
    for (const e of s.appointments.filter(
      (e) =>
        ids.has(e.learnerId) &&
        e.status === "Planned" &&
        e.date >= today() &&
        e.attendance !== "Attended",
    ))
      candidates.push(spec("session", e, s));
    for (const learner of s.learners.filter(
      (l) => ids.has(l.id) && l.epaResult && l.epaResult !== "Not recorded",
    ))
      candidates.push(spec("programme", learner, s));
    const existing = new Set(
      db
        .prepare(
          "SELECT entity_type,entity_id FROM learner_notifications WHERE recipient_id=?",
        )
        .all(u.id)
        .map((row) => `${row.entity_type}:${row.entity_id}`),
    );
    const pending = candidates.filter(
      (candidate) =>
        candidate && !existing.has(`${candidate.type}:${candidate.id}`),
    );
    if (!pending.length) return;
    db.exec("SAVEPOINT learner_notification_seed");
    try {
      for (const notification of pending) write(u, notification);
      db.exec("RELEASE learner_notification_seed");
    } catch (error) {
      db.exec(
        "ROLLBACK TO learner_notification_seed; RELEASE learner_notification_seed",
      );
      throw error;
    }
  }
  function actionNeeded(s, u, n) {
    if (n.action_kind === "evidence_return")
      return s.evidence.some(
        (e) => e.id === n.entity_id && e.status === "Changes requested",
      );
    if (n.action_kind === "otj_return")
      return s.otj.some((e) => e.id === n.entity_id && e.status === "Returned");
    if (n.action_kind === "review_ack")
      return s.reviews.some(
        (e) =>
          e.id === n.entity_id &&
          !(e.acknowledgements || []).some((a) => a.by === u.id),
      );
    if (n.action_kind === "task_open")
      return s.tasks.some(
        (e) =>
          e.id === n.entity_id &&
          e.status === "Open" &&
          (u.role === "Employer" ||
            e.owner === u.id ||
            e.ownerLearnerId === u.learnerId),
      );
    if (n.action_kind === "plan_open")
      return (s.learningPlans || []).some(
        (e) =>
          e.id === n.entity_id && ["Planned", "In progress"].includes(e.status),
      );
    if (n.action_kind === "session_due")
      return s.appointments.some(
        (e) =>
          e.id === n.entity_id &&
          e.status === "Planned" &&
          e.attendance !== "Attended" &&
          e.date >= today() &&
          (u.role === "Apprentice" || (e.participants || []).includes(u.id)),
      );
    return n.action_kind === "message_read" && !n.read_at;
  }
  function list(s, u) {
    if (!roles.includes(u.role)) return [];
    seed(s, u);
    return db
      .prepare(
        "SELECT * FROM learner_notifications WHERE recipient_id=? ORDER BY created DESC,id DESC",
      )
      .all(u.id)
      .filter((n) => ownerEligible(s, u, n))
      .map((n) => ({
        id: n.id,
        learnerId: n.learner_id,
        entityType: n.entity_type,
        entityId: n.entity_id,
        title: n.title,
        body: n.body,
        actorName: n.actor_name,
        created: n.created,
        readAt: n.read_at,
        clearedAt: n.cleared_at,
        needsAction: actionNeeded(s, u, n),
        actionLabel:
          u.role === "Employer" &&
          ["evidence_return", "otj_return", "task_open", "plan_open"].includes(
            n.action_kind,
          )
            ? "Apprentice action needed"
            : "Action needed",
      }));
  }
  function update(s, u, kind, p) {
    if (!roles.includes(u.role))
      throw Object.assign(
        Error("Only the recipient can manage these alerts."),
        { status: 403 },
      );
    const items =
      kind === "notifications.readAll"
        ? db
            .prepare(
              "SELECT * FROM learner_notifications WHERE recipient_id=? AND cleared_at IS NULL",
            )
            .all(u.id)
            .filter((n) => ownerEligible(s, u, n))
        : [
            db
              .prepare(
                "SELECT * FROM learner_notifications WHERE id=? AND recipient_id=?",
              )
              .get(p.id, u.id),
          ];
    if (items.some((n) => !n || !ownerEligible(s, u, n)))
      throw Object.assign(Error("Alert not found."), { status: 404 });
    const timestamp = new Date().toISOString();
    for (const n of items) {
      if (kind === "notification.clear")
        db.prepare(
          "UPDATE learner_notifications SET cleared_at=?,read_at=COALESCE(read_at,?) WHERE id=?",
        ).run(timestamp, timestamp, n.id);
      else if (kind === "notification.restore")
        db.prepare(
          "UPDATE learner_notifications SET cleared_at=NULL WHERE id=?",
        ).run(n.id);
      else if (kind === "notification.unread")
        db.prepare(
          "UPDATE learner_notifications SET read_at=NULL,cleared_at=NULL WHERE id=?",
        ).run(n.id);
      else
        db.prepare("UPDATE learner_notifications SET read_at=? WHERE id=?").run(
          timestamp,
          n.id,
        );
    }
    return { count: items.length };
  }
  return { before, publish, list, update };
}
