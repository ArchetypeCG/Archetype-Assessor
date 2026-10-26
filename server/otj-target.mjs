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
