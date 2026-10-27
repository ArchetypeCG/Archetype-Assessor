import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createLearnerNotifications } from "../server/learner-notifications.mjs";
function fixture() {
  const db = new DatabaseSync(":memory:");
  const service = createLearnerNotifications({
    db,
    canSee: (u, l) =>
      u.role === "Apprentice"
        ? u.learnerId === l.id
        : u.employer === l.employer,
  });
  const a = { id: "a", role: "Apprentice", learnerId: "l", active: true },
    e = { id: "e", role: "Employer", employer: "Acme", active: true },
    other = {
      id: "other",
      role: "Apprentice",
      learnerId: "other",
      active: true,
    },
    assessor = { id: "s", role: "Assessor", name: "Assessor" };
  const s = {
    users: [a, e, other],
    learners: [{ id: "l", name: "Learner", employer: "Acme" }],
    evidence: [],
    otj: [],
    tasks: [],
    reviews: [],
    learningPlans: [],
    appointments: [],
    messages: [],
  };
  return { db, service, s, a, e, other, assessor };
}
test("returned work and OTJ alerts are recipient scoped, deduplicate, preserve clear/read state and reflect resolved actions", () => {
  const { db, service, s, a, e, other, assessor } = fixture();
  s.evidence.push({
    id: "work",
    learnerId: "l",
    title: "Report",
    status: "Submitted",
    date: "2026-10-01",
  });
  const previous = service.before(s, "evidence.assess", { id: "work" });
  Object.assign(s.evidence[0], {
    status: "Changes requested",
    updated: "2026-10-27T09:00:00Z",
  });
  service.publish(s, assessor, "evidence.assess", { id: "work" }, {}, previous);
  assert.equal(service.list(s, a).length, 1);
  assert.equal(service.list(s, e).length, 1);
  assert.equal(service.list(s, other).length, 0);
  let n = service.list(s, a)[0];
  assert.equal(n.needsAction, true);
  service.update(s, a, "notification.clear", { id: n.id });
  assert.ok(service.list(s, a)[0].clearedAt);
  assert.ok(service.list(s, a)[0].readAt);
  assert.equal(service.list(s, e)[0].readAt, null);
  assert.throws(
    () => service.update(s, other, "notification.clear", { id: n.id }),
    /not found/,
  );
  service.update(s, a, "notification.restore", { id: n.id });
  assert.equal(service.list(s, a)[0].clearedAt, null);
  s.evidence[0].status = "Accepted";
  assert.equal(service.list(s, a)[0].needsAction, false);
  s.otj.push({
    id: "hours",
    learnerId: "l",
    status: "Returned",
    reviewedAt: "2026-10-27T10:00:00Z",
  });
  assert.equal(
    service.list(s, a).filter((n) => n.entityType === "otj").length,
    1,
  );
  assert.equal(service.list(s, a).length, 2);
  db.close();
});
test("private staff, medical, ALS and supervision updates generate no learner or employer notifications", () => {
  const { db, service, s, a, e, assessor } = fixture();
  for (const kind of [
    "learner.support.save",
    "learner.privateNote",
    "staff.oneToOne.save",
    "staff.cpd.save",
    "assessorAction.save",
  ])
    service.publish(s, assessor, kind, { learnerId: "l" }, {}, "");
  assert.equal(service.list(s, a).length, 0);
  assert.equal(service.list(s, e).length, 0);
  const l = s.learners[0];
  const previous = service.before(s, "learner.save", { id: l.id });
  l.notes = "CONFIDENTIAL";
  l.address = "SECRET";
  service.publish(s, assessor, "learner.save", { id: l.id }, {}, previous);
  assert.equal(service.list(s, a).length, 0);
  db.close();
});
test("shared sessions notify while private session notes do not; direct messages reach only the intended recipient", () => {
  const { db, service, s, a, e, assessor } = fixture();
  s.appointments.push({
    id: "session",
    learnerId: "l",
    title: "Review",
    date: "2099-01-01",
    status: "Planned",
    updated: "v1",
    participants: ["a", "e"],
  });
  service.publish(s, assessor, "session.save", { id: "session" }, {}, "");
  const previous = service.before(s, "session.save", { id: "session" });
  s.appointments[0].staffNotes = "PRIVATE";
  s.appointments[0].updated = "v2";
  service.publish(s, assessor, "session.save", { id: "session" }, {}, previous);
  assert.equal(service.list(s, a).length, 1);
  s.messages.push({
    id: "m",
    to: "a",
    date: "2026-10-27",
    body: "PRIVATE MESSAGE",
  });
  service.publish(s, assessor, "message.send", {}, {}, "");
  assert.equal(service.list(s, a).length, 2);
  assert.equal(service.list(s, e).length, 1);
  assert.ok(!JSON.stringify(service.list(s, a)).includes("PRIVATE"));
  service.update(s, a, "notifications.readAll", {});
  assert.ok(service.list(s, a).every((n) => n.readAt));
  db.close();
});
