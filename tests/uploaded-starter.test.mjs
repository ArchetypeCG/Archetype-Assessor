import test from "node:test";
import assert from "node:assert/strict";
import {
  installUploadedStarter,
  uploadedStandards,
  UPLOADED_STARTER_VERSION,
} from "../server/uploaded-starter.mjs";
import { derive } from "../server/model.mjs";
import { urgentItems } from "../server/mail.mjs";
const blank = () => ({
  revision: 0,
  users: [{ id: "owner", role: "Manager", active: true }],
  standards: [],
  learners: [],
  evidence: [],
  otj: [],
  tasks: [],
  appointments: [],
  learningPlans: [],
  audit: [],
});

test("uploaded KSB schedules contain every extracted unique criterion, with context and no learner report headers", () => {
  assert.deepEqual(
    uploadedStandards.map((s) => s.criteria.length),
    [60, 34, 67],
  );
  for (const standard of uploadedStandards) {
    assert.equal(
      new Set(standard.criteria.map((c) => c.code)).size,
      standard.criteria.length,
    );
    assert.equal(standard.level, 3);
    assert.ok(
      standard.criteria.every(
        (c) => c.text && c.section && /^[KSB]\d/.test(c.code),
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(standard),
      /Assessor Name|Course duration|Signed OffProgress|Assessment methods|GAP Analysis/,
    );
  }
  const applications = uploadedStandards[1];
  assert.match(
    applications.criteria.find((c) => c.code === "K11A").text,
    /searching the internet.*Currency/,
  );
  assert.ok(
    uploadedStandards[0].criteria
      .find((c) => c.code === "S1.7D")
      .text.includes("action logs"),
  );
  assert.ok(uploadedStandards[2].criteria.find((c) => c.code === "S19"));
});

test("live starter adds six fictional learners and linked workflows, creates no credentials/accounts and runs only once", () => {
  const s = blank();
  const users = structuredClone(s.users);
  const result = installUploadedStarter(s, {
    day: "2026-10-23",
    includeLearners: true,
  });
  assert.equal(result.addedStandards, 3);
  assert.equal(result.addedLearners, 6);
  assert.equal(s.standards.length, 3);
  assert.deepEqual(s.users, users);
  assert.equal(s.learners.length, 6);
  for (const learner of s.learners) {
    assert.equal(learner.fictional, true);
    assert.match(learner.name, /fictional/);
    assert.equal(learner.email, "");
    assert.equal(learner.assessorId, "");
    assert.equal(learner.iqaId, "");
    const progress = derive(learner, s).progress;
    assert.ok(progress > 0 && progress < 100);
    assert.equal(s.otj.filter((o) => o.learnerId === learner.id).length, 2);
    assert.ok(s.learningPlans.some((p) => p.learnerId === learner.id));
    assert.ok(
      s.appointments.some(
        (a) => a.learnerId === learner.id && a.date === "2026-11-06",
      ),
    );
    assert.ok(
      s.evidence
        .filter((e) => e.learnerId === learner.id)
        .every((e) =>
          s.standards
            .find((st) => st.id === learner.standardId)
            .criteria.some((c) => e.criteria.includes(c.code)),
        ),
    );
  }
  assert.deepEqual(
    urgentItems(s, s.users[0], () => true, "2028-01-01"),
    [],
  );
  s.learners[0].name = "An edited fictional learner";
  s.standards[0].criteria[0].text = "Edited criterion wording";
  const after = structuredClone(s);
  assert.equal(installUploadedStarter(s, { day: "2026-11-23" }), null);
  assert.deepEqual(s, after);
  assert.ok(s.migrations.includes(UPLOADED_STARTER_VERSION));
});

test("import preserves existing standard IDs, wording, learner data and colliding references; assignments use active staff", () => {
  const s = blank();
  s.users.push(
    { id: "assessor", role: "Assessor", active: true },
    { id: "iqa", role: "IQA", active: true },
  );
  s.standards.push({
    id: "existing-ba",
    name: "Business Administrator Level 3",
    reference: "Existing reference",
    version: "Provider edition",
    level: 3,
    criteria: [
      { code: "K1.1", type: "Knowledge", text: "Existing provider wording" },
    ],
  });
  s.learners.push({
    id: "existing-person",
    ref: "EXAMPLE-1-1",
    name: "Existing learner",
    standardId: "existing-ba",
  });
  s.evidence.push({
    id: "existing-evidence",
    learnerId: "existing-person",
    standardId: "existing-ba",
    criteria: ["K1.1"],
    status: "Accepted",
  });
  const learner = structuredClone(s.learners[0]),
    evidence = structuredClone(s.evidence[0]);
  installUploadedStarter(s, { day: "2026-10-23", includeLearners: true });
  assert.equal(s.standards.length, 3);
  assert.equal(s.standards[0].id, "existing-ba");
  assert.equal(
    s.standards[0].criteria.find((c) => c.code === "K1.1").text,
    "Existing provider wording",
  );
  assert.deepEqual(s.learners[0], learner);
  assert.deepEqual(s.evidence[0], evidence);
  assert.equal(new Set(s.learners.map((l) => l.ref)).size, s.learners.length);
  assert.ok(
    s.learners
      .filter((l) => l.fictional)
      .every((l) => l.assessorId === "assessor" && l.iqaId === "iqa"),
  );
});
