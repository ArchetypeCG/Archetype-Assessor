import test from "node:test";
import assert from "node:assert/strict";
import { seed, derive } from "../server/model.mjs";
import {
  installExtraPractice,
  EXTRA_PRACTICE_VERSION,
} from "../server/extra-practice.mjs";
import { urgentItems } from "../server/mail.mjs";
const day = "2026-10-26";
test("practice expansion adds exactly twenty varied fictional learners once without resetting existing records, standards or accounts", () => {
  const s = seed(),
    original = structuredClone(s),
    count = s.learners.length;
  assert.deepEqual(installExtraPractice(s, { day }), { addedFictional: 20 });
  assert.equal(s.learners.length, count + 20);
  assert.deepEqual(s.learners.slice(0, count), original.learners);
  assert.deepEqual(s.users, original.users);
  assert.deepEqual(s.standards, original.standards);
  assert.deepEqual(
    s.evidence.slice(0, original.evidence.length),
    original.evidence,
  );
  const added = s.learners.slice(count);
  assert(added.every((l) => l.fictional && !l.email));
  assert.equal(new Set(added.map((l) => l.name)).size, 20);
  assert.equal(new Set(s.learners.map((l) => l.ref)).size, s.learners.length);
  assert.equal(new Set(added.map((l) => l.practiceScenario)).size, 20);
  added[0].name = "Edited practice learner";
  s.otj.find((x) => x.learnerId === added[0].id).hours = 1.25;
  const changed = structuredClone(s);
  assert.equal(installExtraPractice(s, { day: "2026-11-01" }), null);
  assert.deepEqual(s, changed);
});
test("linked practice records produce real varied progress and OTJ figures and keep criteria, ownership and gateway checks valid", () => {
  const s = seed();
  const originalIds = new Set(s.learners.map((l) => l.id));
  installExtraPractice(s, { day });
  const added = s.learners.filter((l) => !originalIds.has(l.id)),
    ids = new Set(added.map((l) => l.id));
  const derived = added.map((l) => derive(l, s, day));
  assert(new Set(derived.map((l) => l.hours)).size >= 15);
  assert(new Set(derived.map((l) => l.otjExpected)).size >= 15);
  assert(derived.some((l) => l.otjVariance > 0));
  assert(derived.some((l) => l.otjVariance < 0));
  assert(derived.some((l) => l.rag === "Green"));
  assert(derived.some((l) => l.rag === "Red"));
  for (const l of added) {
    const st = s.standards.find((x) => x.id === l.standardId);
    assert(st);
    for (const key of [
      "evidence",
      "otj",
      "tasks",
      "learningPlans",
      "appointments",
      "reviews",
      "samplingPlans",
    ]) {
      const records = s[key].filter((x) => x.learnerId === l.id);
      if (key !== "samplingPlans") assert(records.length, `${key}: ${l.name}`);
      for (const record of records) {
        assert.equal(record.standardId, st.id);
        assert(
          (record.criteria || []).every((code) =>
            st.criteria.some((c) => c.code === code),
          ),
        );
      }
    }
    for (const log of s.otj.filter((x) => x.learnerId === l.id)) {
      assert(log.date >= l.startDate && log.date <= day);
      assert(log.hours > 0 && log.hours <= 24);
    }
    assert(
      s.users.some(
        (u) => u.id === l.assessorId && u.active && u.role === "Assessor",
      ),
    );
  }
  const ready = derived.find(
    (l) => l.practiceScenario === "Gateway checks ready",
  );
  assert(ready.gatewayChecks.every((c) => c[1]));
  assert.equal(ready.progress, 100);
  const states = new Set(
    s.evidence.filter((e) => ids.has(e.learnerId)).map((e) => e.status),
  );
  for (const status of ["Draft", "Submitted", "Accepted", "Changes requested"])
    assert(states.has(status));
  const onlyNew = { ...s, learners: added };
  assert.deepEqual(
    urgentItems(
      onlyNew,
      s.users.find((u) => u.role === "Manager"),
      () => true,
      day,
    ),
    [],
  );
});
test("practice installation waits for prerequisites, safely handles reference collisions and supports an unassigned caseload", () => {
  const s = seed();
  s.users = s.users.filter((u) => u.role === "Manager");
  s.standards = [];
  assert.equal(installExtraPractice(s, { day }), null);
  assert(!(s.migrations || []).includes(EXTRA_PRACTICE_VERSION));
  s.standards = seed().standards;
  s.learners[0].ref = "PRACTICE-001";
  const count = s.learners.length;
  assert.deepEqual(installExtraPractice(s, { day }), { addedFictional: 20 });
  assert.equal(new Set(s.learners.map((l) => l.ref)).size, s.learners.length);
  assert(s.learners.slice(count).every((l) => !l.assessorId && !l.iqaId));
  assert(
    s.tasks
      .filter((t) => s.learners.slice(count).some((l) => l.id === t.learnerId))
      .every((t) => t.owner === s.users[0].id),
  );
});
