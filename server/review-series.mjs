import { id } from "./model.mjs";
export const REVIEW_INTERVAL_DAYS = 70;
export const REVIEW_SERIES_SOURCE = "ten-week-review";
export function addDays(day, days) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function nextSeriesReview(s, l) {
  return (
    s.appointments
      .filter(
        (a) =>
          a.learnerId === l.id &&
          a.source === REVIEW_SERIES_SOURCE &&
          a.standardId === l.standardId &&
          a.status === "Planned",
      )
      .map((a) => a.date)
      .sort()[0] || ""
  );
}
export function setReviewSeries(s, l, old, p, u, { date, fail }) {
  const explicit = Object.hasOwn(p, "initialReviewDate");
  if (
    u.role !== "Manager" &&
    explicit &&
    (p.initialReviewDate || "") !== (old?.initialReviewDate || "")
  )
    fail("Only an administrator can set the initial 10-week review date.", 403);
  l.initialReviewDate = old?.initialReviewDate || "";
  l.reviewScheduleBy = old?.reviewScheduleBy || "";
  if (u.role === "Manager") {
    if (explicit)
      l.initialReviewDate = date(
        p.initialReviewDate,
        "initial 10-week review date",
      );
    else if (
      !l.initialReviewDate &&
      (!old || p.nextReview !== old.nextReview) &&
      l.nextReview &&
      l.predictedEnd &&
      l.nextReview <= l.predictedEnd
    )
      l.initialReviewDate = l.nextReview;
    if (l.initialReviewDate !== old?.initialReviewDate)
      l.reviewScheduleBy = u.id;
  }
  if (
    l.initialReviewDate &&
    (!l.predictedEnd || l.initialReviewDate > l.predictedEnd)
  )
    fail(
      "Set a predicted course end date on or after the initial review date.",
    );
  if (
    old?.initialReviewDate &&
    !l.initialReviewDate &&
    l.nextReview === old.nextReview
  )
    l.nextReview = "";
  syncReviewSeries(s, l);
}
export function syncReviewSeries(s, l) {
  const anchor = l.initialReviewDate,
    end = l.predictedEnd,
    now = new Date().toISOString();
  const desired = [];
  if (anchor && end && l.status === "Active") {
    for (let d = anchor; d <= end; d = addDays(d, REVIEW_INTERVAL_DAYS)) {
      if (desired.length >= 200)
        throw Object.assign(
          Error("The review schedule cannot exceed 200 occurrences."),
          { status: 400 },
        );
      desired.push(d);
    }
  }
  const dates = new Set(desired),
    managed = s.appointments.filter(
      (a) => a.learnerId === l.id && a.source === REVIEW_SERIES_SOURCE,
    );
  const participants = s.users
    .filter(
      (u) =>
        u.active &&
        ((u.role === "Assessor" && u.id === l.assessorId) ||
          (u.role === "Apprentice" && u.learnerId === l.id) ||
          (u.role === "Employer" && u.employer === l.employer)),
    )
    .map((u) => u.id);
  for (const a of managed) {
    if (a.status === "Completed") continue;
    const retain =
      dates.has(a.seriesDate) && a.standardId === l.standardId && a.date <= end;
    if (!retain && a.status === "Planned")
      Object.assign(a, {
        status: "Cancelled",
        seriesRetired: true,
        cancellationReason:
          "Automatic review schedule changed or programme no longer active.",
        updated: now,
        sequence: (a.sequence || 0) + 1,
      });
  }
  for (const day of desired) {
    if (managed.some((a) => a.seriesDate === day && a.status === "Completed"))
      continue;
    let a = managed.find(
      (a) => a.seriesDate === day && a.standardId === l.standardId,
    );
    if (
      a?.status === "Completed" ||
      (a?.status === "Cancelled" && !a.seriesRetired)
    )
      continue;
    if (!a) {
      const existing = s.appointments.find(
        (x) =>
          x.learnerId === l.id &&
          (!x.standardId || x.standardId === l.standardId) &&
          x.date === day &&
          ["Progress review", "Tripartite review"].includes(x.type) &&
          x.status !== "Cancelled",
      );
      if (existing?.status === "Completed") continue;
      a = existing;
    }
    if (a) {
      if (a.seriesOverride && a.date > end) continue;
      const attendees = [
        ...new Set([
          ...participants,
          ...(a.participants || []).filter((pid) =>
            s.users.some(
              (account) =>
                account.id === pid &&
                account.active &&
                (account.role === "Manager" ||
                  (account.role === "IQA" && account.id === l.iqaId)),
            ),
          ),
        ]),
      ];
      const changed =
        a.status === "Cancelled" ||
        a.source !== REVIEW_SERIES_SOURCE ||
        a.seriesAnchor !== anchor ||
        JSON.stringify(a.participants) !== JSON.stringify(attendees);
      Object.assign(a, {
        source: REVIEW_SERIES_SOURCE,
        seriesDate: day,
        seriesAnchor: anchor,
        standardId: l.standardId,
        participants: attendees,
      });
      if (a.seriesRetired)
        Object.assign(a, {
          status: "Planned",
          seriesRetired: false,
          cancellationReason: "",
        });
      if (changed)
        Object.assign(a, { updated: now, sequence: (a.sequence || 0) + 1 });
    } else {
      a = {
        id: id(),
        learnerId: l.id,
        standardId: l.standardId,
        source: REVIEW_SERIES_SOURCE,
        seriesDate: day,
        seriesAnchor: anchor,
        title: "10-week progress review",
        type: "Tripartite review",
        date: day,
        time: "",
        endTime: "",
        allDay: true,
        timezone: "Europe/London",
        delivery: "To be confirmed",
        location: "",
        meetingUrl: "",
        description:
          "Scheduled every 10 weeks from the administrator’s initial review date. Time and location to be confirmed with the apprentice, employer and assessor.",
        notes: "",
        objectives:
          "Review programme progress, workplace learning, support needs and agree SMART targets.",
        preparation:
          "Bring recent evidence, the off-the-job learning record and progress against previous actions.",
        criteria: [],
        resources: [],
        participants,
        attendance: "Not recorded",
        outcomeNotes: "",
        staffNotes: "",
        status: "Planned",
        cancellationReason: "",
        by: l.reviewScheduleBy,
        created: now,
        updated: now,
        sequence: 0,
        planId: "",
      };
      s.appointments.push(a);
    }
  }
  if (anchor) l.nextReview = nextSeriesReview(s, l);
}
export function syncReviewParticipants(s) {
  for (const l of s.learners.filter((l) => l.initialReviewDate))
    syncReviewSeries(s, l);
}
