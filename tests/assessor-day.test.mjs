import { test } from "node:test";
import assert from "node:assert/strict";
import { assessorDay } from "../src/assessor-day.mjs";
const learner = (id, extra = {}) => ({
  id,
  assessorId: "a",
  standardId: "current",
  status: "Active",
  ...extra,
});
test("day at a glance only includes the assessor’s active caseload and current programme work", () => {
  const s = {
    learners: [
      learner("own", { nextReview: "2026-10-26" }),
      learner("today", { nextReview: "2026-10-27" }),
      learner("other", { assessorId: "b", nextReview: "2026-01-01" }),
      learner("closed", { status: "Completed", nextReview: "2026-01-01" }),
    ],
    evidence: [
      { learnerId: "own", status: "Submitted" },
      { learnerId: "own", standardId: "old", status: "Submitted" },
      { learnerId: "other", status: "Submitted" },
      { learnerId: "closed", status: "Submitted" },
      { learnerId: "own", status: "Accepted" },
    ],
    otj: [
      { learnerId: "today", status: "Pending" },
      { learnerId: "today", standardId: "old", status: "Pending" },
    ],
  };
  const day = assessorDay(s, "a", new Date("2026-10-27T10:00:00Z"));
  assert.equal(day.overdueReviews, 1);
  assert.equal(day.reviewsToday, 1);
  assert.equal(day.evidence, 1);
  assert.equal(day.logs, 1);
  assert.equal(day.nextSession, null);
});
test("next session skips past, attended, cancelled, archived and unrelated bookings; includes a session underway in UK time", () => {
  const booking = (id, extra = {}) => ({
    id,
    learnerId: "own",
    date: "2026-07-01",
    time: "10:00",
    endTime: "11:00",
    status: "Planned",
    participants: ["a"],
    ...extra,
  });
  const s = {
    learners: [learner("own")],
    appointments: [
      booking("past", { time: "08:00", endTime: "09:00" }),
      booking("cancelled", { status: "Cancelled" }),
      booking("attended", { attendance: "Attended" }),
      booking("unrelated", { participants: ["b"] }),
      booking("archived", { standardId: "old" }),
      booking("tomorrow", { date: "2026-07-02" }),
      booking("underway"),
      booking("later", { time: "12:00", endTime: "13:00" }),
    ],
  };
  const now = new Date("2026-07-01T09:30:00Z");
  assert.equal(assessorDay(s, "a", now).nextSession.id, "underway");
  s.appointments.find((a) => a.id === "underway").attendance = "Did not attend";
  assert.equal(assessorDay(s, "a", now).nextSession.id, "later");
});
test("UK midnight and the 60-day gateway window use calendar dates without inventing gateway bookings", () => {
  const s = {
    learners: [
      learner("epa", { epaDate: "2026-08-01" }),
      learner("end", { predictedEnd: "2026-08-15" }),
      learner("gateway", { gatewayDate: "2026-07-12" }),
      learner("future", { plannedEnd: "2027-01-01" }),
      learner("past", { plannedEnd: "2026-06-01" }),
      learner("result", { epaDate: "2026-08-01", epaResult: "Pass" }),
      learner("unassigned", { assessorId: "b", epaDate: "2026-08-01" }),
    ],
  };
  const day = assessorDay(s, "a", new Date("2026-06-30T23:30:00Z"));
  assert.equal(day.day, "2026-07-01");
  assert.deepEqual(
    day.upcoming.map((x) => [x.learner.id, x.label]),
    [
      ["gateway", "Gateway booked"],
      ["epa", "EPA booked"],
      ["end", "Course end · plan gateway"],
    ],
  );
  assert.equal(
    assessorDay(s, "a", new Date("2026-10-26T23:30:00Z")).day,
    "2026-10-26",
  );
});
