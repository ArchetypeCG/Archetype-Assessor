import { id } from "./model.mjs";
import { installUploadedStarter } from "./uploaded-starter.mjs";
export const PRACTICE_RESTORE_VERSION =
  "restore-fictional-after-tracker-2026-10-23-v1";
const imported = (learner) =>
  learner.tracker?.source === "WBL work-based tracker";
export const practiceRestoreNeeded = (s) =>
  !(s.migrations || []).includes(PRACTICE_RESTORE_VERSION);
export function importedLearnerIds(s) {
  return [
    ...new Set([
      ...(s.learners || []).filter(imported).map((l) => l.id),
      ...(s.snapshots || []).flatMap((snapshot) =>
        (snapshot.data?.learners || []).filter(imported).map((l) => l.id),
      ),
    ]),
  ];
}
export function restorePracticeWorkspace(s, { makeId = id } = {}) {
  if (!practiceRestoreNeeded(s)) return null;
  const ids = importedLearnerIds(s),
    removed = new Set(ids);
  function clear(data) {
    for (const collection of [
      "learners",
      "evidence",
      "otj",
      "reviews",
      "tasks",
      "appointments",
      "learningPlans",
      "samplingPlans",
      "quality",
      "messages",
    ]) {
      if (Array.isArray(data[collection]))
        data[collection] = data[collection].filter(
          (record) =>
            !removed.has(
              collection === "learners" ? record.id : record.learnerId,
            ),
        );
    }
    for (const account of data.users || [])
      if (removed.has(account.learnerId)) delete account.learnerId;
  }
  clear(s);
  for (const snapshot of s.snapshots || [])
    if (snapshot.data) clear(snapshot.data);
  let addedFictional = 0;
  if (!s.learners.some((l) => l.fictional)) {
    const result = installUploadedStarter(s, {
      makeId,
      includeLearners: true,
      force: true,
    });
    addedFictional = result.addedLearners;
  }
  s.migrations ||= [];
  s.migrations.push(PRACTICE_RESTORE_VERSION);
  s.revision++;
  s.audit.unshift({
    id: makeId(),
    by: "system",
    actor: "Requested practice workspace",
    role: "System",
    action: "workspace.practice.restore",
    learnerId: null,
    date: new Date().toISOString(),
    removedImported: ids.length,
    addedFictional,
  });
  return { removedIds: ids, addedFictional };
}
