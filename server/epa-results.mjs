import { id, today } from "./model.mjs";
import { EPA_RESULTS } from "./epa-metrics.mjs";
export const EPA_PRACTICE_VERSION = "fictional-epa-results-2026-10-26-v1";
export function saveEpaOutcome({
  s,
  u,
  p,
  learner,
  fail,
  day = today(),
  makeId = id,
}) {
  if (!Object.hasOwn(p, "epaResult") && !Object.hasOwn(p, "epaResultDate"))
    return;
  s.epaOutcomes ||= [];
  const old = s.epaOutcomes.find(
      (outcome) =>
        outcome.learnerId === learner.id &&
        outcome.standardId === learner.standardId,
    ),
    result = learner.epaResult || "Not recorded";
  if (!EPA_RESULTS.includes(result)) fail("Select a valid EPA result.");
  if (result === "Not recorded") {
    s.epaOutcomes = s.epaOutcomes.filter((outcome) => outcome !== old);
    learner.epaResultDate = "";
    return;
  }
  const date = learner.epaResultDate || old?.date || day;
  if (date > day) fail("An EPA result cannot be dated in the future.");
  const assessor = s.users.find(
    (account) =>
      account.id === (old?.assessorId || learner.assessorId) &&
      account.role === "Assessor",
  );
  if (!assessor) fail("Assign an assessor before recording an EPA result.");
  const standard = s.standards.find(
    (standard) => standard.id === learner.standardId,
  );
  const record = {
    id: old?.id || makeId(),
    learnerId: learner.id,
    learnerName: learner.name,
    standardId: learner.standardId,
    standardName: standard?.name || "",
    assessorId: assessor.id,
    result,
    date,
    recordedAt: old?.recordedAt || new Date().toISOString(),
    updated: new Date().toISOString(),
    by: u.id,
    fictional: learner.fictional === true,
    history: old?.history || [],
  };
  if (old && (old.result !== result || old.date !== date)) {
    const { history, ...previous } = old;
    record.history = [...record.history, previous];
  }
  if (old) Object.assign(old, record);
  else s.epaOutcomes.push(record);
  learner.epaResultDate = date;
}
export function seedFictionalEpa(s, { day = today(), makeId = id } = {}) {
  if ((s.migrations || []).includes(EPA_PRACTICE_VERSION)) return null;
  const assessors = s.users.filter(
    (account) => account.active && account.role === "Assessor",
  );
  if (!assessors.length || !s.learners.some((learner) => learner.fictional))
    return null;
  let added = 0;
  for (const assessor of assessors) {
    const candidates = s.learners
      .filter(
        (learner) =>
          learner.fictional &&
          learner.assessorId === assessor.id &&
          ["Active", "Completed"].includes(learner.status) &&
          (!learner.epaResult || learner.epaResult === "Not recorded") &&
          !(s.epaOutcomes || []).some(
            (outcome) =>
              outcome.learnerId === learner.id &&
              outcome.standardId === learner.standardId,
          ),
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 6);
    for (const [index, learner] of candidates.entries()) {
      const previousDay = new Date(
        Date.parse(day + "T12:00:00Z") - (10 + index * 3) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      const result = [
        "Distinction",
        "Pass",
        "Fail",
        "Pass",
        "Distinction",
        "Pass",
      ][index];
      learner.epaResult = result;
      learner.epaResultDate =
        previousDay < learner.startDate ? learner.startDate : previousDay;
      if (result !== "Fail") learner.status = "Completed";
      saveEpaOutcome({
        s,
        u: { id: "system" },
        p: { epaResult: result },
        learner,
        day,
        makeId,
        fail: (message) => {
          throw Error(message);
        },
      });
      added++;
    }
  }
  if (!added) return null;
  s.migrations ||= [];
  s.migrations.push(EPA_PRACTICE_VERSION);
  s.revision++;
  s.audit.unshift({
    id: makeId(),
    by: "system",
    actor: "Requested fictional EPA examples",
    role: "System",
    action: "workspace.practice.epa-results",
    learnerId: null,
    date: new Date().toISOString(),
    added,
  });
  return { added };
}
