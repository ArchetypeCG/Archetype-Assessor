// All dates and session times follow the programme calendar in Europe/London.
export function assessorDay(state, assessorId, now = new Date()) {
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
      .map((part) => [part.type, part.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const end = new Date(day + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 60);
  const horizon = end.toISOString().slice(0, 10);
  const learners = (state.learners || []).filter(
    (l) => l.assessorId === assessorId && l.status === "Active",
  );
  const byId = new Map(learners.map((l) => [l.id, l]));
  const current = (record) => {
    const l = byId.get(record.learnerId);
    return l && (!record.standardId || record.standardId === l.standardId);
  };
  const sessions = (state.appointments || [])
    .filter(
      (a) =>
        current(a) &&
        a.status === "Planned" &&
        !["Attended", "Did not attend", "Rescheduled"].includes(a.attendance) &&
        (!a.participants?.length ||
          a.participants.includes(assessorId) ||
          a.by === assessorId) &&
        (a.date > day ||
          (a.date === day &&
            (a.allDay || !a.time || (a.endTime || a.time) >= time))),
    )
    .sort((a, b) =>
      `${a.date} ${a.time || "00:00"}`.localeCompare(
        `${b.date} ${b.time || "00:00"}`,
      ),
    );
  const upcoming = learners
    .filter((l) => !l.epaResult || l.epaResult === "Not recorded")
    .map((learner) => {
      if (learner.epaDate >= day && learner.epaDate <= horizon)
        return { learner, date: learner.epaDate, label: "EPA booked" };
      if (learner.gatewayDate >= day && learner.gatewayDate <= horizon)
        return { learner, date: learner.gatewayDate, label: "Gateway booked" };
      const date = learner.predictedEnd || learner.plannedEnd;
      if (date >= day && date <= horizon)
        return { learner, date, label: "Course end · plan gateway" };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pendingEvidence = (state.evidence || []).filter(
    (e) => current(e) && e.status === "Submitted",
  );
  const pendingLogs = (state.otj || []).filter(
    (e) => current(e) && e.status === "Pending",
  );
  const dueEnd = new Date(day + "T12:00:00Z");
  dueEnd.setUTCDate(dueEnd.getUTCDate() + 14);
  const dueDay = dueEnd.toISOString().slice(0, 10);
  const reviewLearners = learners
    .filter((l) => l.nextReview)
    .sort(
      (a, b) =>
        a.nextReview.localeCompare(b.nextReview) ||
        a.name.localeCompare(b.name),
    );
  const overdueLearners = reviewLearners.filter((l) => l.nextReview < day),
    todayLearners = reviewLearners.filter((l) => l.nextReview === day),
    dueSoonLearners = reviewLearners.filter((l) => l.nextReview <= dueDay);
  return {
    day,
    nextSession: sessions[0] || null,
    overdueReviews: overdueLearners.length,
    reviewsToday: todayLearners.length,
    evidence: pendingEvidence.length,
    logs: pendingLogs.length,
    upcoming,
    pendingEvidence,
    pendingLogs,
    reviewLearners,
    overdueLearners,
    todayLearners,
    dueSoonLearners,
  };
}
