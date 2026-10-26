export function expectedOtjHours(learner, day) {
  const start = Date.parse(learner.startDate),
    end = Date.parse(learner.plannedEnd || learner.predictedEnd),
    at = Date.parse(day),
    target = Number(learner.otjTarget);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(at) ||
    end <= start ||
    !(target > 0)
  )
    return null;
  return (
    Math.round(
      target * Math.max(0, Math.min(1, (at - start) / (end - start))) * 10,
    ) / 10
  );
}

export function approvedOtjHours(learner, logs, day) {
  return (
    Math.round(
      (logs || [])
        .filter(
          (log) =>
            log.learnerId === learner.id &&
            log.status === "Approved" &&
            (!log.standardId || log.standardId === learner.standardId) &&
            (!day || !log.date || String(log.date).slice(0, 10) <= day) &&
            Number.isFinite(Number(log.hours)) &&
            Number(log.hours) > 0,
        )
        .reduce((total, log) => total + Number(log.hours), 0) * 100,
    ) / 100
  );
}
export function otjProgress(learner, logs, day) {
  const approved = approvedOtjHours(learner, logs, day),
    expected = expectedOtjHours(learner, day);
  return {
    approved,
    expected,
    variance:
      expected == null ? null : Math.round((approved - expected) * 100) / 100,
  };
}
