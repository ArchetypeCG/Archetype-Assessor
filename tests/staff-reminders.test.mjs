import test from "node:test";
import assert from "node:assert/strict";
import { urgentItems } from "../server/mail.mjs";
test("1:1 action reminders respect ownership, sharing and fictional-learner exclusions", () => {
  const s = {
    learners: [{ id: "fictional", fictional: true }],
    tasks: [],
    evidence: [],
    otj: [],
    appointments: [],
    assessorOneToOnes: [
      { id: "shared", status: "Completed" },
      { id: "draft", status: "Draft" },
    ],
    assessorActions: [
      {
        id: "a",
        owner: "assessor-a",
        oneToOneId: "shared",
        title: "Own shared action",
        status: "Open",
        due: "2026-10-26",
      },
      {
        id: "b",
        owner: "assessor-b",
        oneToOneId: "shared",
        title: "Another assessor action",
        status: "Open",
        due: "2026-10-26",
      },
      {
        id: "c",
        owner: "assessor-a",
        oneToOneId: "draft",
        title: "Private draft action",
        status: "Open",
        due: "2026-10-26",
      },
      {
        id: "d",
        owner: "assessor-a",
        oneToOneId: "shared",
        learnerId: "fictional",
        title: "Fictional learner action",
        status: "Open",
        due: "2026-10-26",
      },
    ],
  };
  const own = urgentItems(
    s,
    { id: "assessor-a", role: "Assessor" },
    () => true,
    "2026-10-26",
  );
  assert.equal(own.length, 1);
  assert.match(own[0], /Own shared action/);
  assert.equal(
    urgentItems(s, { id: "master", role: "Manager" }, () => true, "2026-10-26")
      .length,
    2,
  );
  assert.deepEqual(
    urgentItems(s, { id: "iqa", role: "IQA" }, () => true, "2026-10-26"),
    [],
  );
});
