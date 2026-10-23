import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  syncReviewSeries,
  REVIEW_SERIES_SOURCE,
} from "../server/review-series.mjs";
import { calendarICS } from "../server/scheduling.mjs";
function workspace() {
  const l = {
    id: "learner",
    standardId: "course",
    name: "Test apprentice",
    assessorId: "assessor",
    employer: "Test employer",
    initialReviewDate: "2026-09-01",
    predictedEnd: "2027-03-30",
    status: "Active",
    reviewScheduleBy: "manager",
  };
  return {
    l,
    s: {
      learners: [l],
      appointments: [],
      users: [
        { id: "assessor", role: "Assessor", active: true },
        { id: "apprentice", role: "Apprentice", learnerId: l.id, active: true },
        {
          id: "employer",
          role: "Employer",
          employer: l.employer,
          active: true,
        },
        {
          id: "foreign",
          role: "Employer",
          employer: "Another employer",
          active: true,
        },
      ],
    },
  };
}
test("70-day review dates survive DST and leap years, and the final cycle respects the inclusive course boundary", () => {
  assert.equal(addDays("2026-09-01", 70), "2026-11-10");
  assert.equal(addDays("2028-01-01", 70), "2028-03-11");
  const { s, l } = workspace();
  syncReviewSeries(s, l);
  assert.deepEqual(
    s.appointments.map((a) => a.date),
    ["2026-09-01", "2026-11-10", "2027-01-19", "2027-03-30"],
  );
  assert(
    s.appointments.every(
      (a) => a.date <= l.predictedEnd && a.allDay && a.time === "",
    ),
  );
  const ids = s.appointments.map((a) => a.id);
  syncReviewSeries(s, l);
  assert.deepEqual(
    s.appointments.map((a) => a.id),
    ids,
  );
  const ics = calendarICS(s);
  assert.match(ics, /DTSTART;VALUE=DATE:20260901/);
  assert.match(ics, /DTEND;VALUE=DATE:20260902/);
  assert.match(ics, /TRANSP:TRANSPARENT/);
  assert(!ics.includes("NaN"));
});
test("recurrence updates preserve completed and individually changed sessions, keep manual cancellations and refresh participants", () => {
  const { s, l } = workspace();
  syncReviewSeries(s, l);
  const first = s.appointments[0],
    second = s.appointments[1],
    third = s.appointments[2];
  first.status = "Completed";
  first.notes = "Historic notes";
  second.date = "2026-11-11";
  second.seriesOverride = true;
  second.time = "10:30";
  second.allDay = false;
  second.notes = "Agreed with participants";
  third.status = "Cancelled";
  third.seriesOverride = true;
  third.seriesRetired = false;
  l.predictedEnd = "2026-12-01";
  syncReviewSeries(s, l);
  assert.equal(s.appointments[3].status, "Cancelled");
  assert.equal(s.appointments[3].seriesRetired, true);
  l.predictedEnd = "2027-03-30";
  s.users.push({
    id: "second-employer",
    role: "Employer",
    employer: l.employer,
    active: true,
  });
  syncReviewSeries(s, l);
  assert.equal(s.appointments[3].status, "Planned");
  assert.equal(third.status, "Cancelled");
  assert.equal(first.notes, "Historic notes");
  assert.deepEqual(first.participants, ["assessor", "apprentice", "employer"]);
  assert.equal(second.date, "2026-11-11");
  assert.equal(second.notes, "Agreed with participants");
  assert(second.participants.includes("second-employer"));
  assert(!second.participants.includes("foreign"));
  assert.equal(l.nextReview, "2026-11-11");
  const count = s.appointments.length;
  l.initialReviewDate = "2026-09-02";
  syncReviewSeries(s, l);
  assert.equal(first.status, "Completed");
  assert.equal(first.date, "2026-09-01");
  assert(
    s.appointments
      .filter((a) => a.status === "Planned")
      .every((a) => a.seriesAnchor === "2026-09-02"),
  );
  assert(s.appointments.length > count);
});
test("matching booked reviews are reused, clearing or pausing retires only automatic plans", () => {
  const { s, l } = workspace();
  const manual = {
    id: "existing",
    learnerId: l.id,
    standardId: l.standardId,
    type: "Progress review",
    date: l.initialReviewDate,
    time: "09:00",
    title: "Booked progress review",
    status: "Planned",
    participants: ["assessor"],
    notes: "Keep my agenda",
  };
  s.appointments.push(manual);
  syncReviewSeries(s, l);
  assert.equal(s.appointments[0].id, "existing");
  assert.equal(manual.source, REVIEW_SERIES_SOURCE);
  assert.equal(manual.notes, "Keep my agenda");
  assert.equal(manual.time, "09:00");
  assert.equal(s.appointments.length, 4);
  s.appointments.push({
    id: "unrelated",
    learnerId: l.id,
    date: "2026-12-01",
    type: "Teaching session",
    status: "Planned",
  });
  l.status = "Paused";
  syncReviewSeries(s, l);
  assert(
    s.appointments
      .filter((a) => a.source === REVIEW_SERIES_SOURCE)
      .every((a) => a.status === "Cancelled"),
  );
  assert.equal(s.appointments.at(-1).status, "Planned");
  l.status = "Active";
  syncReviewSeries(s, l);
  assert(
    s.appointments.some(
      (a) => a.source === REVIEW_SERIES_SOURCE && a.status === "Planned",
    ),
  );
  l.initialReviewDate = "";
  syncReviewSeries(s, l);
  assert(
    s.appointments
      .filter((a) => a.source === REVIEW_SERIES_SOURCE)
      .every((a) => a.status === "Cancelled"),
  );
});
