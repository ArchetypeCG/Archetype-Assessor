import { addDays } from "../server/review-series.mjs";
import { reviewPayload } from "./support/review-fixture.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { derive, seed, today } from "../server/model.mjs";
let proc, dir, base;
let session;
async function request(path, { cookie, ...opts } = {}) {
  const res = await fetch(base + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...opts.headers,
    },
  });
  const data = await res.json();
  return {
    status: res.status,
    data,
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(email) {
  const r = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "ArchetypeDemo2026!" }),
  });
  assert.equal(r.status, 200);
  return r.cookie;
}
async function state(cookie = session) {
  return (await request("/api/state", { cookie })).data.state;
}
async function command(kind, payload, cookie = session, revision) {
  const s = await state(cookie);
  return request("/api/command", {
    cookie,
    method: "POST",
    body: JSON.stringify({ kind, payload, revision: revision ?? s.revision }),
  });
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "archetype-api-"));
  const port = 19000 + Math.floor(Math.random() * 10000);
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, DEMO_MODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  proc.stderr.on("data", (x) => (logs += x));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await request("/api/health");
      if (r.status === 200) break;
    } catch {}
    if (proc.exitCode !== null) throw Error(logs);
    await pause(100);
  }
  session = await login("manager@archetype.demo");
});
after(async () => {
  proc?.kill();
  if (proc && proc.exitCode === null)
    await new Promise((r) => proc.once("exit", r));
  await rm(dir, { recursive: true, force: true });
});
test("risk and KSB progress are derived from accepted evidence; same-day deadlines are current", () => {
  const s = seed(),
    l = s.learners[0];
  for (const e of s.evidence) e.status = "Submitted";
  assert.equal(derive(l, s).progress, 0);
  s.evidence[0].status = "Accepted";
  assert.equal(derive(l, s).progress, 13);
  l.nextReview = today();
  l.eliDue = today();
  l.riskDue = today();
  l.employerDue = today();
  assert.equal(
    derive(l, s).exceptions.some(
      (x) => x.type === "review" || x.type === "compliance",
    ),
    false,
  );
  l.status = "Completed";
  assert.equal(derive(l, s).rag, "Green");
});
test("unauthenticated access is denied and private credentials are never returned", async () => {
  assert.equal((await request("/api/state")).status, 401);
  const s = await state();
  assert.equal(s.learners.length, 24);
  assert.ok(s.users.every((u) => !("hash" in u) && !("password" in u)));
  assert.equal(
    (
      await request("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: "manager@archetype.demo",
          password: "wrong",
        }),
      })
    ).status,
    401,
  );
});
test("apprentice is scoped to own record and cannot assess, approve hours, or impersonate staff", async () => {
  const cookie = await login("apprentice@archetype.demo"),
    s = await state(cookie);
  assert.equal(s.learners.length, 1);
  assert.equal(s.audit.length, 0);
  const all = await state();
  const foreign = all.learners.find((l) => l.id !== s.learners[0].id);
  assert.equal(
    (await command("evidence.save", { learnerId: foreign.id }, cookie)).status,
    404,
  );
  assert.equal(
    (
      await command(
        "evidence.assess",
        { id: s.evidence[0].id, status: "Accepted", feedback: "fake" },
        cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await command(
        "otj.decide",
        { id: s.otj[0].id, status: "Approved" },
        cookie,
      )
    ).status,
    403,
  );
  assert.equal((await command("standard.save", {}, cookie)).status, 403);
});
test("evidence submission, file authorization, feedback return, resubmission and acceptance update KSB coverage", async () => {
  const learnerCookie = await login("apprentice@archetype.demo");
  let s = await state(learnerCookie),
    l = s.learners[0];
  let r = await command(
    "evidence.save",
    {
      learnerId: l.id,
      title: "Integration workflow evidence",
      type: "Work product",
      date: today(),
      description: "A genuine reflection in a test.",
      criteria: ["B2"],
      status: "Submitted",
      files: [
        {
          name: "evidence.txt",
          base64: Buffer.from("Supporting evidence").toString("base64"),
        },
      ],
    },
    learnerCookie,
  );
  assert.equal(r.status, 200);
  let e = r.data.state.evidence.find(
    (x) => x.title === "Integration workflow evidence",
  );
  const file = e.files[0];
  assert.equal((await fetch(base + "/api/files/" + file.id)).status, 401);
  const employer = await login("employer@archetype.demo");
  assert.equal(
    (
      await fetch(base + "/api/files/" + file.id, {
        headers: { cookie: employer },
      })
    ).status,
    403,
  );
  const fr = await fetch(base + "/api/files/" + file.id, {
    headers: { cookie: learnerCookie },
  });
  assert.equal(await fr.text(), "Supporting evidence");
  assert.match(fr.headers.get("content-disposition"), /attachment/);
  r = await command("evidence.assess", {
    learnerId: l.id,
    id: e.id,
    status: "Changes requested",
    feedback: "Add more reflection",
  });
  assert.equal(r.status, 200);
  r = await command(
    "evidence.save",
    {
      ...e,
      status: "Submitted",
      description: "Expanded reflection",
      files: [],
    },
    learnerCookie,
  );
  assert.equal(r.status, 200);
  r = await command("evidence.assess", {
    learnerId: l.id,
    id: e.id,
    status: "Accepted",
    feedback: "Meets the mapped criterion.",
  });
  assert.equal(r.status, 200);
  l = r.data.state.learners.find((x) => x.id === l.id);
  assert.ok(l.coverage.find((c) => c.code === "B2").achieved);
  assert.equal(
    r.data.state.evidence.find((x) => x.id === e.id).decisions.length,
    2,
  );
  assert.equal(
    (
      await command(
        "evidence.save",
        { ...e, status: "Draft", files: [] },
        learnerCookie,
      )
    ).status,
    400,
  );
});
test("learning hours require assessor approval; reviews and separate acknowledgements persist", async () => {
  const learnerCookie = await login("apprentice@archetype.demo");
  const s = await state(learnerCookie),
    l = s.learners[0],
    hours = l.hours;
  let r = await command(
    "otj.add",
    {
      learnerId: l.id,
      activity: "Training workshop",
      reflection: "Learned a new technique.",
      hours: 2,
      date: today(),
    },
    learnerCookie,
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.state.learners[0].hours, hours);
  const log = r.data.state.otj.at(-1);
  r = await command("otj.decide", {
    id: log.id,
    learnerId: l.id,
    status: "Approved",
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.state.learners.find((x) => x.id === l.id).hours,
    hours + 2,
  );
  const nextDate = new Date(Date.now() + 20 * 86400000)
    .toISOString()
    .slice(0, 10);
  r = await command("review.add", {
    ...reviewPayload(
      l,
      today(),
      new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
    ),
    learnerId: l.id,
    type: "Tripartite review",
    date: today(),
    nextDate,
    text: "Discussed goals and wellbeing.",
    actions: "Add two examples of work.",
  });
  assert.equal(r.status, 200);
  const review = r.data.state.reviews.at(-1);
  assert.equal(
    r.data.state.learners.find((x) => x.id === l.id).nextReview,
    nextDate,
  );
  r = await command(
    "review.ack",
    { id: review.id, learnerId: l.id },
    learnerCookie,
  );
  assert.equal(r.status, 200);
  assert.equal(
    r.data.state.reviews.at(-1).acknowledgements[0].role,
    "Apprentice",
  );
});
test("messages cross accounts; actions, IQA findings and audit are recorded", async () => {
  const l = (await state()).learners[0];
  let r = await command("message.send", {
    to: "apprentice",
    text: "Your feedback is ready.",
  });
  assert.equal(r.status, 200);
  const learnerCookie = await login("apprentice@archetype.demo");
  assert.ok(
    (await state(learnerCookie)).messages.some(
      (m) => m.text === "Your feedback is ready.",
    ),
  );
  r = await command("task.add", {
    learnerId: l.id,
    title: "Complete the reflection",
    owner: "apprentice",
    due: today(),
  });
  assert.equal(r.status, 200);
  r = await command(
    "task.toggle",
    { id: r.data.state.tasks.at(-1).id, learnerId: l.id },
    learnerCookie,
  );
  assert.equal(r.status, 200);
  const iqaCookie = await login("iqa@archetype.demo"),
    s = await state(iqaCookie);
  r = await command(
    "quality.add",
    {
      evidenceId: s.evidence.find((e) => e.status === "Accepted").id,
      outcome: "Agreed",
      notes: "Assessment decision supported by evidence.",
    },
    iqaCookie,
  );
  assert.equal(r.status, 200);
  assert.ok(r.data.state.quality.length);
  assert.ok((await state()).audit.some((x) => x.action === "quality.add"));
});
test("gateway is blocked until ready, bulk imports are atomic, stale writes and cross-origin requests are rejected", async () => {
  let s = await state(),
    l = s.learners[0];
  assert.equal(
    (
      await command("gateway.record", {
        learnerId: l.id,
        date: today(),
        notes: "Not ready",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await command("learners.import", {
        rows: [
          { ...l, ref: "NEW-TEST", name: "Atomic import" },
          { ...l, ref: "BROKEN", standardId: "missing" },
        ],
      })
    ).status,
    400,
  );
  assert.ok(!(await state()).learners.some((x) => x.ref === "NEW-TEST"));
  assert.equal((await command("snapshot.create", {}, session, -1)).status, 409);
  const r = await request("/api/command", {
    cookie: session,
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
    body: JSON.stringify({
      kind: "snapshot.create",
      payload: {},
      revision: s.revision,
    }),
  });
  assert.equal(r.status, 403);
});
test("snapshots recover records and user roles are scoped to assigned caseloads", async () => {
  let r = await command("snapshot.create", {});
  assert.equal(r.status, 200);
  const snap = r.data.state.snapshots.at(-1),
    l = r.data.state.learners[0];
  r = await command("learner.save", { ...l, notes: "Changed after snapshot" });
  assert.equal(r.status, 200);
  r = await command("snapshot.restore", { id: snap.id });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.state.learners[0].notes, "Changed after snapshot");
  r = await command("user.add", {
    name: "Other assessor",
    email: "other@example.test",
    role: "Assessor",
    password: "LongTestPassword123!",
  });
  assert.equal(r.status, 200);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "other@example.test",
      password: "LongTestPassword123!",
    }),
  });
  assert.equal((await state(login.cookie)).learners.length, 0);
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal(
    (await command("learner.save", { ...l }, login.cookie)).status,
    403,
  );
  assert.equal(
    (
      await command(
        "password.change",
        {
          current: "LongTestPassword123!",
          password: "ChangedTestPassword123!",
        },
        login.cookie,
      )
    ).status,
    200,
  );
  const signedIn = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "other@example.test",
      password: "ChangedTestPassword123!",
    }),
  });
  assert.equal(signedIn.data.user.mustChangePassword, false);
  const r2 = await command("learner.save", { ...l }, signedIn.cookie);
  assert.equal(r2.status, 404);
});
test("fully verified learner can record gateway readiness and concurrent stale writes cannot overwrite changes", async () => {
  let s = await state(),
    l = s.learners[0];
  const future = new Date(Date.now() + 180 * 86400000)
    .toISOString()
    .slice(0, 10);
  let r = await command("learner.save", {
    ...l,
    otjTarget: 1,
    english: "Achieved",
    maths: "Achieved",
    nextReview: future,
    eliDue: future,
    riskDue: future,
    employerDue: future,
  });
  assert.equal(r.status, 200);
  r = await command("evidence.save", {
    learnerId: l.id,
    title: "All remaining KSBs",
    type: "Professional discussion",
    date: today(),
    description: "Full mapped discussion used only in tests.",
    criteria: l.coverage.map((c) => c.code),
    status: "Submitted",
    files: [],
  });
  assert.equal(r.status, 200);
  const e = r.data.state.evidence.at(-1);
  r = await command("evidence.assess", {
    learnerId: l.id,
    id: e.id,
    status: "Accepted",
    feedback: "All mapped criteria demonstrated.",
  });
  assert.equal(r.status, 200);
  assert.ok(r.data.state.learners[0].gatewayChecks.every((x) => x[1]));
  r = await command("gateway.record", {
    learnerId: l.id,
    date: today(),
    notes: "Provider confirmed readiness and agreement.",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.state.learners[0].gatewayStatus, "Ready");
  s = await state();
  const write = () =>
    request("/api/command", {
      cookie: session,
      method: "POST",
      body: JSON.stringify({
        kind: "snapshot.create",
        payload: {},
        revision: s.revision,
      }),
    });
  const responses = await Promise.all([write(), write()]);
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 409]);
});
test("records and login sessions survive an API restart", async () => {
  const before = await state();
  proc.kill();
  await new Promise((r) => proc.once("exit", r));
  proc = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      PORT: new URL(base).port,
      DATA_DIR: dir,
      DEMO_MODE: "1",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/api/health")).status === 200) break;
    } catch {}
    await pause(50);
  }
  const after = await state();
  assert.equal(after.revision, before.revision);
  assert.equal(after.learners[0].gatewayStatus, "Ready");
  assert.ok(
    after.evidence.some((x) => x.title === "Integration workflow evidence"),
  );
});

test("standard reassignment preserves history and isolates evidence and hours even when KSB codes overlap", async () => {
  let s = await state(),
    l = s.learners.at(-1),
    previous = l.standardId;
  const target = s.standards.find((st) => st.id !== previous),
    historicalEvidence = s.evidence.filter((e) => e.learnerId === l.id),
    historicalHours = l.hours;
  const learnerCookie = await login("apprentice@archetype.demo");
  assert.equal(
    (
      await command(
        "learner.assignStandard",
        {
          learnerId: s.learners[0].id,
          standardId: target.id,
          target: 0,
          otjTarget: 278,
          reason: "Not allowed",
        },
        learnerCookie,
      )
    ).status,
    403,
  );
  let r = await command("learner.assignStandard", {
    learnerId: l.id,
    standardId: target.id,
    target: 0,
    otjTarget: 278,
    reason: "Programme correction agreed with learner.",
  });
  assert.equal(r.status, 200);
  l = r.data.state.learners.find((x) => x.id === l.id);
  assert.equal(l.standardId, target.id);
  assert.equal(l.progress, 0);
  assert.equal(l.hours, 0);
  assert.equal(l.level, target.level);
  assert.equal(l.programmeHistory[0].standardId, previous);
  assert.equal(l.programmeHistory[0].hours, historicalHours);
  assert.equal(l.gatewayStatus, "Not ready");
  assert.ok(
    historicalEvidence.every((e) =>
      r.data.state.evidence.some((x) => x.id === e.id),
    ),
  );
  const submitted = historicalEvidence.find((e) => e.status === "Submitted");
  assert.equal(
    (
      await command("evidence.assess", {
        id: submitted.id,
        learnerId: l.id,
        status: "Accepted",
        feedback: "Must not assess archived evidence",
      })
    ).status,
    400,
  );
  r = await command("evidence.save", {
    learnerId: l.id,
    title: "New programme evidence",
    type: "Work product",
    date: today(),
    description: "Specific evidence for the newly assigned standard.",
    criteria: [target.criteria[0].code],
    status: "Submitted",
    files: [],
  });
  assert.equal(r.status, 200);
  const item = r.data.state.evidence.at(-1);
  assert.equal(item.standardId, target.id);
  r = await command("evidence.assess", {
    id: item.id,
    learnerId: l.id,
    status: "Accepted",
    feedback: "Meets current programme criterion.",
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.state.learners.find((x) => x.id === l.id).progress,
    Math.round(100 / target.criteria.length),
  );
});

test("legacy records without standard IDs are bound before a programme changes", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(dir, "archetype.sqlite"));
  const data = JSON.parse(
      db.prepare("SELECT data FROM workspace WHERE id=1").get().data,
    ),
    l = data.learners[1],
    old = l.standardId;
  for (const key of ["evidence", "otj"])
    for (const record of data[key])
      if (record.learnerId === l.id) delete record.standardId;
  db.prepare("UPDATE workspace SET data=? WHERE id=1").run(
    JSON.stringify(data),
  );
  db.close();
  const target = data.standards.find((st) => st.id !== old);
  let r = await command("learner.assignStandard", {
    learnerId: l.id,
    standardId: target.id,
    target: 0,
    otjTarget: 278,
    reason: "Test migration of original prototype records.",
  });
  assert.equal(r.status, 200);
  const learner = r.data.state.learners.find((x) => x.id === l.id);
  assert.equal(learner.progress, 0);
  assert.equal(learner.hours, 0);
  assert.ok(
    r.data.state.evidence
      .filter((e) => e.learnerId === l.id)
      .every((e) => e.standardId === old),
  );
  assert.ok(
    r.data.state.otj
      .filter((e) => e.learnerId === l.id)
      .every((e) => e.standardId === old),
  );
});

test("detailed learning plans, linked sessions, shared reflections and private staff notes are permission-scoped", async () => {
  const s = await state(),
    l = s.learners[0],
    resource = s.resources[0].id;
  let r = await command("plan.save", {
    learnerId: l.id,
    title: "Develop stakeholder communication",
    description: "Workshop followed by supported workplace practice.",
    objectives:
      "Explain stakeholder needs and practise appropriate communication.",
    criteria: ["K1", "S1"],
    resources: [resource],
    startDate: today(),
    due: today(),
    plannedHours: 2,
    status: "Planned",
  });
  assert.equal(r.status, 200);
  const plan = r.data.state.learningPlans.at(-1);
  const learnerCookie = await login("apprentice@archetype.demo");
  r = await command(
    "plan.reflect",
    {
      learnerId: l.id,
      id: plan.id,
      reflection: "I applied the new approach to a workplace conversation.",
    },
    learnerCookie,
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.state.learningPlans.at(-1).status, "In progress");
  const employerCookie = await login("employer@archetype.demo");
  assert.equal(
    (await command("plan.save", { learnerId: l.id }, employerCookie)).status,
    403,
  );
  const payload = {
    learnerId: l.id,
    title: "Detailed progress, review",
    type: "Progress review",
    date: today(),
    time: "10:00",
    endTime: "11:00",
    delivery: "Online",
    meetingUrl: "https://example.test/meeting",
    location: "Online meeting",
    description: "Review evidence and the individual learning plan.",
    notes: "Discuss progress, support and next steps.",
    objectives: "Agree two new workplace opportunities.",
    preparation: "Bring a reflection and recent work.",
    criteria: ["K1"],
    resources: [resource],
    participants: ["manager", "assessor", "apprentice", "employer"],
    staffNotes: "Private assessment preparation",
    planId: plan.id,
  };
  r = await command("session.save", payload);
  assert.equal(r.status, 200);
  const appointment = r.data.state.appointments.at(-1);
  assert.equal(appointment.planId, plan.id);
  assert.equal(r.data.state.learningPlans.at(-1).sessionId, appointment.id);
  assert.equal(r.data.state.learners[0].nextReview, today());
  assert.equal(appointment.staffNotes, "Private assessment preparation");
  const learnerState = await state(learnerCookie);
  assert.ok(learnerState.appointments.some((a) => a.id === appointment.id));
  assert.equal(
    learnerState.appointments.find((a) => a.id === appointment.id).staffNotes,
    undefined,
  );
  assert.equal(
    (
      await command(
        "session.save",
        { ...payload, id: appointment.id },
        learnerCookie,
      )
    ).status,
    403,
  );
  r = await command("session.save", {
    ...payload,
    id: appointment.id,
    notes: "Updated full agenda with learner questions.",
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.state.appointments.filter((a) => a.id === appointment.id).length,
    1,
  );
  assert.equal(
    r.data.state.appointments.find((a) => a.id === appointment.id).notes,
    "Updated full agenda with learner questions.",
  );
  const exportResponse = await fetch(base + "/api/calendar.ics", {
    headers: { cookie: learnerCookie },
  });
  assert.equal(exportResponse.status, 200);
  const ics = await exportResponse.text();
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /Detailed progress\\, review/);
  assert.ok(!ics.includes("Private assessment preparation"));
  assert.match(ics, new RegExp(`UID:session-${appointment.id}@archetype`));
  r = await command("review.add", {
    ...reviewPayload(
      l,
      today(),
      new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
    ),
    learnerId: l.id,
    appointmentId: appointment.id,
    type: "Tripartite review",
    date: today(),
    nextDate: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
    text: "Reviewed progress and learning.",
    actions: "Practise the agreed workplace task.",
    learnerVoice: "I would like more observation opportunities.",
    employerVoice: "We will provide supported practice.",
    wellbeing: "Agreed support discussed with all participants.",
    nextObjectives: "Capture new evidence.",
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.state.appointments.find((a) => a.id === appointment.id).status,
    "Completed",
  );
  assert.equal(
    r.data.state.reviews.at(-1).learnerVoice,
    "I would like more observation opportunities.",
  );
});
test("scheduling rejects invalid mappings, inaccessible participants and invalid time ranges", async () => {
  const l = (await state()).learners[0],
    p = {
      learnerId: l.id,
      title: "Validation session",
      date: today(),
      time: "10:00",
      endTime: "11:00",
      criteria: [],
      resources: [],
      participants: ["assessor"],
    };
  assert.equal(
    (await command("session.save", { ...p, endTime: "09:00" })).status,
    400,
  );
  assert.equal(
    (await command("session.save", { ...p, criteria: ["K999"] })).status,
    400,
  );
  assert.equal(
    (await command("session.save", { ...p, participants: ["not-an-account"] }))
      .status,
    400,
  );
  assert.equal(
    (await command("session.save", { ...p, meetingUrl: "javascript:alert(1)" }))
      .status,
    400,
  );
  assert.equal(
    (
      await command("plan.save", {
        learnerId: l.id,
        title: "Bad dates",
        description: "Example",
        objectives: "Example",
        criteria: [],
        resources: [],
        startDate: "2027-02-02",
        due: "2027-02-01",
        plannedHours: 1,
        status: "Planned",
      })
    ).status,
    400,
  );
});
test("password reset and deactivation invalidate every old session and require a new password", async () => {
  const cookie = await login("apprentice@archetype.demo");
  let r = await command("user.resetPassword", { id: "apprentice" });
  assert.equal(r.status, 200);
  const temporary = r.data.result.temporaryPassword;
  assert.equal((await request("/api/state", { cookie })).status, 401);
  const signed = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: temporary,
    }),
  });
  assert.equal(signed.data.user.mustChangePassword, true);
  assert.equal((await state(signed.cookie)).learners.length, 0);
  assert.equal(
    (
      await command(
        "message.send",
        { to: "manager", text: "Must change first" },
        signed.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await command(
        "password.change",
        { current: temporary, password: "NewLearnerPassword123!" },
        signed.cookie,
      )
    ).status,
    200,
  );
  const newLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(newLogin.data.user.mustChangePassword, false);
  assert.equal((await state(newLogin.cookie)).learners.length, 1);
  assert.equal(
    (await command("user.setActive", { id: "apprentice", active: false }))
      .status,
    200,
  );
  assert.equal(
    (await request("/api/state", { cookie: newLogin.cookie })).status,
    401,
  );
  assert.equal(
    (
      await request("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: "apprentice@archetype.demo",
          password: "NewLearnerPassword123!",
        }),
      })
    ).status,
    401,
  );
  assert.equal(
    (await command("user.setActive", { id: "manager", active: false })).status,
    400,
  );
  assert.equal(
    (await command("user.setActive", { id: "apprentice", active: true }))
      .status,
    200,
  );
});

test("IQA sampling plans preselect KSBs and evidence, enforce coverage and hide plans from apprentices", async () => {
  const iqaCookie = await login("iqa@archetype.demo");
  const st = await state(iqaCookie),
    learner = st.learners[0];
  const evidence = st.evidence.find(
    (e) =>
      e.learnerId === learner.id &&
      e.status === "Accepted" &&
      (!e.standardId || e.standardId === learner.standardId),
  );
  const criteria = [evidence.criteria[0]];
  let r = await command(
    "sampling.save",
    {
      learnerId: learner.id,
      title: "Quarterly risk sample",
      date: "2026-11-10",
      method: "Risk-based",
      risk: "High",
      criteria,
      evidenceIds: [evidence.id],
      notes: "Check assessor feedback against these KSBs.",
    },
    iqaCookie,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const planId = r.data.result.samplingPlanId;
  assert.equal(
    (
      await command(
        "sampling.status",
        { learnerId: learner.id, id: planId, status: "Completed" },
        iqaCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await command(
        "sampling.save",
        {
          learnerId: learner.id,
          title: "Invalid",
          date: "2026-11-10",
          method: "Interim",
          risk: "Low",
          criteria: ["K999"],
          evidenceIds: [],
        },
        iqaCookie,
      )
    ).status,
    400,
  );
  r = await command(
    "quality.add",
    {
      learnerId: learner.id,
      evidenceId: evidence.id,
      planId,
      outcome: "Agreed",
      notes: "Selected criteria demonstrated; assessment decision agreed.",
    },
    iqaCookie,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.quality.at(-1).planId, planId);
  assert.deepEqual(r.data.state.quality.at(-1).criteria, criteria);
  assert.equal(
    (
      await command(
        "sampling.status",
        { learnerId: learner.id, id: planId, status: "Completed" },
        iqaCookie,
      )
    ).status,
    200,
  );
  await command("user.setActive", { id: "apprentice", active: true });
  const apprenticeLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(apprenticeLogin.status, 200);
  assert.deepEqual((await state(apprenticeLogin.cookie)).samplingPlans, []);
  assert.equal(
    (
      await command(
        "sampling.save",
        { learnerId: learner.id },
        apprenticeLogin.cookie,
      )
    ).status,
    403,
  );
  const assessor = await login("assessor@archetype.demo");
  assert.equal(
    (await command("sampling.save", { learnerId: learner.id }, assessor))
      .status,
    403,
  );
  const other = await command("standard.save", {
    name: "Business Administrator",
    reference: "Another BA reference",
    version: "2",
    level: 3,
    criteria: [{ code: "K1", type: "Knowledge", text: "Duplicate course" }],
  });
  assert.equal(other.status, 400);
});

test("complete review snapshots programme context, creates owned SMART actions, and persists all template sections", async () => {
  const s = await state(),
    l = s.learners[0],
    day = today(),
    nextDate = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
    p = reviewPayload(l, day, nextDate);
  p.template.context = {
    learnerName: "Untrusted name",
    approvedOffJobHours: 99999,
    verifiedProgress: 100,
  };
  p.template.checks.accident = {
    answer: "Yes",
    details: "Follow organisational reporting and catch-up arrangements.",
  };
  p.template.accidentDays = 2;
  p.template.accidentReport = "Completed";
  p.template.checks.roleChanged = {
    answer: "Yes",
    details: "Supervisor change recorded and induction arranged.",
  };
  p.template.induction = "Pending";
  p.template.checks.alsRequested = {
    answer: "Yes",
    details: "Learning support referral agreed.",
  };
  p.template.alsReferral = "Requested";
  const r = await command("review.add", p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const saved = r.data.state.reviews.at(-1);
  assert.equal(saved.template.context.learnerName, l.name);
  assert.equal(saved.template.context.approvedOffJobHours, l.hours);
  assert.equal(saved.template.context.verifiedProgress, l.progress);
  assert.equal(saved.template.responses.english, p.template.responses.english);
  assert.equal(
    saved.template.checks.accident.details,
    p.template.checks.accident.details,
  );
  assert.equal(saved.template.induction, "Pending");
  assert.equal(saved.template.alsReferral, "Requested");
  assert.equal(saved.template.accidentDays, 2);
  assert.equal(saved.acknowledgements.length, 0);
  const tasks = r.data.state.tasks.filter((t) => t.reviewId === saved.id);
  assert.equal(tasks.length, 2);
  assert.deepEqual(
    tasks.map((t) => t.id),
    saved.targetTaskIds,
  );
  assert(
    tasks.every(
      (t) =>
        t.owner === l.assessorId && t.due === nextDate && t.status === "Open",
    ),
  );
  assert.equal(
    (await state()).reviews.at(-1).template.responses.trainingImpact,
    p.template.responses.trainingImpact,
  );
  const foreignCookie = await login("employer@archetype.demo");
  const foreign = (await state(foreignCookie)).reviews.find(
    (x) => x.id === saved.id,
  );
  if (l.employer === "Northstar Digital") assert(foreign);
  else assert(!foreign);
  const assessorCookie = await login("assessor@archetype.demo");
  const acknowledged = await command(
    "review.ack",
    {
      id: saved.id,
      learnerId: l.id,
      by: "apprentice",
      name: "Untrusted signature",
      role: "Apprentice",
    },
    assessorCookie,
  );
  assert.equal(acknowledged.status, 200);
  const signature = acknowledged.data.state.reviews.find(
    (x) => x.id === saved.id,
  ).acknowledgements[0];
  assert.equal(signature.role, "Assessor");
  assert.equal(signature.name, s.users.find((u) => u.id === l.assessorId).name);
});
test("review completion rejects missing coverage, unexplained concerns, invalid owners and targets outside the review period atomically", async () => {
  const l = (await state()).learners[0],
    day = today(),
    next = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
    valid = reviewPayload(l, day, next);
  const before = await state();
  const incomplete = structuredClone(valid);
  delete incomplete.template.responses.safeguardingPrevent;
  assert.equal((await command("review.add", incomplete)).status, 400);
  const concern = structuredClone(valid);
  concern.template.checks.workplaceIssues = { answer: "Yes", details: "" };
  assert.equal((await command("review.add", concern)).status, 400);
  const dates = structuredClone(valid);
  dates.template.targets[0].due = day;
  assert.equal((await command("review.add", dates)).status, 400);
  const owner = structuredClone(valid);
  owner.template.targets[0].owner = "missing-user";
  assert.equal((await command("review.add", owner)).status, 400);
  const category = structuredClone(valid);
  category.template.targets[1].category = "Maths";
  assert.equal((await command("review.add", category)).status, 400);
  const missingReferral = structuredClone(valid);
  missingReferral.template.checks.alsRequested = {
    answer: "Yes",
    details: "Support required",
  };
  assert.equal((await command("review.add", missingReferral)).status, 400);
  const legacy = { ...valid };
  delete legacy.templateVersion;
  delete legacy.template;
  assert.equal((await command("review.add", legacy)).status, 400);
  const after = await state();
  assert.equal(after.reviews.length, before.reviews.length);
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(
    after.learners.find((x) => x.id === l.id).nextReview,
    before.learners.find((x) => x.id === l.id).nextReview,
  );
});

test("administrator review dates create one shared 10-week calendar series, with scoped visibility and protected history", async () => {
  const original = (await state()).learners[0],
    start = addDays(today(), -1),
    end = addDays(start, 210);
  let r = await command("learner.save", {
    ...original,
    initialReviewDate: start,
    predictedEnd: end,
    status: "Active",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let series = r.data.state.appointments.filter(
    (a) =>
      a.learnerId === original.id &&
      a.source === "ten-week-review" &&
      a.status === "Planned",
  );
  assert.equal(series.length, 4);
  assert.equal(series.at(-1).date, end);
  assert(
    series.every(
      (a) =>
        a.participants.includes("assessor") &&
        a.participants.includes("apprentice") &&
        a.participants.includes("employer"),
    ),
  );
  const ids = series.map((a) => a.id);
  let l = r.data.state.learners.find((x) => x.id === original.id);
  r = await command("learner.save", { ...l, notes: "Unrelated notes update" });
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.data.state.appointments
      .filter((a) => ids.includes(a.id))
      .map((a) => a.id),
    ids,
  );
  const assessor = await login("assessor@archetype.demo"),
    employer = await login("employer@archetype.demo");
  const apprentice = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(apprentice.status, 200);
  for (const cookie of [assessor, employer, apprentice.cookie])
    assert.equal(
      (await state(cookie)).appointments.filter((a) => ids.includes(a.id))
        .length,
      4,
    );
  assert.equal(
    (
      await command(
        "learner.save",
        { ...l, initialReviewDate: series[1].date },
        assessor,
      )
    ).status,
    403,
  );
  const ics = await fetch(base + "/api/calendar.ics", {
    headers: { cookie: apprentice.cookie },
  });
  assert.equal(ics.status, 200);
  assert.match(await ics.text(), /DTSTART;VALUE=DATE:/);
  r = await command("review.add", reviewPayload(l, start, series[1].date));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    r.data.state.appointments.find((a) => a.id === ids[0]).status,
    "Completed",
  );
  assert.equal(
    r.data.state.learners.find((x) => x.id === l.id).nextReview,
    series[1].date,
  );
  const extended = addDays(start, 280);
  l = (await state()).learners.find((x) => x.id === l.id);
  r = await command("learner.save", { ...l, predictedEnd: extended });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.state.appointments.filter(
      (a) => a.learnerId === l.id && a.source === "ten-week-review",
    ).length,
    5,
  );
  assert.equal(
    r.data.state.appointments.find((a) => a.id === ids[0]).status,
    "Completed",
  );
  r = await command("user.add", {
    name: "Additional employer contact",
    email: "series-employer@example.test",
    role: "Employer",
    employer: l.employer,
    password: "EmployerTemporaryPassword2026!",
  });
  assert.equal(r.status, 200);
  const addedContact = r.data.state.users.find(
    (u) => u.email === "series-employer@example.test",
  );
  assert(addedContact);
  assert(
    r.data.state.appointments
      .filter(
        (a) =>
          a.learnerId === l.id &&
          a.source === "ten-week-review" &&
          a.status === "Planned",
      )
      .every((a) => a.participants.includes(addedContact.id)),
  );
  assert(
    !r.data.state.appointments
      .find((a) => a.id === ids[0])
      .participants.includes(addedContact.id),
  );
  const upcoming = r.data.state.appointments.find((a) => a.id === ids[1]);
  assert.equal(
    (
      await command("session.save", {
        ...upcoming,
        learnerId: l.id,
        date: addDays(extended, 1),
        time: "10:00",
        endTime: "11:00",
      })
    ).status,
    400,
  );
  const before = await state();
  r = await command("learner.save", {
    ...l,
    initialReviewDate: extended,
    predictedEnd: start,
  });
  assert.equal(r.status, 400);
  assert.equal((await state()).appointments.length, before.appointments.length);
  const current = (await state()).learners.find((x) => x.id === l.id);
  const cleared = await command("learner.save", {
    ...current,
    initialReviewDate: "",
  });
  assert.equal(cleared.status, 200);
  assert.equal(
    cleared.data.state.learners.find((x) => x.id === l.id).nextReview,
    "",
  );
  assert(
    cleared.data.state.appointments
      .filter(
        (a) =>
          a.learnerId === l.id &&
          a.source === "ten-week-review" &&
          a.id !== ids[0],
      )
      .every((a) => a.status === "Cancelled"),
  );
  assert.equal(
    cleared.data.state.appointments.find((a) => a.id === ids[0]).status,
    "Completed",
  );
});

test("administrators edit account roles and caseloads without resetting passwords; access changes revoke sessions", async () => {
  const s = await state();
  const assessor = s.users.find((u) => u.role === "Assessor");
  const cookie = await login(assessor.email);
  const payload = {
    id: assessor.id,
    name: "Updated assessor",
    email: assessor.email,
    role: "Assessor",
    learnerId: "",
    employer: "",
    caseload: [s.learners[0].id],
  };
  assert.equal((await command("user.update", payload, cookie)).status, 403);
  assert.equal((await command("user.update", payload)).status, 200);
  const updated = await state();
  assert.equal(
    updated.users.find((u) => u.id === assessor.id).name,
    "Updated assessor",
  );
  assert.deepEqual(
    updated.learners
      .filter((l) => l.assessorId === assessor.id)
      .map((l) => l.id),
    [s.learners[0].id],
  );
  assert.equal(
    (await command("user.update", { ...payload, role: "IQA" })).status,
    400,
  );
  assert.equal(
    (await command("user.update", { ...payload, caseload: [] })).status,
    200,
  );
  assert.equal(
    (
      await command("user.update", {
        ...payload,
        role: "IQA",
        email: "updated-assessor@example.test",
        caseload: [],
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/state", { cookie })).status, 401);
  assert.ok(await login("updated-assessor@example.test"));
  const manager = updated.users.find((u) => u.id === "manager");
  assert.equal(
    (
      await command("user.update", {
        ...payload,
        id: manager.id,
        email: manager.email,
        role: "Employer",
      })
    ).status,
    400,
  );
});

test("standard edits retain identity and evidence mappings and reject duplicates and removal of used criteria", async () => {
  const s = await state();
  const evidence = s.evidence.find(
    (e) => e.criteria?.length && s.learners.some((l) => l.id === e.learnerId),
  );
  const learner = s.learners.find((l) => l.id === evidence.learnerId);
  const standard = s.standards.find(
    (st) => st.id === (evidence.standardId || learner.standardId),
  );
  const payload = {
    ...standard,
    name: standard.name + " updated",
    criteria: standard.criteria.map((c) => ({
      ...c,
      text: c.text + " clarified",
    })),
  };
  const apprentice = (
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "apprentice@archetype.demo",
        password: "NewLearnerPassword123!",
      }),
    })
  ).cookie;
  assert.ok(apprentice);
  assert.equal(
    (await command("standard.save", payload, apprentice)).status,
    403,
  );
  assert.equal((await command("standard.save", payload)).status, 200);
  const next = await state();
  assert.equal(next.standards.length, s.standards.length);
  assert.equal(
    next.standards.find((st) => st.id === standard.id).name,
    payload.name,
  );
  assert.deepEqual(
    next.evidence.find((e) => e.id === evidence.id).criteria,
    evidence.criteria,
  );
  assert.equal(
    (
      await command("standard.save", {
        ...payload,
        criteria: payload.criteria.filter(
          (c) => c.code !== evidence.criteria[0],
        ),
      })
    ).status,
    400,
  );
  const other = s.standards.find((st) => st.id !== standard.id);
  assert.equal(
    (await command("standard.save", { ...payload, reference: other.reference }))
      .status,
    400,
  );
});

test("WBL imports require a manager, retain real learners and keep staff tracker notes private", async () => {
  const r = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(r.status, 200);
  const apprentice = r.cookie;
  const before = await state();
  const learnerId = (await state(apprentice)).learners[0].id;
  const learner = before.learners.find((l) => l.id === learnerId);
  const standard = before.standards.find((st) => st.id === learner.standardId);
  const sheetRows = [
    [
      "Pro Ref No",
      "First Name",
      "Last Name",
      "Apprenticeship Title",
      "Level",
      "Employer",
      "Comments/1:1 Notes",
      "DAS COHORT REFERENCE",
    ],
    [
      learner.ref,
      "",
      "",
      standard.name,
      standard.level,
      learner.employer,
      "Synthetic confidential tracker note",
      "Leave this administrative value out",
    ],
  ];
  assert.equal(
    (await command("learners.importTracker", { sheetRows }, apprentice)).status,
    403,
  );
  assert.equal(
    (await command("learners.importTracker", { sheetRows: [] })).status,
    400,
  );
  assert.equal((await state()).learners.length, before.learners.length);
  const imported = await command("learners.importTracker", { sheetRows });
  assert.equal(imported.status, 200);
  assert.equal(imported.data.result.updated, 1);
  assert.equal(imported.data.state.learners.length, before.learners.length);
  const updated = imported.data.state.learners.find((l) => l.id === learner.id);
  assert.equal(updated.name, learner.name);
  assert.equal(
    updated.tracker.fields["Comments/1:1 Notes"],
    "Synthetic confidential tracker note",
  );
  assert.equal(updated.tracker.fields["DAS COHORT REFERENCE"], undefined);
  assert.equal((await state(apprentice)).learners[0].tracker, undefined);
});

test("an imported empty standard can have its details edited before KSBs are supplied", async () => {
  const sheetRows = [
    ["Pro Ref No", "Apprenticeship Title", "Level"],
    ["EMPTY-STANDARD-EDIT", "Synthetic empty programme", 3],
  ];
  assert.equal(
    (await command("learners.importTracker", { sheetRows })).status,
    200,
  );
  const current = await state();
  const st = current.standards.find((x) =>
    x.name.startsWith("Synthetic empty programme"),
  );
  assert.ok(st);
  assert.equal(
    (
      await command("standard.save", {
        ...st,
        name: "Updated empty programme",
        version: "Awaiting KSB schedule",
      })
    ).status,
    200,
  );
  assert.equal(
    (await state()).standards.find((x) => x.id === st.id).name,
    "Updated empty programme",
  );
  assert.equal(
    (
      await command("standard.save", {
        name: "Another empty standard",
        reference: "EMPTY-NEW",
        level: 3,
        version: "New",
        criteria: [],
      })
    ).status,
    400,
  );
});

test("action completion is explicit and repeatable, retains the completion record, and supports reopening", async () => {
  const apprenticeLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(apprenticeLogin.status, 200);
  const apprentice = apprenticeLogin.cookie;
  const learner = (await state(apprentice)).learners[0];
  assert.equal(
    (
      await command("task.add", {
        learnerId: learner.id,
        title: "Action status regression",
        owner: "manager",
        due: "2026-12-01",
      })
    ).status,
    200,
  );
  const task = (await state()).tasks.find(
    (t) => t.title === "Action status regression",
  );
  const payload = { id: task.id, learnerId: learner.id, status: "Complete" };
  assert.equal(
    (await command("task.setStatus", payload, apprentice)).status,
    403,
  );
  let r = await command("task.setStatus", payload);
  assert.equal(r.status, 200);
  let completed = r.data.state.tasks.find((t) => t.id === task.id);
  assert.equal(completed.status, "Complete");
  assert.equal(completed.completedBy, "manager");
  assert.ok(completed.completedAt);
  r = await command("task.setStatus", payload);
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.data.state.tasks.find((t) => t.id === task.id),
    completed,
  );
  assert.equal(
    (await command("task.setStatus", { ...payload, status: "Invalid" })).status,
    400,
  );
  r = await command("task.setStatus", { ...payload, status: "Open" });
  assert.equal(r.status, 200);
  const reopened = r.data.state.tasks.find((t) => t.id === task.id);
  assert.equal(reopened.status, "Open");
  assert.equal(reopened.completedAt, undefined);
});

test("feedback attachments, confidential portfolio notes and EPA exports enforce role and learner permissions", async () => {
  const apprenticeLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(apprenticeLogin.status, 200);
  const apprentice = apprenticeLogin.cookie;
  const learner = (await state(apprentice)).learners[0];
  const full = await state();
  const standard = full.standards.find((st) => st.id === learner.standardId);
  let r = await command(
    "evidence.save",
    {
      learnerId: learner.id,
      title: "Feedback and EPA regression",
      type: "Assignment",
      date: today(),
      description: "Synthetic apprentice submission",
      criteria: [standard.criteria[0].code],
      status: "Submitted",
      files: [
        {
          name: "work.txt",
          base64: Buffer.from("Synthetic work").toString("base64"),
        },
      ],
    },
    apprentice,
  );
  assert.equal(r.status, 200);
  const evidence = r.data.state.evidence.find(
    (e) => e.title === "Feedback and EPA regression",
  );
  assert.equal(
    (
      await command("evidence.assess", {
        id: evidence.id,
        status: "Rejected",
        feedback: "Not a supported decision",
      })
    ).status,
    400,
  );
  r = await command("evidence.assess", {
    id: evidence.id,
    status: "Accepted",
    feedback: "Feedback with an attachment",
    files: [
      {
        name: "feedback.txt",
        base64: Buffer.from("Synthetic feedback").toString("base64"),
      },
    ],
  });
  assert.equal(r.status, 200);
  const assessed = r.data.state.evidence.find((e) => e.id === evidence.id);
  assert.equal(assessed.feedbackFiles.length, 1);
  assert.equal(assessed.decisions.at(-1).files.length, 1);
  const feedback = await fetch(
    base + "/api/files/" + assessed.feedbackFiles[0].id,
    { headers: { cookie: apprentice } },
  );
  assert.equal(feedback.status, 200);
  assert.equal(await feedback.text(), "Synthetic feedback");
  assert.equal(
    (
      await command(
        "learner.privateNote",
        {
          learnerId: learner.id,
          text: "Confidential portfolio regression note",
        },
        apprentice,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await command("learner.privateNote", {
        learnerId: learner.id,
        text: "Confidential portfolio regression note",
      })
    ).status,
    200,
  );
  const iqa = await login("iqa@archetype.demo");
  assert.equal((await state(iqa)).privateLearnerNotes.length, 0);
  assert.equal((await state(apprentice)).privateLearnerNotes.length, 0);
  assert.ok(
    (await state()).privateLearnerNotes.some(
      (n) => n.text === "Confidential portfolio regression note",
    ),
  );
  assert.equal(
    (
      await command(
        "evidence.epa",
        { id: evidence.id, selected: true },
        apprentice,
      )
    ).status,
    200,
  );
  const pack = await fetch(base + "/api/epa/" + learner.id + ".zip", {
    headers: { cookie: apprentice },
  });
  assert.equal(pack.status, 200);
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(await pack.arrayBuffer());
  const manifest = await archive.file("portfolio.json").async("string");
  assert.ok(manifest.includes("Feedback and EPA regression"));
  assert.ok(!manifest.includes("Confidential portfolio regression note"));
  assert.ok(Object.keys(archive.files).some((n) => n.endsWith("feedback.txt")));
  const employer = await login("employer@archetype.demo");
  assert.equal(
    (
      await fetch(base + "/api/epa/" + learner.id + ".zip", {
        headers: { cookie: employer },
      })
    ).status,
    403,
  );
});

test("learning methods and reusable activities preserve mappings without copying learner reflections", async () => {
  const s = await state(),
    learner = s.learners[0];
  for (const method of [
    "Discussion",
    "Observation",
    "Review",
    "Learner support",
  ]) {
    const r = await command("plan.save", {
      learnerId: learner.id,
      title: "Reusable " + method,
      description: "A reusable learning activity",
      objectives: "Demonstrate learning",
      method,
      criteria: [],
      resources: [],
      startDate: today(),
      due: addDays(today(), 7),
      plannedHours: 1,
      status: "Planned",
    });
    assert.equal(r.status, 200);
    assert.equal(
      r.data.state.learningPlans.find((a) => a.title === "Reusable " + method)
        .method,
      method,
    );
  }
  const activity = (await state()).learningPlans.find(
    (a) => a.title === "Reusable Discussion",
  );
  const r = await command("plan.template.save", { id: activity.id });
  assert.equal(r.status, 200);
  const template = r.data.state.learningTemplates.at(-1);
  assert.equal(template.method, "Discussion");
  assert.equal(template.learnerId, undefined);
  assert.equal(template.reflection, undefined);
  const iqa = await login("iqa@archetype.demo");
  assert.equal((await state(iqa)).learningTemplates.length, 0);
});

test("review targets create linked learning-plan activities and optional functional skills decisions are audited", async () => {
  let s = await state();
  let learner = s.learners.find((l) => l.assessorId);
  if (!learner) learner = s.learners[0];
  // The fixture's original assessor may have changed roles in an earlier permissions test.
  const owner = s.users.find((u) => u.id === "manager");
  learner = { ...learner, assessorId: owner.id };
  const p = reviewPayload(learner, today(), addDays(today(), 21));
  p.template.targets.forEach((t) => {
    t.owner = owner.id;
    delete t.why;
  });
  p.template.targets[1].hours = 4;
  const r = await command("review.add", p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const review = r.data.state.reviews.at(-1);
  assert.equal(review.targetPlanIds.length, p.template.targets.length);
  const plans = r.data.state.learningPlans.filter(
    (a) => a.reviewId === review.id,
  );
  assert.equal(plans.length, p.template.targets.length);
  assert.equal(plans[1].plannedHours, 4);
  assert.ok(plans.every((a) => a.reviewTaskId));
  const hoursBefore = r.data.state.learners.find(
    (l) => l.id === learner.id,
  ).hours;
  const completed = await command("task.setStatus", {
    id: plans[0].reviewTaskId,
    learnerId: learner.id,
    status: "Complete",
  });
  assert.equal(
    completed.data.state.learningPlans.find((a) => a.id === plans[0].id).status,
    "Completed",
  );
  assert.equal(
    completed.data.state.learners.find((l) => l.id === learner.id).hours,
    hoursBefore,
  );

  const skills = await command("learner.functionalSkills", {
    learnerId: learner.id,
    englishNotRequired: true,
    mathsNotRequired: true,
  });
  assert.equal(skills.status, 200);
  const updated = skills.data.state.learners.find((l) => l.id === learner.id);
  assert.equal(updated.functionalSkillsConfirmedBy, "manager");
  assert.ok(
    updated.gatewayChecks.some(
      ([label, ok]) => label.startsWith("English") && ok,
    ),
  );
});

test("EPA folder selection supports uploaded work before assessment and survives edits without exporting unaccepted work", async () => {
  const r = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(r.status, 200);
  const cookie = r.cookie,
    learner = (await state(cookie)).learners[0],
    s = await state(),
    standard = s.standards.find((st) => st.id === learner.standardId);
  const payload = {
    learnerId: learner.id,
    title: "EPA chosen upload",
    type: "Reflective account",
    date: today(),
    description: "Draft work chosen for the EPA folder",
    criteria: [standard.criteria[0].code],
    status: "Draft",
    files: [],
  };
  let created = await command("evidence.save", payload, cookie);
  assert.equal(created.status, 200);
  const evidence = created.data.state.evidence.find(
    (e) => e.title === payload.title,
  );
  assert.equal(
    (await command("evidence.epa", { id: evidence.id, selected: true }, cookie))
      .status,
    200,
  );
  const saved = await command(
    "evidence.save",
    {
      ...payload,
      id: evidence.id,
      description: "Updated selected evidence",
      status: "Submitted",
    },
    cookie,
  );
  assert.equal(saved.status, 200);
  assert.equal(
    saved.data.state.evidence.find((e) => e.id === evidence.id).epaSelected,
    true,
  );
  const pack = await fetch(base + "/api/epa/" + learner.id + ".zip", {
    headers: { cookie },
  });
  assert.equal(pack.status, 200);
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await pack.arrayBuffer());
  assert.ok(
    !(await zip.file("portfolio.json").async("string")).includes(payload.title),
  );
  const foreign = s.evidence.find((e) => e.learnerId !== learner.id);
  assert.equal(
    (await command("evidence.epa", { id: foreign.id, selected: true }, cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await command("evidence.assess", {
        id: evidence.id,
        status: "Accepted",
        feedback: "Selected work accepted",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        "evidence.epa",
        { id: evidence.id, selected: false },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await state(cookie)).evidence.find((e) => e.id === evidence.id)
      .epaSelected,
    false,
  );
});

test("Outlook subscriptions work without browser sessions, follow edits, and are revoked by account security changes", async () => {
  const email = "outlook-assessor@example.test",
    temporary = "Outlook initial password 2026!",
    chosen = "Outlook chosen password 2026!";
  assert.equal(
    (
      await command("user.add", {
        name: "Outlook Assessor",
        email,
        role: "Assessor",
        password: temporary,
      })
    ).status,
    200,
  );
  let signed = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password: temporary }),
  });
  assert.equal(signed.status, 200);
  assert.equal(
    (
      await command(
        "password.change",
        { current: temporary, password: chosen },
        signed.cookie,
      )
    ).status,
    200,
  );
  signed = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password: chosen }),
  });
  let cookie = signed.cookie;
  let s = await state(),
    assessor = s.users.find((u) => u.email === email),
    learner = s.learners[0];
  const account = {
    id: assessor.id,
    name: assessor.name,
    email,
    role: "Assessor",
    learnerId: "",
    employer: "",
    caseload: [learner.id],
  };
  assert.equal((await command("user.update", account)).status, 200);
  const sessionPayload = {
    learnerId: learner.id,
    title: "Outlook subscribed session",
    type: "Teaching session",
    date: addDays(today(), 7),
    time: "10:00",
    endTime: "11:00",
    delivery: "Online",
    meetingUrl: "https://example.org/session",
    location: "Online",
    description: "PRIVATE session description",
    notes: "PRIVATE session discussion",
    staffNotes: "PRIVATE STAFF INFORMATION",
    objectives: "PRIVATE objectives",
    preparation: "PRIVATE preparation",
    criteria: [],
    resources: [],
    participants: [assessor.id],
    status: "Planned",
  };
  let created = await command("session.save", sessionPayload, cookie);
  assert.equal(created.status, 200);
  const appointment = created.data.state.appointments.find(
    (a) => a.title === sessionPayload.title,
  );
  let subscription = await command("calendar.subscribe", {}, cookie);
  assert.equal(subscription.status, 200);
  const url = new URL(subscription.data.result.url);
  assert.match(
    url.pathname,
    /\/api\/calendar\/subscription\/[A-Za-z0-9_-]{43}\.ics$/,
  );
  const read = (path) => fetch(base + path);
  let response = await read(url.pathname);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/calendar/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  let text = await response.text();
  assert.ok(text.includes("Outlook subscribed session"));
  assert.ok(!text.includes("PRIVATE "));
  assert.ok(text.includes(`UID:session-${appointment.id}@archetype`));
  assert.equal((await read("/api/state")).status, 401);
  const head = await fetch(base + url.pathname, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const status = await request("/api/calendar/subscription", { cookie });
  assert.equal(status.status, 200);
  assert.equal(status.data.enabled, true);
  assert.ok(status.data.lastFetched);
  assert.ok(
    !JSON.stringify(status.data).includes(url.pathname.split("/").at(-1)),
  );
  let changed = await command(
    "session.save",
    {
      ...sessionPayload,
      id: appointment.id,
      title: "Outlook updated session",
      status: "Cancelled",
      cancellationReason: "Rescheduled for the subscription test",
    },
    cookie,
  );
  assert.equal(changed.status, 200);
  text = await (await read(url.pathname)).text();
  assert.ok(text.includes("Outlook updated session"));
  assert.ok(text.includes("STATUS:CANCELLED"));
  assert.ok(text.includes(`UID:session-${appointment.id}@archetype`));
  subscription = await command("calendar.subscribe", {}, cookie);
  let currentPath = new URL(subscription.data.result.url).pathname;
  assert.equal((await read(url.pathname)).status, 404);
  assert.equal((await read(currentPath)).status, 200);
  assert.equal((await command("calendar.unsubscribe", {}, cookie)).status, 200);
  assert.equal((await read(currentPath)).status, 404);
  subscription = await command("calendar.subscribe", {}, cookie);
  currentPath = new URL(subscription.data.result.url).pathname;
  assert.equal(
    (await command("user.setActive", { id: assessor.id, active: false }))
      .status,
    200,
  );
  assert.equal((await read(currentPath)).status, 404);
  assert.equal(
    (await command("user.setActive", { id: assessor.id, active: true })).status,
    200,
  );
  assert.equal((await read(currentPath)).status, 404);
  signed = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password: chosen }),
  });
  cookie = signed.cookie;
  subscription = await command("calendar.subscribe", {}, cookie);
  currentPath = new URL(subscription.data.result.url).pathname;
  assert.equal(
    (
      await command(
        "password.change",
        { current: chosen, password: "Another Outlook password 2026!" },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal((await read(currentPath)).status, 404);
  const iqa = await login("iqa@archetype.demo");
  assert.equal(
    (await command("calendar.subscribe", { userId: assessor.id }, iqa)).status,
    403,
  );
});

test("standard libraries retain linked resources and staff can revise and reassess evidence without losing history", async () => {
  const manager = await login("manager@archetype.demo");
  let s = await state(manager);
  const standard = {
    name: "Resource library workflow",
    reference: "ST9998",
    version: "1.0",
    level: 3,
    criteria: [{ code: "K1", type: "Knowledge", text: "Demonstrate learning" }],
  };
  assert.equal((await command("standard.save", standard, manager)).status, 200);
  s = await state(manager);
  const created = s.standards.find((x) => x.reference === standard.reference);
  assert(created);
  assert.equal(
    s.resources.filter((r) => r.standardId === created.id).length,
    0,
  );
  assert.equal(
    (
      await command(
        "resource.add",
        {
          title: "Course guide",
          category: "Learning material",
          standardId: created.id,
          url: "https://example.com/guide",
        },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        "standard.save",
        { ...created, name: "Updated library workflow" },
        manager,
      )
    ).status,
    200,
  );
  s = await state(manager);
  assert.equal(
    s.resources.find((r) => r.title === "Course guide").standardId,
    created.id,
  );
  const learner = s.learners[0],
    st = s.standards.find((x) => x.id === learner.standardId);
  const payload = {
    learnerId: learner.id,
    title: "Revision workflow",
    type: "Work product",
    date: today(),
    description: "Original evidence content",
    criteria: [st.criteria[0].code],
    status: "Submitted",
    files: [],
  };
  assert.equal((await command("evidence.save", payload, manager)).status, 200);
  let evidence = (await state(manager)).evidence.find(
    (e) => e.title === payload.title,
  );
  assert.equal(
    (
      await command(
        "evidence.assess",
        {
          id: evidence.id,
          status: "Accepted",
          feedback: "Original decision",
          files: [],
        },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        "evidence.assess",
        {
          id: evidence.id,
          status: "Changes requested",
          feedback: "Reassessment identifies a gap",
          files: [],
        },
        manager,
      )
    ).status,
    200,
  );
  evidence = (await state(manager)).evidence.find((e) => e.id === evidence.id);
  assert.equal(evidence.decisions.length, 2);
  assert.equal(evidence.decisions[0].status, "Accepted");
  assert.equal(evidence.decisions[1].evidence.description, payload.description);
  assert.equal(
    (
      await command(
        "evidence.assess",
        {
          id: evidence.id,
          status: "Accepted",
          feedback: "Gap resolved",
          files: [],
        },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        "evidence.save",
        {
          ...payload,
          id: evidence.id,
          title: "Revised evidence",
          description: "Updated evidence content",
        },
        manager,
      )
    ).status,
    200,
  );
  evidence = (await state(manager)).evidence.find((e) => e.id === evidence.id);
  assert.equal(evidence.status, "Submitted");
  assert.equal(evidence.revisions.at(-1).description, payload.description);
  assert.equal(evidence.revisions.at(-1).status, "Accepted");
  assert.equal(evidence.decisions.length, 3);
  assert.equal(
    (
      await command(
        "evidence.assess",
        {
          id: evidence.id,
          status: "Accepted",
          feedback: "Revised work accepted",
          files: [],
        },
        manager,
      )
    ).status,
    200,
  );
  evidence = (await state(manager)).evidence.find((e) => e.id === evidence.id);
  assert.equal(evidence.decisions.length, 4);
  assert.equal(
    evidence.decisions.at(-1).evidence.description,
    "Updated evidence content",
  );
  const apprenticeLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(apprenticeLogin.status, 200);
  const apprentice = apprenticeLogin.cookie;
  const own = (await state(apprentice)).learners[0];
  const ownEvidence = (await state(apprentice)).evidence.find(
    (e) => e.learnerId === own.id && e.status === "Accepted",
  );
  if (ownEvidence)
    assert.equal(
      (
        await command(
          "evidence.save",
          { ...ownEvidence, learnerId: own.id, status: "Submitted" },
          apprentice,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await command(
        "evidence.assess",
        { id: evidence.id, status: "Accepted", feedback: "Unauthorised" },
        apprentice,
      )
    ).status,
    403,
  );
});

test("apprentice photos persist privately, can be replaced and removed, and enforce learner access", async () => {
  const manager = await login("manager@archetype.demo"),
    s = await state(manager),
    learner = s.learners[0];
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
  const path = `/api/learners/${learner.id}/photo`;
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (
      await command(
        "learner.photo",
        {
          learnerId: learner.id,
          file: { base64: Buffer.from("<svg></svg>").toString("base64") },
        },
        manager,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await command(
        "learner.photo",
        { learnerId: learner.id, file: { base64: png } },
        manager,
      )
    ).status,
    200,
  );
  let photo = (await state(manager)).learners.find(
    (l) => l.id === learner.id,
  ).photo;
  assert(photo.id);
  let response = await fetch(base + path, { headers: { cookie: manager } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from(png, "base64"),
  );
  assert.equal(
    (
      await command(
        "learner.photo",
        { learnerId: learner.id, file: { base64: png } },
        manager,
      )
    ).status,
    200,
  );
  const replaced = (await state(manager)).learners.find(
    (l) => l.id === learner.id,
  ).photo;
  assert.notEqual(replaced.id, photo.id);
  const apprenticeLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(apprenticeLogin.status, 200);
  const apprentice = apprenticeLogin.cookie,
    own = (await state(apprentice)).learners[0];
  const other = s.learners.find((l) => l.id !== own.id);
  assert.equal(
    (
      await command(
        "learner.photo",
        { learnerId: other.id, file: { base64: png } },
        apprentice,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + `/api/learners/${other.id}/photo`, {
        headers: { cookie: apprentice },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await command(
        "learner.photo",
        { learnerId: own.id, file: { base64: png } },
        apprentice,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        "learner.photo",
        { learnerId: learner.id, remove: true },
        manager,
      )
    ).status,
    200,
  );
  const removed = (await state(manager)).learners.find(
    (l) => l.id === learner.id,
  );
  assert.equal(removed.photo, null);
  assert.equal(removed.photoHidden, true);
  assert.equal(
    (await fetch(base + path, { headers: { cookie: manager } })).status,
    404,
  );
});

test("direct Outlook endpoints require staff authentication, fail safely without Microsoft setup, and expose no credentials", async () => {
  const manager = await login("manager@archetype.demo");
  assert.equal((await request("/api/outlook/status")).status, 401);
  const status = await request("/api/outlook/status", { cookie: manager });
  assert.equal(status.status, 200);
  assert.equal(status.data.configured, false);
  assert.equal(status.data.connected, false);
  assert(!JSON.stringify(status.data).includes("CLIENT_SECRET_VALUE"));
  assert.equal(
    (
      await request("/api/outlook/connect", {
        cookie: manager,
        method: "POST",
        body: "{}",
      })
    ).status,
    503,
  );
  const iqa = await login("iqa@archetype.demo");
  assert.equal(
    (await request("/api/outlook/status", { cookie: iqa })).status,
    403,
  );
  const callback = await fetch(
    base + "/api/outlook/callback?state=not-a-valid-state&code=secret-code",
  );
  assert.equal(callback.status, 400);
  assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
  assert(!(await callback.text()).includes("secret-code"));
});

test("personal and ALS records and supporting documents are private to the manager and assigned assessor", async () => {
  const manager = await login("manager@archetype.demo");
  let s = await state(manager),
    l = s.learners[0];
  const payload = {
    ...l,
    id: l.id,
    assessorId: s.users.find((u) => u.active && u.role === "Assessor").id,
    iqaId: s.users.find((u) => u.active && u.role === "IQA").id,
    address: "PRIVATE ADDRESS 42 Example Lane",
    dateOfBirth: "2001-04-14",
    alsStatus: "Support in place",
    alsDetails: "PRIVATE ALS assessment",
    reasonableAdjustments: "PRIVATE agreed adjustments",
    supportReviewDate: today(),
    documentCategory: "Medical information",
    supportFiles: [
      {
        name: "synthetic-medical.txt",
        base64: Buffer.from("PRIVATE MEDICAL FILE").toString("base64"),
      },
    ],
  };
  assert.equal((await command("learner.save", payload, manager)).status, 200);
  s = await state(manager);
  const support = s.learnerSupportRecords.find((r) => r.learnerId === l.id);
  assert.equal(support.address, payload.address);
  assert.equal(support.dateOfBirth, payload.dateOfBirth);
  assert.equal(support.documents.length, 1);
  const path = "/api/learner-documents/" + support.documents[0].id;
  assert.equal((await fetch(base + path)).status, 401);
  const downloaded = await fetch(base + path, { headers: { cookie: manager } });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "PRIVATE MEDICAL FILE");
  assert.match(downloaded.headers.get("content-disposition"), /attachment/);
  for (const email of ["iqa@archetype.demo", "employer@archetype.demo"]) {
    const account = await login(email);
    assert.equal((await state(account)).learnerSupportRecords.length, 0);
    assert.equal(
      (await fetch(base + path, { headers: { cookie: account } })).status,
      403,
    );
  }
  const learnerLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(learnerLogin.status, 200);
  assert.equal(
    (await state(learnerLogin.cookie)).learnerSupportRecords.length,
    0,
  );
  assert.equal(
    (await fetch(base + path, { headers: { cookie: learnerLogin.cookie } }))
      .status,
    403,
  );
  const future = { ...payload, dateOfBirth: "2099-01-01", supportFiles: [] };
  assert.equal((await command("learner.save", future, manager)).status, 400);
  assert.equal(
    (
      await command(
        "learner.document.remove",
        { learnerId: l.id, id: support.documents[0].id },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (await fetch(base + path, { headers: { cookie: manager } })).status,
    404,
  );

  // Access is tested with a newly created independent assessor below, without relying on changed fixture passwords.
  const add = await command(
    "user.add",
    {
      name: "Support record assessor",
      email: "support-assessor@example.test",
      role: "Assessor",
      password: "Support assessor temporary 2026!",
    },
    manager,
  );
  assert.equal(add.status, 200);
  const created = (await state(manager)).users.find(
    (u) => u.email === "support-assessor@example.test",
  );
  const aLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: created.email,
      password: "Support assessor temporary 2026!",
    }),
  });
  assert.equal(aLogin.status, 200);
  assert.equal(
    (
      await command(
        "password.change",
        {
          current: "Support assessor temporary 2026!",
          password: "Support assessor chosen 2026!",
        },
        aLogin.cookie,
      )
    ).status,
    200,
  );
  const aAgain = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: created.email,
      password: "Support assessor chosen 2026!",
    }),
  });
  assert.equal(aAgain.status, 200);
  assert.equal((await state(aAgain.cookie)).learnerSupportRecords.length, 0);
  const current = (await state(manager)).learners.find((x) => x.id === l.id);
  assert.equal(
    (
      await command(
        "learner.save",
        { ...current, id: l.id, assessorId: created.id },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (await state(aAgain.cookie)).learnerSupportRecords.find(
      (r) => r.learnerId === l.id,
    ).alsDetails,
    payload.alsDetails,
  );
  assert.equal(
    (
      await command(
        "learner.save",
        {
          ...current,
          id: l.id,
          assessorId: created.id,
          address: "Updated assigned assessor address",
        },
        aAgain.cookie,
      )
    ).status,
    200,
  );
});
test("master-managed assessor 1:1 logs preserve revisions and success stories publish approved text to every assessor", async () => {
  const manager = await login("manager@archetype.demo");
  const s = await state(manager),
    assessor = s.users.find((u) => u.role === "Assessor");
  const record = {
    assessorId: assessor.id,
    title: "PRIVATE STAFF CONVERSATION",
    date: today(),
    status: "Completed",
    summary: "PRIVATE SUMMARY",
    performance: "PRIVATE PERFORMANCE",
    wellbeing: "PRIVATE WELLBEING",
    development: "PRIVATE CPD",
    actions: "PRIVATE ACTIONS",
    confidentialNotes: "PRIVATE MANAGEMENT NOTES",
    nextDate: today(),
  };
  assert.equal(
    (await command("assessor.oneToOne.save", record, manager)).status,
    200,
  );
  let records = (await state(manager)).assessorOneToOnes;
  const item = records.find((r) => r.title === record.title);
  assert(item);
  assert.equal(
    (
      await command(
        "assessor.oneToOne.save",
        { ...record, id: item.id, summary: "Updated private summary" },
        manager,
      )
    ).status,
    200,
  );
  records = (await state(manager)).assessorOneToOnes;
  assert.equal(
    records.find((r) => r.id === item.id).history[0].summary,
    "PRIVATE SUMMARY",
  );
  const loginResult = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "support-assessor@example.test",
      password: "Support assessor chosen 2026!",
    }),
  });
  assert.equal(loginResult.status, 200);
  const a = loginResult.cookie;
  assert.equal((await state(a)).assessorOneToOnes.length, 0);
  assert.equal(
    (await command("assessor.oneToOne.save", record, a)).status,
    403,
  );
  const story = {
    kind: "Learner success",
    personName: "Fictional Achievement",
    title: "A milestone worth sharing",
    achievement: "Completed a workplace project",
    story: "Public success story chosen by the manager.",
    quote: "I can see how far I have come.",
    published: false,
  };
  assert.equal((await command("spotlight.save", story, manager)).status, 200);
  assert.equal((await state(a)).successStories.length, 0);
  let draft = (await state(manager)).successStories.find(
    (x) => x.title === story.title,
  );
  assert.equal(
    (
      await command(
        "spotlight.save",
        { ...story, id: draft.id, published: true },
        manager,
      )
    ).status,
    200,
  );
  const visibleStories = (await state(a)).successStories;
  assert.equal(visibleStories.length, 1);
  assert.equal(visibleStories[0].title, story.title);
  assert(!JSON.stringify(visibleStories).includes("PRIVATE"));
  const iqa = await login("iqa@archetype.demo");
  assert.equal((await state(iqa)).successStories.length, 0);
  assert.equal(
    (await command("spotlight.save", { ...story, published: true }, a)).status,
    403,
  );
  assert.equal(
    (
      await command(
        "spotlight.save",
        {
          ...story,
          title: "Assessor achievement",
          kind: "Assessor success",
          published: true,
        },
        manager,
      )
    ).status,
    200,
  );
  assert.equal((await state(a)).successStories.length, 2);
  assert(
    (await state(a)).successStories.some(
      (post) => post.title === "Assessor achievement",
    ),
  );
});

test("personal support records, protected documents, supervision logs and published stories survive a server restart", async () => {
  const manager = await login("manager@archetype.demo");
  let s = await state(manager);
  const l = s.learners[0];
  assert.equal(
    (
      await command(
        "learner.save",
        {
          ...l,
          id: l.id,
          supportFiles: [
            {
              name: "persistent-certificate.txt",
              base64: Buffer.from("Persistent synthetic certificate").toString(
                "base64",
              ),
            },
          ],
          documentCategory: "Certificate",
        },
        manager,
      )
    ).status,
    200,
  );
  const before = await state(manager);
  const document = before.learnerSupportRecords
    .find((r) => r.learnerId === l.id)
    .documents.find((d) => d.name === "persistent-certificate.txt");
  assert(document);
  proc.kill();
  await new Promise((resolve) => proc.once("exit", resolve));
  proc = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      PORT: new URL(base).port,
      DATA_DIR: dir,
      DEMO_MODE: "1",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/api/health")).status === 200) break;
    } catch {}
    await pause(50);
  }
  s = await state(manager);
  assert.deepEqual(s.learnerSupportRecords, before.learnerSupportRecords);
  assert.deepEqual(s.assessorOneToOnes, before.assessorOneToOnes);
  assert.deepEqual(s.successStories, before.successStories);
  const download = await fetch(base + "/api/learner-documents/" + document.id, {
    headers: { cookie: manager },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Persistent synthetic certificate");
});

test("success stories can be unpublished and deleted only by master administrators without changing other stories", async () => {
  const manager = await login("manager@archetype.demo");
  const before = await state(manager),
    published = before.successStories.find((story) => story.published);
  assert(published);
  const aLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "support-assessor@example.test",
      password: "Support assessor chosen 2026!",
    }),
  });
  assert.equal(aLogin.status, 200);
  assert.equal(
    (await command("spotlight.unpublish", { id: published.id }, aLogin.cookie))
      .status,
    403,
  );
  assert.equal(
    (await command("spotlight.unpublish", { id: published.id }, manager))
      .status,
    200,
  );
  let s = await state(manager);
  assert.equal(s.successStories.length, before.successStories.length);
  assert.equal(
    s.successStories.find((story) => story.id === published.id).story,
    published.story,
  );
  assert(
    !(await state(aLogin.cookie)).successStories.some(
      (post) => post.id === published.id,
    ),
  );
  assert.equal(
    (
      await command(
        "spotlight.save",
        { ...published, published: true },
        manager,
      )
    ).status,
    200,
  );
  assert(
    (await state(aLogin.cookie)).successStories.some(
      (post) => post.id === published.id,
    ),
  );
  const untouched = s.successStories.filter(
    (story) => story.id !== published.id,
  );
  assert.equal(
    (await command("spotlight.delete", { id: published.id }, aLogin.cookie))
      .status,
    403,
  );
  assert.equal(
    (await command("spotlight.delete", { id: published.id }, manager)).status,
    200,
  );
  s = await state(manager);
  assert.deepEqual(s.successStories, untouched);
  assert(
    !(await state(aLogin.cookie)).successStories.some(
      (post) => post.id === published.id,
    ),
  );
  assert.equal(
    (await command("spotlight.delete", { id: published.id }, manager)).status,
    404,
  );
});
test("quick session and review attendance is scoped, reversible and separate from completion and OTJ approval", async () => {
  const manager = await login("manager@archetype.demo"),
    s = await state(manager),
    l = s.learners[0];
  const beforeReviews = s.reviews.length,
    beforeHours = l.hours,
    beforeNextReview = l.nextReview;
  const basePayload = {
    learnerId: l.id,
    date: today(),
    time: "09:00",
    endTime: "10:00",
    delivery: "Online",
    location: "Fictional training room",
    description: "Quick attendance test",
    criteria: [],
    resources: [],
    participants: ["manager"],
    status: "Planned",
    updateReviewDue: false,
  };
  for (const type of ["Teaching session", "Progress review"]) {
    const title = "Quick attendance · " + type;
    assert.equal(
      (await command("session.save", { ...basePayload, title, type }, manager))
        .status,
      200,
    );
    let a = (await state(manager)).appointments.find((a) => a.title === title);
    assert.equal(
      (
        await command(
          "session.attendance",
          { learnerId: l.id, id: a.id, attendance: "Attended" },
          manager,
        )
      ).status,
      200,
    );
    a = (await state(manager)).appointments.find((x) => x.id === a.id);
    assert.equal(a.attendance, "Attended");
    assert.equal(a.status, "Planned");
    assert.equal(a.attendanceHistory.length, 1);
    assert.equal(
      (
        await command(
          "session.attendance",
          { learnerId: l.id, id: a.id, attendance: "Attended" },
          manager,
        )
      ).status,
      200,
    );
    assert.equal(
      (await state(manager)).appointments.find((x) => x.id === a.id)
        .attendanceHistory.length,
      1,
    );
    assert.equal(
      (
        await command(
          "session.attendance",
          { learnerId: l.id, id: a.id, attendance: "Did not attend" },
          manager,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await command(
          "session.attendance",
          { learnerId: l.id, id: a.id, attendance: "Not recorded" },
          manager,
        )
      ).status,
      200,
    );
    assert.equal(
      (await state(manager)).appointments.find((x) => x.id === a.id).attendance,
      "Not recorded",
    );
    const iqa = await login("iqa@archetype.demo");
    const denied = await command(
      "session.attendance",
      { learnerId: l.id, id: a.id, attendance: "Attended" },
      iqa,
    );
    assert([403, 404].includes(denied.status));
  }
  const after = await state(manager);
  assert.equal(after.reviews.length, beforeReviews);
  assert.equal(after.learners.find((x) => x.id === l.id).hours, beforeHours);
  assert.equal(
    after.learners.find((x) => x.id === l.id).nextReview,
    beforeNextReview,
  );
  const future = addDays(today(), 1);
  assert.equal(
    (
      await command(
        "session.save",
        {
          ...basePayload,
          title: "Future attendance guard",
          type: "Teaching session",
          date: future,
        },
        manager,
      )
    ).status,
    200,
  );
  let a = (await state(manager)).appointments.find(
    (a) => a.title === "Future attendance guard",
  );
  assert.equal(
    (
      await command(
        "session.attendance",
        { learnerId: l.id, id: a.id, attendance: "Attended" },
        manager,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await command(
        "session.save",
        {
          ...basePayload,
          id: a.id,
          title: "Future attendance guard",
          type: "Teaching session",
          date: future,
          status: "Cancelled",
          cancellationReason: "Fictional cancellation",
        },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        "session.attendance",
        { learnerId: l.id, id: a.id, attendance: "Not recorded" },
        manager,
      )
    ).status,
    400,
  );
  const aLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "support-assessor@example.test",
      password: "Support assessor chosen 2026!",
    }),
  });
  const other = s.learners.find(
    (x) => x.id !== l.id && x.assessorId !== l.assessorId,
  );
  assert(other);
  assert.equal(
    (
      await command(
        "session.save",
        {
          ...basePayload,
          learnerId: other.id,
          title: "Other caseload attendance",
          type: "Teaching session",
        },
        manager,
      )
    ).status,
    200,
  );
  a = (await state(manager)).appointments.find(
    (x) => x.title === "Other caseload attendance",
  );
  assert.equal(
    (
      await command(
        "session.attendance",
        { learnerId: other.id, id: a.id, attendance: "Attended" },
        aLogin.cookie,
      )
    ).status,
    404,
  );
});

test("Success and updates supports multiple posts with explicit assessor, learner and shared audiences", async () => {
  const manager = await login("manager@archetype.demo"),
    aLogin = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "support-assessor@example.test",
        password: "Support assessor chosen 2026!",
      }),
    }),
    lLogin = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "apprentice@archetype.demo",
        password: "NewLearnerPassword123!",
      }),
    });
  assert.equal(aLogin.status, 200);
  assert.equal(lLogin.status, 200);
  const ids = [];
  for (const audience of ["Assessors", "Learners", "Assessors and learners"]) {
    const result = await command(
      "spotlight.save",
      {
        kind: "Update",
        title: "News for " + audience,
        story: "An announcement published by the master administrator.",
        audience,
        published: true,
      },
      manager,
    );
    assert.equal(result.status, 200);
    ids.push(result.data.result.storyId);
  }
  let a = (await state(aLogin.cookie)).successStories,
    l = (await state(lLogin.cookie)).successStories;
  assert(a.some((p) => p.id === ids[0]));
  assert(!a.some((p) => p.id === ids[1]));
  assert(a.some((p) => p.id === ids[2]));
  assert(!l.some((p) => p.id === ids[0]));
  assert(l.some((p) => p.id === ids[1]));
  assert(l.some((p) => p.id === ids[2]));
  assert(
    l
      .filter((p) => ids.includes(p.id))
      .every((p) => p.personName === "Archetype team"),
  );
  const draft = await command(
    "spotlight.save",
    {
      kind: "Update",
      title: "Private draft announcement",
      story: "Not published yet",
      audience: "Assessors and learners",
      published: false,
    },
    manager,
  );
  assert.equal(draft.status, 200);
  assert(
    !(await state(aLogin.cookie)).successStories.some(
      (p) => p.id === draft.data.result.storyId,
    ),
  );
  assert(
    !(await state(lLogin.cookie)).successStories.some(
      (p) => p.id === draft.data.result.storyId,
    ),
  );
  const invalid = await command(
    "spotlight.save",
    {
      kind: "Update",
      title: "Invalid audience",
      story: "Private",
      audience: "Everyone",
      published: true,
    },
    manager,
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    (
      await command(
        "spotlight.save",
        {
          kind: "Update",
          title: "Not authorised",
          story: "No",
          audience: "Learners",
          published: true,
        },
        lLogin.cookie,
      )
    ).status,
    403,
  );
  const shared = (await state(manager)).successStories.find(
    (p) => p.id === ids[2],
  );
  assert.equal(
    (
      await command(
        "spotlight.save",
        { ...shared, audience: "Learners" },
        manager,
      )
    ).status,
    200,
  );
  assert(
    !(await state(aLogin.cookie)).successStories.some((p) => p.id === ids[2]),
  );
  assert(
    (await state(lLogin.cookie)).successStories.some((p) => p.id === ids[2]),
  );
  assert.equal(
    (await command("spotlight.unpublish", { id: ids[2] }, manager)).status,
    200,
  );
  assert(
    !(await state(lLogin.cookie)).successStories.some((p) => p.id === ids[2]),
  );
  assert.equal(
    (await command("spotlight.delete", { id: ids[2] }, manager)).status,
    200,
  );
  assert(!(await state(manager)).successStories.some((p) => p.id === ids[2]));
  const employer = await login("employer@archetype.demo");
  assert.equal((await state(employer)).successStories.length, 0);
});

test("assessors can maintain their own CPD with private attachments while other accounts cannot read or modify it", async () => {
  const manager = await login("manager@archetype.demo"),
    s = await state(manager),
    owner = s.users.find((u) => u.email === "support-assessor@example.test"),
    other = s.users.find(
      (u) => u.active && u.role === "Assessor" && u.id !== owner.id,
    );
  const loginResult = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: owner.email,
      password: "Support assessor chosen 2026!",
    }),
  });
  assert.equal(loginResult.status, 200);
  const assessor = loginResult.cookie;
  const payload = {
    title: "Professional development workshop",
    date: today(),
    type: "Workshop",
    hours: 2.5,
    status: "Completed",
    description: "CPD activity details",
    reflection: "Applied new coaching methods",
    impact: "More effective feedback",
    nextSteps: "Practise the approach",
    files: [
      {
        name: "cpd-certificate.txt",
        base64: Buffer.from("Private CPD certificate").toString("base64"),
      },
    ],
  };
  const created = await command("cpd.save", payload, assessor);
  assert.equal(created.status, 200);
  let record = (await state(assessor)).cpdRecords.find(
    (r) => r.id === created.data.result.recordId,
  );
  assert.equal(record.assessorId, owner.id);
  assert.equal(record.hours, 2.5);
  assert.equal(record.files.length, 1);
  const path = "/api/cpd-files/" + record.files[0].id;
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    await (await fetch(base + path, { headers: { cookie: assessor } })).text(),
    "Private CPD certificate",
  );
  assert.equal(
    (
      await command(
        "cpd.save",
        { ...payload, id: record.id, hours: 3.5, files: [] },
        assessor,
      )
    ).status,
    200,
  );
  record = (await state(assessor)).cpdRecords.find((r) => r.id === record.id);
  assert.equal(record.hours, 3.5);
  assert.equal(record.files.length, 1);
  const another = await command(
    "cpd.save",
    { ...payload, assessorId: other.id, title: "Another assessor CPD" },
    manager,
  );
  assert.equal(another.status, 200);
  const otherRecord = (await state(manager)).cpdRecords.find(
    (r) => r.id === another.data.result.recordId,
  );
  assert(
    !(await state(assessor)).cpdRecords.some((r) => r.id === otherRecord.id),
  );
  assert.equal(
    (
      await fetch(base + "/api/cpd-files/" + otherRecord.files[0].id, {
        headers: { cookie: assessor },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await command(
        "cpd.save",
        { ...payload, id: otherRecord.id, assessorId: owner.id },
        assessor,
      )
    ).status,
    403,
  );
  assert.equal(
    (await command("cpd.delete", { id: otherRecord.id }, assessor)).status,
    403,
  );
  for (const email of ["iqa@archetype.demo", "employer@archetype.demo"]) {
    const account = await login(email);
    assert.equal((await state(account)).cpdRecords.length, 0);
    assert.equal(
      (await fetch(base + path, { headers: { cookie: account } })).status,
      403,
    );
  }
  assert.equal(
    (
      await command(
        "cpd.save",
        { ...payload, date: addDays(today(), 1), files: [] },
        assessor,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await command(
        "cpd.save",
        {
          ...payload,
          title: "Planned CPD",
          date: addDays(today(), 7),
          status: "Planned",
          reflection: "",
          files: [],
        },
        assessor,
      )
    ).status,
    200,
  );
  assert.equal(
    (await command("cpd.delete", { id: record.id }, assessor)).status,
    200,
  );
  assert.equal(
    (await fetch(base + path, { headers: { cookie: assessor } })).status,
    404,
  );
});
test("shared 1:1 records link apprentices and add assessor-owned action-plan items without exposing confidential notes or drafts", async () => {
  const manager = await login("manager@archetype.demo"),
    s = await state(manager),
    owner = s.users.find((u) => u.email === "support-assessor@example.test"),
    learner = s.learners.find((l) => l.assessorId === owner.id),
    other = s.users.find(
      (u) => u.active && u.role === "Assessor" && u.id !== owner.id,
    );
  assert(learner);
  const loginResult = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: owner.email,
      password: "Support assessor chosen 2026!",
    }),
  });
  const assessor = loginResult.cookie;
  const payload = {
    assessorId: owner.id,
    learnerId: learner.id,
    title: "Shared assessor development conversation",
    date: today(),
    status: "Completed",
    summary: "Shared supervision summary",
    performance: "Discussed learner support and caseload",
    actions: "Agreed next steps",
    confidentialNotes: "MANAGER-ONLY-SENTINEL",
    actionItems: [
      {
        title: "Complete coaching CPD",
        due: addDays(today(), 7),
        status: "Open",
      },
      {
        title: "Review linked apprentice progress",
        due: addDays(today(), 3),
        status: "Open",
      },
    ],
  };
  const created = await command("assessor.oneToOne.save", payload, manager);
  assert.equal(created.status, 200);
  let record = (await state(manager)).assessorOneToOnes.find(
    (r) => r.id === created.data.result.recordId,
  );
  assert.equal(record.learnerId, learner.id);
  assert.equal(record.actionIds.length, 2);
  let shared = (await state(assessor)).assessorOneToOnes.find(
    (r) => r.id === record.id,
  );
  assert(shared);
  assert.equal(shared.confidentialNotes, undefined);
  assert.equal(shared.learnerName, learner.name);
  let actions = (await state(assessor)).assessorActions.filter(
    (action) => action.oneToOneId === record.id,
  );
  assert.equal(actions.length, 2);
  assert(
    actions.every(
      (action) => action.owner === owner.id && action.learnerId === learner.id,
    ),
  );
  const ordinaryCount = (await state(manager)).tasks.length;
  assert.equal(
    (
      await command(
        "assessor.action.setStatus",
        { id: actions[0].id, status: "Complete" },
        assessor,
      )
    ).status,
    200,
  );
  assert.equal(
    (await state(manager)).assessorActions.find(
      (action) => action.id === actions[0].id,
    ).status,
    "Complete",
  );
  assert.equal((await state(manager)).tasks.length, ordinaryCount);
  const edit = {
    ...payload,
    id: record.id,
    summary: "Updated shared summary",
    actionItems: actions.map((action) => ({
      id: action.id,
      title: action.title,
      due: action.due,
      status: "Open",
      originalStatus: "Open",
    })),
  };
  assert.equal(
    (await command("assessor.oneToOne.save", edit, manager)).status,
    200,
  );
  const updated = await state(assessor);
  shared = updated.assessorOneToOnes.find((r) => r.id === record.id);
  assert.equal(shared.history.length, 1);
  assert(!JSON.stringify(shared).includes("MANAGER-ONLY-SENTINEL"));
  actions = updated.assessorActions.filter(
    (action) => action.oneToOneId === record.id,
  );
  assert.equal(actions.length, 2);
  assert.equal(actions[0].status, "Complete");
  const draft = await command(
    "assessor.oneToOne.save",
    {
      ...payload,
      learnerId: "",
      title: "Private manager draft",
      status: "Draft",
      actionItems: [{ title: "Draft action", due: today(), status: "Open" }],
    },
    manager,
  );
  assert.equal(draft.status, 200);
  const draftRecord = (await state(manager)).assessorOneToOnes.find(
    (r) => r.id === draft.data.result.recordId,
  );
  assert(
    !(await state(assessor)).assessorOneToOnes.some(
      (r) => r.id === draftRecord.id,
    ),
  );
  assert(
    !(await state(assessor)).assessorActions.some(
      (a) => a.oneToOneId === draftRecord.id,
    ),
  );
  assert.equal(
    (
      await command(
        "assessor.action.setStatus",
        { id: draftRecord.actionIds[0], status: "Complete" },
        assessor,
      )
    ).status,
    404,
  );
  const foreign = await command(
    "assessor.oneToOne.save",
    {
      ...payload,
      assessorId: other.id,
      learnerId: "",
      title: "Other assessor conversation",
      actionItems: [
        { title: "Other private staff action", due: today(), status: "Open" },
      ],
    },
    manager,
  );
  assert.equal(foreign.status, 200);
  const foreignRecord = (await state(manager)).assessorOneToOnes.find(
    (r) => r.id === foreign.data.result.recordId,
  );
  assert.equal(
    (
      await command(
        "assessor.action.setStatus",
        { id: foreignRecord.actionIds[0], status: "Complete" },
        assessor,
      )
    ).status,
    404,
  );
  const apprenticeLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  const learnerState = await state(apprenticeLogin.cookie);
  assert.equal(learnerState.assessorActions.length, 0);
  assert.equal(learnerState.assessorOneToOnes.length, 0);
  assert.equal(
    (
      await command(
        "assessor.oneToOne.save",
        { ...payload, id: record.id },
        assessor,
      )
    ).status,
    403,
  );
});

test("CPD evidence and assessor 1:1 actions remain stored after restart with the same visibility boundaries", async () => {
  const manager = await login("manager@archetype.demo"),
    before = await state(manager);
  assert(before.cpdRecords.some((record) => record.files.length));
  assert(before.assessorActions.length);
  proc.kill();
  await new Promise((resolve) => proc.once("exit", resolve));
  proc = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      PORT: new URL(base).port,
      DATA_DIR: dir,
      DEMO_MODE: "1",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/api/health")).status === 200) break;
    } catch {}
    await pause(50);
  }
  const restored = await state(manager);
  assert.deepEqual(restored.cpdRecords, before.cpdRecords);
  assert.deepEqual(restored.assessorActions, before.assessorActions);
  assert.deepEqual(restored.assessorOneToOnes, before.assessorOneToOnes);
  const file = restored.cpdRecords.find((record) => record.files.length)
    .files[0];
  const download = await fetch(base + "/api/cpd-files/" + file.id, {
    headers: { cookie: manager },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Private CPD certificate");
  const learner = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email: "apprentice@archetype.demo",
      password: "NewLearnerPassword123!",
    }),
  });
  assert.equal(learner.status, 200);
  const visible = await state(learner.cookie);
  assert.equal(visible.cpdRecords.length, 0);
  assert.equal(visible.assessorActions.length, 0);
  assert.equal(visible.assessorOneToOnes.length, 0);
});
