import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  createOutlook,
  outlookEvent,
  revokeOutlookAccess,
} from "../server/outlook.mjs";
import { today } from "../server/model.mjs";
function fixture(overrides = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE credentials(user_id TEXT PRIMARY KEY,must_change INTEGER);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER)",
  );
  const users = [
    { id: "assessor", role: "Assessor", name: "Assessor", active: true },
    { id: "other", role: "Assessor", active: true },
    { id: "master", role: "Manager", active: true },
    { id: "learner-user", role: "Apprentice", active: true },
  ];
  for (const u of users) {
    db.prepare("INSERT INTO credentials VALUES(?,0)").run(u.id);
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      "session-" + u.id,
      u.id,
      Date.now() + 3600000,
    );
  }
  const s = {
    users,
    learners: [
      {
        id: "learner",
        name: "Fictional Learner",
        assessorId: "assessor",
        notes: "PRIVATE LEARNER NOTE",
      },
      { id: "foreign", name: "Foreign learner", assessorId: "other" },
    ],
    appointments: [
      {
        id: "appointment",
        learnerId: "learner",
        title: "Scheduled review",
        date: "2027-07-01",
        time: "10:00",
        endTime: "11:00",
        status: "Planned",
        location: "Training room",
        notes: "PRIVATE NOTES",
        description: "PRIVATE REVIEW",
        staffNotes: "PRIVATE STAFF NOTE",
        meetingUrl: "https://example.test/meeting",
      },
      {
        id: "foreign-appointment",
        learnerId: "foreign",
        title: "FOREIGN REVIEW",
        date: "2027-07-01",
        time: "10:00",
        endTime: "11:00",
        status: "Planned",
      },
      {
        id: "old-appointment",
        learnerId: "learner",
        title: "Historic review",
        date: "2020-01-01",
        time: "10:00",
        endTime: "11:00",
        status: "Completed",
      },
    ],
  };
  const events = new Map([
      [
        "unrelated",
        {
          id: "unrelated",
          subject: "Unrelated personal appointment",
          attendees: [],
        },
      ],
    ]),
    calls = [];
  const control = {
    account: "microsoft-account",
    fail: null,
    lostCreate: false,
    denyRefresh: false,
  };
  let sequence = 0;
  const json = (data, status = 200, headers = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  async function fetchImpl(raw, options = {}) {
    const url = new URL(raw),
      method = options.method || "GET",
      body = options.body,
      payload =
        body && url.hostname === "graph.microsoft.com"
          ? JSON.parse(body)
          : null;
    calls.push({
      url: url.href,
      method,
      payload,
      body,
      headers: options.headers,
    });
    if (url.hostname === "login.microsoftonline.com") {
      if (
        new URLSearchParams(body).get("grant_type") === "refresh_token" &&
        control.denyRefresh
      )
        return json(
          {
            error: "invalid_grant",
            error_description: "SECRET PROVIDER DETAIL",
          },
          400,
        );
      return json({
        access_token: "ACCESS-TOKEN-PRIVATE-" + calls.length,
        refresh_token: "REFRESH-TOKEN-PRIVATE-" + calls.length,
        expires_in: 3600,
      });
    }
    if (url.pathname === "/v1.0/me")
      return json({
        id: control.account,
        displayName: "Work Account",
        mail: "work@example.test",
      });
    if (control.fail) {
      const fail = control.fail;
      control.fail = null;
      return json({ error: { message: "SECRET PROVIDER DETAIL" } }, fail, {
        "Retry-After": "120",
      });
    }
    if (url.pathname === "/v1.0/me/calendar/events" && method === "GET") {
      const filter = url.searchParams.get("$filter") || "",
        value = /ep\/value eq '([^']+)'/.exec(filter)?.[1];
      return json({
        value: [...events.values()].filter((e) =>
          e.singleValueExtendedProperties?.some((p) => p.value === value),
        ),
      });
    }
    if (url.pathname === "/v1.0/me/calendar/events" && method === "POST") {
      const existing = [...events.values()].find(
        (e) => e.transactionId === payload.transactionId,
      );
      if (existing) return json(existing, 201);
      const item = {
        ...payload,
        id: "event-" + ++sequence,
        attendees: [],
        "@odata.etag": '"etag-1"',
      };
      events.set(item.id, item);
      if (control.lostCreate) {
        control.lostCreate = false;
        throw Error("Lost response containing PRIVATE details");
      }
      return json(item, 201);
    }
    const eventId = decodeURIComponent(url.pathname.split("/").at(-1));
    if (method === "PATCH") {
      if (!events.has(eventId)) return json({}, 404);
      const item = { ...events.get(eventId), ...payload };
      events.set(eventId, item);
      return json(item);
    }
    if (method === "DELETE") {
      events.delete(eventId);
      return new Response(null, { status: 204 });
    }
    throw Error("Unexpected request " + url.pathname);
  }
  const env = {
    OUTLOOK_CLIENT_ID: "test-client",
    OUTLOOK_CLIENT_SECRET: "SECRET-CLIENT-CREDENTIAL",
    OUTLOOK_TENANT_ID: "organizations",
    BACKUP_ENCRYPTION_KEY: "test-only-token-encryption-key-2026-long",
    ...overrides,
  };
  const service = createOutlook({
    db,
    get: () => s,
    origin: "https://portfolio.example.test",
    env,
    fetchImpl,
  });
  async function connect(user = users[0]) {
    const start = service.begin(user, "session-" + user.id),
      url = new URL(start.url);
    const params = new URLSearchParams({
      state: url.searchParams.get("state"),
      code: "test-authorisation-code",
    });
    const result = await service.complete(
      params,
      `${start.cookieName}=${start.cookie}`,
    );
    await service.sync(user).catch(() => {});
    return { start, url, params, result };
  }
  return {
    db,
    s,
    users,
    service,
    events,
    calls,
    control,
    connect,
    env,
    fetchImpl,
  };
}
test("Microsoft connection uses one-use PKCE state, same-browser cookies, current sessions and encrypted private credentials", async () => {
  const f = fixture();
  try {
    const user = f.users[0],
      start = f.service.begin(user, "session-assessor"),
      url = new URL(start.url),
      state = url.searchParams.get("state");
    assert.equal(url.hostname, "login.microsoftonline.com");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert(!start.url.includes(f.env.OUTLOOK_CLIENT_SECRET));
    const row = f.db.prepare("SELECT * FROM outlook_oauth").get();
    assert.notEqual(row.state_hash, state);
    assert.notEqual(row.cookie_hash, start.cookie);
    const params = new URLSearchParams({ state, code: "a-code" });
    await assert.rejects(() => f.service.complete(params, ""), /same browser/);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM outlook_oauth").get().n,
      1,
    );
    assert(
      (await f.service.complete(params, `${start.cookieName}=${start.cookie}`))
        .ok,
    );
    await f.service.sync(user);
    const tokenCall = f.calls.find((c) => c.url.endsWith("/token"));
    const verifier = new URLSearchParams(tokenCall.body).get("code_verifier");
    assert.equal(
      createHash("sha256").update(verifier).digest("base64url"),
      url.searchParams.get("code_challenge"),
    );
    const token = f.db
      .prepare("SELECT token FROM outlook_connections")
      .get().token;
    assert(!token.includes("ACCESS-TOKEN"));
    assert(!token.includes("REFRESH-TOKEN"));
    assert(!JSON.stringify(f.s).includes("TOKEN"));
    assert(!JSON.stringify(f.service.status(user)).includes("TOKEN"));
    await assert.rejects(
      () => f.service.complete(params, `${start.cookieName}=${start.cookie}`),
      /expired/,
    );
    const second = f.service.begin(user, "session-assessor");
    f.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    await assert.rejects(
      () =>
        f.service.complete(
          new URLSearchParams({
            state: new URL(second.url).searchParams.get("state"),
            code: "a",
          }),
          `${second.cookieName}=${second.cookie}`,
        ),
      /session has ended/,
    );
  } finally {
    f.db.close();
  }
});
test("direct calendar sync scopes events, omits private content, updates stable appointments, and removes only owned cancelled or reassigned copies", async () => {
  const f = fixture();
  try {
    await f.connect();
    const event = [...f.events.values()].find((e) => e.id !== "unrelated");
    assert(event);
    assert.equal(f.events.size, 2);
    assert.match(event.subject, /Fictional Learner/);
    assert.equal(event.sensitivity, "private");
    assert.equal(event.start.dateTime, "2027-07-01T09:00:00");
    assert.deepEqual(event.attendees, []);
    assert(!JSON.stringify(event).includes("PRIVATE"));
    assert(!JSON.stringify(event).includes("FOREIGN"));
    const posts = () =>
      f.calls.filter(
        (c) => c.method === "POST" && c.url.includes("/calendar/events"),
      );
    assert.equal(posts().length, 1);
    f.s.appointments[0].title = "Updated session";
    await f.service.sync(f.users[0]);
    assert.equal(
      f.events.get(event.id).subject,
      "[Archetype] Updated session · Fictional Learner",
    );
    assert.equal(posts().length, 1);
    f.s.appointments[0].status = "Cancelled";
    await f.service.sync(f.users[0]);
    assert.equal(f.events.size, 1);
    assert(f.events.has("unrelated"));
    f.s.appointments[0].status = "Planned";
    await f.service.sync(f.users[0]);
    assert.equal(f.events.size, 2);
    assert.equal(posts().length, 2);
    assert.notEqual(
      posts()[0].payload.transactionId,
      posts()[1].payload.transactionId,
    );
    f.s.learners[0].assessorId = "other";
    await f.service.sync(f.users[0]);
    assert.deepEqual([...f.events.keys()], ["unrelated"]);
    assert(
      f.calls
        .filter((c) => ["PATCH", "DELETE"].includes(c.method))
        .every((c) => c.headers["If-Match"] === '"etag-1"'),
    );
  } finally {
    f.db.close();
  }
});
test("lost create responses recover by ownership marker without duplicate appointments", async () => {
  const f = fixture();
  try {
    f.control.lostCreate = true;
    await f.connect();
    assert.equal(f.events.size, 2);
    assert.equal(
      f.calls.filter(
        (c) => c.method === "POST" && c.url.includes("/calendar/events"),
      ).length,
      1,
    );
    assert.equal(f.service.status(f.users[0]).lastError, null);
    assert(f.service.status(f.users[0]).lastSync);
  } finally {
    f.db.close();
  }
});
test("refresh tokens rotate securely; provider failures record safe retry status and access revocation stops further updates", async () => {
  const f = fixture();
  try {
    await f.connect();
    f.db.prepare("UPDATE outlook_connections SET expires=0").run();
    await f.service.sync(f.users[0]);
    assert(
      f.calls.some(
        (c) =>
          c.url.endsWith("/token") &&
          new URLSearchParams(c.body).get("grant_type") === "refresh_token",
      ),
    );
    f.control.fail = 429;
    await assert.rejects(() => f.service.sync(f.users[0]), /limiting requests/);
    let status = f.service.status(f.users[0]);
    assert(status.lastError);
    assert(Date.parse(status.retryAt) > Date.now());
    assert(!JSON.stringify(status).includes("SECRET PROVIDER"));
    await f.service.sync(f.users[0]);
    assert.equal(f.service.status(f.users[0]).lastError, null);
    f.db.prepare("UPDATE outlook_connections SET expires=0").run();
    f.control.denyRefresh = true;
    await assert.rejects(() => f.service.sync(f.users[0]), /reconnected/);
    const count = f.calls.length;
    revokeOutlookAccess(f.db, f.users[0].id);
    await f.service.sync(f.users[0]);
    assert.equal(f.calls.length, count);
    assert.equal(f.service.status(f.users[0]).connected, false);
  } finally {
    f.db.close();
  }
});
test("calendar copies with added attendees are never edited or deleted, and disconnect preserves existing copies", async () => {
  const f = fixture();
  try {
    await f.connect();
    const event = [...f.events.values()].find((e) => e.id !== "unrelated");
    event.attendees = [{ emailAddress: { address: "person@example.test" } }];
    await assert.rejects(() => f.service.sync(f.users[0]), /attendees/);
    f.s.appointments[0].status = "Cancelled";
    await assert.rejects(() => f.service.sync(f.users[0]), /attendees/);
    assert(f.events.has(event.id));
    await f.service.disconnect(f.users[0]);
    assert.equal(f.service.status(f.users[0]).connected, false);
    assert(f.events.has(event.id));
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM outlook_oauth").get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});
test("configuration, forced password changes, roles, expired state and account uniqueness are enforced", async () => {
  const f = fixture();
  try {
    assert.throws(
      () => f.service.begin(f.users[3], "session-learner-user"),
      /active assessor/,
    );
    f.db
      .prepare("UPDATE credentials SET must_change=1 WHERE user_id='assessor'")
      .run();
    assert.throws(
      () => f.service.begin(f.users[0], "session-assessor"),
      /confirmed password/,
    );
    f.db.prepare("UPDATE credentials SET must_change=0").run();
    const start = f.service.begin(f.users[0], "session-assessor");
    f.db.prepare("UPDATE outlook_oauth SET expires=0").run();
    await assert.rejects(
      () =>
        f.service.complete(
          new URLSearchParams({
            state: new URL(start.url).searchParams.get("state"),
            code: "a",
          }),
          `${start.cookieName}=${start.cookie}`,
        ),
      /expired/,
    );
    await f.connect();
    await assert.rejects(
      () => f.connect(f.users[1]),
      /another Archetype account/,
    );
    const off = createOutlook({
      db: f.db,
      get: () => f.s,
      origin: "https://portfolio.example.test",
      env: {},
      fetchImpl: f.fetchImpl,
    });
    assert.equal(off.status(f.users[0]).configured, false);
    assert.throws(
      () => off.begin(f.users[0], "session-assessor"),
      /setup is not complete/,
    );
  } finally {
    f.db.close();
  }
});
test("all-day and timed Outlook events preserve UK clock changes without exposing review content", () => {
  const l = { name: "Fictional apprentice" },
    a = {
      title: "Review",
      date: "2027-07-01",
      time: "10:00",
      endTime: "11:00",
      notes: "PRIVATE",
    };
  assert.equal(
    outlookEvent(a, l, "https://example.test").start.dateTime,
    "2027-07-01T09:00:00",
  );
  assert.equal(
    outlookEvent({ ...a, date: "2027-12-01" }, l, "https://example.test").start
      .dateTime,
    "2027-12-01T10:00:00",
  );
  const all = outlookEvent(
    { ...a, date: "2027-10-31", allDay: true },
    l,
    "https://example.test",
  );
  assert.equal(all.start.dateTime, "2027-10-31T00:00:00");
  assert.equal(all.end.dateTime, "2027-11-01T00:00:00");
  assert.equal(all.end.timeZone, "GMT Standard Time");
});
