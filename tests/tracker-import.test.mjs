import test from "node:test";
import assert from "node:assert/strict";
import { parseTrackerSheet, importTracker } from "../server/tracker-import.mjs";
import { installUploadedStarter } from "../server/uploaded-starter.mjs";
const headings = [
  "Pro Ref No",
  "First Name",
  "Last Name",
  "Progress %",
  "Target Progress %",
  "Apprenticeship Title",
  "Level",
  "Start Date",
  "End Date",
  "Employer",
  "Assessor",
  "IQA",
  "English Reading",
  "English Writing",
  "English SLC",
  "Maths",
  "Comments/1:1 Notes",
  "Risk Assessment Due",
];
const row = (ref, course = "Business Administrator - NO DIPLOMA") => [
  ref,
  "",
  "",
  "80%",
  "132%",
  course,
  3,
  "2025-03-04",
  "04/03/2027",
  "Example organisation",
  "Test Assessor",
  "",
  "Passed",
  "Passed",
  "Passed",
  "To do",
  "Private synthetic source note",
  "not yet supplied",
];
const sheet = (rows) => [...[...Array(10)].map(() => []), headings, ...rows];
const state = () => ({
  revision: 0,
  users: [
    { id: "owner", name: "Owner", role: "Manager", active: true },
    { id: "assessor", name: "Test Assessor", role: "Assessor", active: true },
  ],
  standards: [],
  learners: [],
  evidence: [],
  otj: [],
  reviews: [],
  tasks: [],
  appointments: [],
  learningPlans: [],
  audit: [],
  snapshots: [],
});
let seq = 0;
const options = {
  makeId: () => "tracker-test-" + ++seq,
  actorId: "owner",
  importedAt: "2026-10-23T12:00:00Z",
};
test("WBL parser finds row eleven headers, preserves blank identities and repeated references without merging rows", () => {
  const parsed = parseTrackerSheet(
    sheet([row("REF-1"), row("REF-1"), row("REF-2")]),
  );
  assert.equal(parsed.headerRow, 11);
  assert.equal(parsed.records.length, 3);
  assert.equal(parsed.missingNames, 3);
  assert.equal(parsed.duplicateReferences, 2);
  assert.equal(new Set(parsed.records.map((r) => r.ref)).size, 3);
  assert.equal(parsed.records[0].plannedEnd, "2027-03-04");
  assert.equal(parsed.records[0].reportedProgress, 80);
  assert.equal(parsed.records[0].reportedTarget, 132);
  assert.equal(parsed.records[0].english, "Achieved");
  assert.equal(parsed.records[0].maths, "Pending");
  assert.equal(parsed.records[0].riskDue, "");
  assert.ok(parsed.records[0].warnings.length);
  assert.equal(
    parsed.records[0].fields["Comments/1:1 Notes"],
    "Private synthetic source note",
  );
  assert.equal(parseTrackerSheet([["ref", "name"]]), null);
  assert.throws(() => parseTrackerSheet([Array(101).fill("")]), /Invalid/);
});
test("tracker import replaces only fictional learners and links, retains real accounts and records, and is repeatable", () => {
  const s = state();
  installUploadedStarter(s, {
    includeLearners: true,
    makeId: options.makeId,
    day: "2026-10-23",
  });
  s.learners.push({
    id: "real",
    ref: "REAL-EXISTING",
    name: "Synthetic existing learner",
    standardId: s.standards[0].id,
  });
  s.tasks.push({ id: "real-task", learnerId: "real" });
  const oldUsers = structuredClone(s.users);
  const result = importTracker(s, sheet([row("REF-NEW")]), options);
  assert.equal(result.removedIds.length, 6);
  assert.equal(result.added, 1);
  assert.equal(s.learners.length, 2);
  assert.ok(s.tasks.some((t) => t.id === "real-task"));
  assert.ok(s.learners.every((l) => !l.fictional));
  assert.deepEqual(s.users, oldUsers);
  const imported = s.learners.find((l) => l.ref === "REF-NEW");
  assert.equal(imported.name, "Learner REF-NEW");
  assert.equal(imported.assessorId, "assessor");
  assert.equal(imported.iqaId, "");
  assert.equal(imported.target, 100);
  assert.equal(imported.tracker.reportedTarget, 132);
  assert.equal(imported.otjTarget, 0);
  assert.equal(s.evidence.filter((e) => e.learnerId === imported.id).length, 0);
  assert.equal(importTracker(s, sheet([row("REF-NEW")]), options).updated, 1);
  assert.equal(s.learners.length, 2);
  assert.equal(s.learners.find((l) => l.id === imported.id).id, imported.id);
});
test("tracker does not invent KSB criteria or overwrite programmes with overlapping references, and failures are atomic", () => {
  const s = state();
  const r = row("REF-NEW", "New synthetic course");
  importTracker(s, sheet([r]), options);
  assert.equal(s.standards[0].criteria.length, 0);
  assert.equal(s.standards[0].trackerPlaceholder, true);
  const original = structuredClone(s);
  const changed = row("REF-NEW", "Different course");
  assert.throws(
    () => importTracker(s, sheet([changed]), options),
    /another programme/,
  );
  assert.deepEqual(s, original);
});
test("normal catalogue installation no longer adds fictional apprentices", () => {
  const s = state();
  installUploadedStarter(s, { makeId: options.makeId, day: "2026-10-23" });
  assert.equal(s.standards.length, 3);
  assert.equal(s.learners.length, 0);
});
