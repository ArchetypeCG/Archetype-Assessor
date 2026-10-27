export const EPA_RESULTS = ["Not recorded", "Distinction", "Pass", "Fail"];
export function latestEpaOutcomes(outcomes = [], assessorId) {
  const latest = new Map();
  for (const outcome of outcomes
    .filter(
      (outcome) =>
        (assessorId === undefined || outcome.assessorId === assessorId) &&
        EPA_RESULTS.slice(1).includes(outcome.result),
    )
    .slice()
    .sort((a, b) =>
      (a.date || a.recordedAt).localeCompare(b.date || b.recordedAt),
    ))
    latest.set(outcome.learnerId, outcome);
  return [...latest.values()];
}
export function epaPerformance(outcomes = [], assessorId) {
  const records = latestEpaOutcomes(outcomes, assessorId),
    total = records.length;
  return {
    total,
    ...Object.fromEntries(
      EPA_RESULTS.slice(1).map((result) => [
        result.toLowerCase(),
        {
          count: records.filter((record) => record.result === result).length,
          percentage: total
            ? Math.round(
                (records.filter((record) => record.result === result).length /
                  total) *
                  1000,
              ) / 10
            : 0,
        },
      ]),
    ),
  };
}
