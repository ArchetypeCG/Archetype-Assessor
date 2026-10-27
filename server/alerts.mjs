export function alertFingerprint(learner, exception) {
  const values = {
    progress: [learner.progress, learner.target],
    review: [learner.nextReview],
    compliance: [exception.date],
    data: [
      learner.nextReview,
      learner.eliDue,
      learner.riskDue,
      learner.employerDue,
    ],
    end: [learner.plannedEnd, learner.predictedEnd],
    skills: [
      learner.english,
      learner.maths,
      learner.englishNotRequired,
      learner.mathsNotRequired,
      learner.plannedEnd,
    ],
  };
  return JSON.stringify([
    learner.id,
    learner.standardId,
    learner.assessorId,
    exception.type,
    exception.text,
    exception.severity,
    exception.date || "",
    values[exception.type] || [],
  ]);
}
export function alertIsCleared(state, learner, exception) {
  const key = alertFingerprint(learner, exception);
  return (state.alertDismissals || []).some(
    (dismissal) => dismissal.learnerId === learner.id && dismissal.key === key,
  );
}
