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
  const r2 = await command("learner.save", { ...l }, login.cookie);
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
