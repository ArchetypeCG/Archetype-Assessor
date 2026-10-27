import { test } from "node:test";
import assert from "node:assert/strict";
import { epaPerformance } from "../server/epa-metrics.mjs";
import { saveEpaOutcome, seedFictionalEpa } from "../server/epa-results.mjs";
test("EPA performance uses recorded results, keeps archived outcomes and scopes credit to the original assessor", () => {
  const s = {
    users: [
      { id: "a", role: "Assessor" },
      { id: "b", role: "Assessor" },
    ],
    standards: [{ id: "std", name: "Standard" }],
    epaOutcomes: [],
  };
  const fail = (message) => {
    throw Error(message);
  };
  const l = {
    id: "l",
    name: "Learner",
    standardId: "std",
    assessorId: "a",
    epaResult: "Pass",
  };
  const save = () =>
    saveEpaOutcome({
      s,
      u: { id: "admin" },
      p: { epaResult: l.epaResult },
      learner: l,
      fail,
      day: "2026-10-27",
    });
  save();
  assert.equal(epaPerformance(s.epaOutcomes, "a").pass.percentage, 100);
  l.assessorId = "b";
  l.epaResult = "Distinction";
  save();
  assert.equal(s.epaOutcomes.length, 1);
  assert.equal(s.epaOutcomes[0].history.length, 1);
  assert.equal(epaPerformance(s.epaOutcomes, "a").distinction.percentage, 100);
  assert.equal(epaPerformance(s.epaOutcomes, "b").total, 0);
  l.epaResultDate = "2099-01-01";
  assert.throws(save, /future/);
  l.epaResult = "Not recorded";
  save();
  assert.equal(epaPerformance(s.epaOutcomes, "a").total, 0);
  const rows = ["Distinction", "Pass", "Fail"].map((result, i) => ({
    learnerId: String(i),
    assessorId: "a",
    result,
    date: "2026-10-27",
  }));
  assert.equal(epaPerformance(rows, "a").pass.percentage, 33.3);
});
test("EPA fictional examples run once and never modify real learners or create accounts", () => {
  const real = {
    id: "real",
    assessorId: "a",
    status: "Active",
    startDate: "2025-01-01",
  };
  const s = {
    users: [{ id: "a", role: "Assessor", active: true }],
    standards: [{ id: "std", name: "Standard" }],
    learners: [
      real,
      ...Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        name: "Practice " + i,
        fictional: true,
        assessorId: "a",
        standardId: "std",
        status: "Active",
        startDate: "2025-01-01",
      })),
    ],
    revision: 0,
    audit: [],
  };
  assert.equal(seedFictionalEpa(s, { day: "2026-10-27" }).added, 6);
  assert.equal(s.users.length, 1);
  assert.equal(real.epaResult, undefined);
  assert.equal(epaPerformance(s.epaOutcomes, "a").total, 6);
  assert.equal(epaPerformance(s.epaOutcomes, "a").pass.percentage, 50);
  assert.equal(seedFictionalEpa(s), null);
});

test("overall EPA results combine assessor caseloads, count each apprentice once and use latest recorded outcome", () => {
  const outcomes = [
    { learnerId: "one", assessorId: "a", result: "Pass", date: "2026-09-01" },
    {
      learnerId: "one",
      assessorId: "b",
      result: "Distinction",
      date: "2026-10-01",
    },
    { learnerId: "two", assessorId: "a", result: "Pass", date: "2026-10-01" },
    { learnerId: "three", assessorId: "b", result: "Fail", date: "2026-10-01" },
    {
      learnerId: "ungraded",
      assessorId: "b",
      result: "Not recorded",
      date: "2026-10-01",
    },
  ];
  const overall = epaPerformance(outcomes);
  assert.equal(overall.total, 3);
  for (const grade of ["distinction", "pass", "fail"]) {
    assert.equal(overall[grade].count, 1);
    assert.equal(overall[grade].percentage, 33.3);
  }
  assert.equal(epaPerformance(outcomes, "a").total, 2);
  assert.equal(epaPerformance(outcomes, "a").pass.percentage, 100);
  assert.equal(epaPerformance([]).total, 0);
  assert.equal(epaPerformance([]).fail.percentage, 0);
});
