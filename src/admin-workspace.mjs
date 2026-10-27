import { alertIsCleared } from "../server/alerts.mjs";
export function adminWorkspace(state, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`,
    time = `${parts.hour}:${parts.minute}`;
  const end = new Date(day + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  const last = end.toISOString().slice(0, 10);
  const active = (state.learners || []).filter((l) => l.status === "Active");
  const issues = active
    .map((learner) => {
      const exceptions = (learner.exceptions || [])
        .filter((e) => !alertIsCleared(state, learner, e))
        .sort(
          (a, b) =>
            (a.severity === "Red" ? 0 : 1) - (b.severity === "Red" ? 0 : 1) ||
            (a.date || "9999").localeCompare(b.date || "9999"),
        );
      return exceptions.length
        ? { learner, exception: exceptions[0], count: exceptions.length }
        : null;
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        (a.exception.severity === "Red" ? 0 : 1) -
          (b.exception.severity === "Red" ? 0 : 1) ||
        (a.exception.date || "9999").localeCompare(
          b.exception.date || "9999",
        ) ||
        b.count - a.count ||
        a.learner.name.localeCompare(b.learner.name),
    );
  const events = (state.appointments || [])
    .filter((a) => {
      const learner = (state.learners || []).find((l) => l.id === a.learnerId);
      return (
        learner &&
        !["Withdrawn", "Completed"].includes(learner.status) &&
        (!a.standardId || a.standardId === learner.standardId) &&
        a.status === "Planned" &&
        !["Attended", "Did not attend", "Rescheduled"].includes(a.attendance) &&
        a.date >= day &&
        a.date <= last &&
        (a.date > day || a.allDay || !a.time || (a.endTime || a.time) >= time)
      );
    })
    .map((appointment) => ({
      appointment,
      learner: state.learners.find((l) => l.id === appointment.learnerId),
    }))
    .sort((a, b) =>
      `${a.appointment.date} ${a.appointment.time || "00:00"}`.localeCompare(
        `${b.appointment.date} ${b.appointment.time || "00:00"}`,
      ),
    );
  const assessors = (state.users || []).filter((u) => u.role === "Assessor");
  const team = assessors
    .map((assessor) => {
      const cohort = active.filter((l) => l.assessorId === assessor.id);
      const ids = new Map(cohort.map((l) => [l.id, l]));
      const current = (e) =>
        ids.has(e.learnerId) &&
        (!e.standardId || e.standardId === ids.get(e.learnerId).standardId);
      return {
        assessor,
        learners: cohort.length,
        evidence: (state.evidence || []).filter(
          (e) => current(e) && e.status === "Submitted",
        ).length,
        logs: (state.otj || []).filter(
          (e) => current(e) && e.status === "Pending",
        ).length,
      };
    })
    .filter((row) => row.assessor.active || row.learners)
    .sort(
      (a, b) =>
        b.evidence + b.logs - (a.evidence + a.logs) ||
        a.assessor.name.localeCompare(b.assessor.name),
    );
  const unassigned = active.filter(
    (l) => !assessors.some((u) => u.id === l.assessorId),
  );
  return { day, last, issues, events, team, unassigned };
}
