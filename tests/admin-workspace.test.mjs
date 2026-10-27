import { test } from "node:test";
import assert from "node:assert/strict";
import { adminWorkspace } from "../src/admin-workspace.mjs";
import { alertFingerprint } from "../server/alerts.mjs";
const learner = (id, extra = {}) => ({
  id,
  name: id,
  status: "Active",
  standardId: "std",
  assessorId: "a",
  exceptions: [],
  ...extra,
});
test("admin priorities respect cleared issues and active records and rank dated urgent issues first", () => {
  const red = {
      severity: "Red",
      type: "review",
      text: "Review overdue",
      date: "2026-10-01",
    },
    amber = { severity: "Amber", type: "data", text: "Dates missing" };
  const cleared = learner("cleared", { exceptions: [red] });
  const s = {
    learners: [
      learner("amber", { exceptions: [amber] }),
      learner("red", { exceptions: [amber, red] }),
      learner("completed", { status: "Completed", exceptions: [red] }),
      cleared,
    ],
    alertDismissals: [
      { learnerId: cleared.id, key: alertFingerprint(cleared, red) },
    ],
  };
  assert.deepEqual(
    adminWorkspace(s).issues.map((i) => i.learner.id),
    ["red", "amber"],
  );
  assert.equal(adminWorkspace(s).issues[0].exception.text, "Review overdue");
});
test("delivery week uses UK dates and real upcoming appointments, excluding old programmes and closed bookings", () => {
  const booking = (id, extra = {}) => ({
    id,
    learnerId: "l",
    standardId: "std",
    date: "2026-07-01",
    time: "10:00",
    endTime: "11:00",
    status: "Planned",
    ...extra,
  });
  const s = {
    learners: [learner("l")],
    appointments: [
      booking("past", { time: "08:00", endTime: "09:00" }),
      booking("cancelled", { status: "Cancelled" }),
      booking("done", { attendance: "Attended" }),
      booking("old", { standardId: "previous" }),
      booking("later", { date: "2026-07-07" }),
      booking("outside", { date: "2026-07-08" }),
      booking("current"),
    ],
  };
  const result = adminWorkspace(s, new Date("2026-07-01T09:30:00Z"));
  assert.deepEqual(
    result.events.map((e) => e.appointment.id),
    ["current", "later"],
  );
  assert.equal(result.last, "2026-07-07");
  assert.equal(
    adminWorkspace(s, new Date("2026-06-30T23:30:00Z")).day,
    "2026-07-01",
  );
});
test("team ownership counts only current active caseload work, retains inactive staff with learners and flags unassigned learners", () => {
  const s = {
    users: [
      { id: "a", name: "Assessor", role: "Assessor", active: true },
      { id: "b", name: "Inactive colleague", role: "Assessor", active: false },
    ],
    learners: [
      learner("own"),
      learner("inactive-staff", { assessorId: "b" }),
      learner("unassigned", { assessorId: "" }),
      learner("closed", { status: "Completed" }),
    ],
    evidence: [
      { learnerId: "own", status: "Submitted" },
      { learnerId: "own", status: "Submitted", standardId: "old" },
      { learnerId: "closed", status: "Submitted" },
    ],
    otj: [{ learnerId: "own", status: "Pending" }],
  };
  const result = adminWorkspace(s);
  assert.equal(result.team.length, 2);
  assert.equal(result.team[0].evidence, 1);
  assert.equal(result.team[0].logs, 1);
  assert.equal(result.team[0].learners, 1);
  assert.deepEqual(
    result.unassigned.map((l) => l.id),
    ["unassigned"],
  );
});
