import {
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { londonTimestamp } from "./scheduling.mjs";
import { today } from "./model.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const scopes =
  "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite";
const propertyId =
  "String {b14bdf39-c908-4c17-b3b5-9290b5789d96} Name ArchetypeAppointment";
function problem(message, status = 400, retry = 60, reconnect = false) {
  return Object.assign(Error(message), { status, retry, reconnect });
}
export function outlookTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS outlook_metadata(id INTEGER PRIMARY KEY,installation_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outlook_connections(user_id TEXT PRIMARY KEY, generation TEXT NOT NULL, role TEXT NOT NULL, account_id TEXT NOT NULL UNIQUE, address TEXT NOT NULL, display_name TEXT NOT NULL, token TEXT NOT NULL, expires INTEGER NOT NULL, last_sync TEXT, last_error TEXT, retry_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS outlook_oauth(state_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_hash TEXT NOT NULL,cookie_name TEXT NOT NULL,cookie_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS outlook_events(user_id TEXT NOT NULL,account_id TEXT NOT NULL,appointment_id TEXT NOT NULL,event_id TEXT,content_hash TEXT,transaction_id TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,account_id,appointment_id));`);
  db.prepare("INSERT OR IGNORE INTO outlook_metadata VALUES(1,?)").run(
    randomUUID(),
  );
}
export function revokeOutlookAccess(db, userId) {
  db.prepare("DELETE FROM outlook_oauth WHERE user_id=?").run(userId);
  db.prepare("DELETE FROM outlook_connections WHERE user_id=?").run(userId);
}
export function outlookEvent(appointment, learner, origin) {
  const a = appointment;
  const start = a.allDay
    ? { dateTime: a.date + "T00:00:00", timeZone: "GMT Standard Time" }
    : {
        dateTime: new Date(londonTimestamp(a.date, a.time || "09:00"))
          .toISOString()
          .slice(0, 19),
        timeZone: "UTC",
      };
  const end = a.allDay
    ? {
        dateTime:
          new Date(Date.parse(a.date + "T12:00:00Z") + 86400000)
            .toISOString()
            .slice(0, 10) + "T00:00:00",
        timeZone: "GMT Standard Time",
      }
    : {
        dateTime: new Date(
          a.endTime
            ? londonTimestamp(a.date, a.endTime)
            : londonTimestamp(a.date, a.time || "09:00") + 3600000,
        )
          .toISOString()
          .slice(0, 19),
        timeZone: "UTC",
      };
  return {
    subject: `[Archetype] ${a.title} · ${learner.name}`.slice(0, 255),
    body: {
      contentType: "text",
      content: [
        "Session managed in Archetype.",
        a.meetingUrl && /^https:\/\//i.test(a.meetingUrl)
          ? `Meeting: ${a.meetingUrl}`
          : "",
        `Manage this session: ${origin}/`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    start,
    end,
    isAllDay: !!a.allDay,
    sensitivity: "private",
    showAs: "busy",
    location: { displayName: a.location || "" },
  };
}
export function createOutlook({
  db,
  get,
  origin,
  env = process.env,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  outlookTables(db);
  const installation = db
    .prepare("SELECT installation_id FROM outlook_metadata WHERE id=1")
    .get().installation_id;
  const tenant = env.OUTLOOK_TENANT_ID || "organizations";
  const client = env.OUTLOOK_CLIENT_ID || "",
    secret = env.OUTLOOK_CLIENT_SECRET || "";
  const encryptionSecret =
    env.OUTLOOK_TOKEN_ENCRYPTION_KEY || env.BACKUP_ENCRYPTION_KEY || "";
  const validOrigin = (() => {
    try {
      const u = new URL(origin);
      return (
        u.origin === origin.replace(/\/$/, "") &&
        (u.protocol === "https:" ||
          (env.NODE_ENV !== "production" &&
            u.protocol === "http:" &&
            ["127.0.0.1", "localhost"].includes(u.hostname)))
      );
    } catch {
      return false;
    }
  })();
  const missing = [
    !client && "OUTLOOK_CLIENT_ID",
    !secret && "OUTLOOK_CLIENT_SECRET",
    !/^(organizations|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
      tenant,
    ) && "OUTLOOK_TENANT_ID",
    encryptionSecret.length < 32 && "OUTLOOK_TOKEN_ENCRYPTION_KEY",
    !validOrigin && "APP_ORIGIN",
  ].filter(Boolean);
  const configured = missing.length === 0,
    redirectUri = validOrigin
      ? new URL("/api/outlook/callback", origin).href
      : "";
  const key = createHash("sha256")
    .update("archetype-outlook-v1\0" + encryptionSecret)
    .digest();
  function seal(value, userId) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(userId));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  function unseal(value, userId) {
    try {
      const b = Buffer.from(value, "base64"),
        cipher = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
      cipher.setAAD(Buffer.from(userId));
      cipher.setAuthTag(b.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          cipher.update(b.subarray(28)),
          cipher.final(),
        ]).toString(),
      );
    } catch {
      throw problem("Outlook needs to be reconnected.", 409, 3600, true);
    }
  }
  const eligible = (user) =>
    user?.active &&
    ["Manager", "Assessor"].includes(user.role) &&
    db
      .prepare("SELECT must_change FROM credentials WHERE user_id=?")
      .get(user.id)?.must_change === 0;
  function ensure(user) {
    if (!eligible(user))
      throw problem(
        "An active assessor or master account with a confirmed password is required.",
        403,
      );
  }
  function current(userId) {
    return get().users.find((u) => u.id === userId);
  }
  function status(user) {
    ensure(user);
    const c = db
      .prepare("SELECT * FROM outlook_connections WHERE user_id=?")
      .get(user.id);
    return {
      configured,
      connected: !!c,
      account: c ? { name: c.display_name, address: c.address } : null,
      lastSync: c?.last_sync || null,
      lastError: c?.last_error || null,
      retryAt: c?.retry_at ? new Date(c.retry_at).toISOString() : null,
      syncing: locks.has(user.id),
      ...(user.role === "Manager" ? { missing, redirectUri } : {}),
    };
  }
  const locks = new Map();
  async function locked(userId, action) {
    const previous = locks.get(userId) || Promise.resolve();
    const run = previous.catch(() => {}).then(action);
    locks.set(userId, run);
    try {
      return await run;
    } finally {
      if (locks.get(userId) === run) locks.delete(userId);
    }
  }
  function begin(user, sessionHash) {
    ensure(user);
    if (!configured)
      throw problem(
        "Microsoft 365 connection setup is not complete. Ask your administrator.",
        503,
      );
    if (
      !db
        .prepare(
          "SELECT token FROM sessions WHERE token=? AND user_id=? AND expires>?",
        )
        .get(sessionHash, user.id, now())
    )
      throw problem("Sign in again before connecting Outlook.", 401);
    db.prepare("DELETE FROM outlook_oauth WHERE expires<?").run(now());
    const state = randomBytes(32).toString("base64url"),
      cookie = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url"),
      cookieName = "archetype_outlook_" + state.slice(0, 12);
    db.prepare("INSERT INTO outlook_oauth VALUES(?,?,?,?,?,?,?)").run(
      hash(state),
      user.id,
      sessionHash,
      cookieName,
      hash(cookie),
      seal(verifier, user.id),
      now() + 600000,
    );
    const url = new URL(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    );
    url.search = new URLSearchParams({
      client_id: client,
      response_type: "code",
      response_mode: "query",
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return { url: url.href, cookieName, cookie };
  }
  async function tokenRequest(parameters) {
    let response;
    try {
      response = await fetchImpl(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: client,
            client_secret: secret,
            scope: scopes,
            ...parameters,
          }).toString(),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw problem(
        "Microsoft sign-in is temporarily unavailable. Try again shortly.",
        502,
        60,
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw problem("Microsoft returned an invalid sign-in response.", 502);
    }
    if (!response.ok)
      throw problem(
        ["invalid_grant", "interaction_required"].includes(data.error)
          ? "Outlook needs to be reconnected."
          : "Microsoft could not authorise the connection. Ask your administrator to check the app permissions and secret.",
        response.status === 429 ? 429 : 502,
        Number(response.headers.get("retry-after")) || 60,
        ["invalid_grant", "interaction_required"].includes(data.error),
      );
    if (
      typeof data.access_token !== "string" ||
      !data.access_token ||
      !Number.isFinite(Number(data.expires_in))
    )
      throw problem("Microsoft returned an invalid sign-in response.", 502);
    return data;
  }
  async function rawGraph(access, path, method = "GET", payload, etag) {
    let response;
    try {
      response = await fetchImpl("https://graph.microsoft.com/v1.0" + path, {
        method,
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
          Prefer: 'IdType="ImmutableId"',
          ...(etag ? { "If-Match": etag } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw problem(
        "Outlook is temporarily unavailable. Updates will retry.",
        502,
      );
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const status = response.status;
      throw problem(
        status === 401
          ? "Outlook needs to be reconnected."
          : status === 403
            ? "Microsoft refused calendar access. Check your organisation’s calendar permissions."
            : status === 429
              ? "Microsoft is limiting requests. Calendar updates will retry."
              : "Outlook could not complete the update. It will retry.",
        status,
        Math.max(
          30,
          Math.min(3600, Number(response.headers.get("retry-after")) || 60),
        ),
        status === 401 || status === 403,
      );
    }
    if (response.status === 204) return {};
    try {
      return await response.json();
    } catch {
      throw problem(
        "Outlook returned an invalid response. Updates will retry.",
        502,
      );
    }
  }
  async function complete(params, cookies) {
    if (!configured)
      throw problem("Microsoft 365 connection setup is not complete.", 503);
    const state = params.get("state");
    if (!/^[A-Za-z0-9_-]{43}$/.test(state || ""))
      throw problem(
        "This Outlook sign-in link is invalid or expired. Start again from Archetype.",
      );
    const row = db
      .prepare("SELECT * FROM outlook_oauth WHERE state_hash=?")
      .get(hash(state));
    const cookie =
      row &&
      String(cookies || "")
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(row.cookie_name + "="))
        ?.slice(row.cookie_name.length + 1);
    if (
      !row ||
      row.expires < now() ||
      !cookie ||
      hash(cookie) !== row.cookie_hash
    )
      throw problem(
        "This Outlook sign-in link is invalid or expired. Start again from the same browser.",
      );
    db.prepare("DELETE FROM outlook_oauth WHERE state_hash=?").run(hash(state));
    const user = current(row.user_id);
    if (
      !eligible(user) ||
      !db
        .prepare(
          "SELECT token FROM sessions WHERE token=? AND user_id=? AND expires>?",
        )
        .get(row.session_hash, row.user_id, now())
    )
      throw problem(
        "Your Archetype session has ended. Sign in and connect Outlook again.",
        401,
      );
    if (params.has("error"))
      return {
        ok: false,
        cookieName: row.cookie_name,
        message:
          "Microsoft sign-in was cancelled or access was not granted. Return to Archetype to try again.",
      };
    const code = params.get("code");
    if (!code || code.length > 4096)
      throw problem("Microsoft did not return a valid sign-in code.");
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: unseal(row.verifier, row.user_id),
    });
    const account = await rawGraph(
      tokens.access_token,
      "/me?$select=id,displayName,mail,userPrincipalName",
    );
    if (!account?.id || !tokens.refresh_token)
      throw problem(
        "Microsoft did not provide offline calendar access. Connect again and accept the requested permissions.",
        409,
      );
    await locked(user.id, async () => {
      ensure(current(user.id));
      if (
        !db
          .prepare(
            "SELECT token FROM sessions WHERE token=? AND user_id=? AND expires>?",
          )
          .get(row.session_hash, user.id, now())
      )
        throw problem("Your Archetype session has ended. Connect again.", 401);
      const old = db
        .prepare("SELECT * FROM outlook_connections WHERE user_id=?")
        .get(user.id);
      if (old && old.account_id !== account.id)
        throw problem(
          "Disconnect your existing Outlook account before choosing a different one.",
          409,
        );
      if (
        db
          .prepare(
            "SELECT user_id FROM outlook_connections WHERE account_id=? AND user_id<>?",
          )
          .get(account.id, user.id)
      )
        throw problem(
          "This Outlook calendar is already connected to another Archetype account.",
          409,
        );
      db.prepare(
        "INSERT OR REPLACE INTO outlook_connections(user_id,generation,role,account_id,address,display_name,token,expires,last_sync,last_error,retry_at,failures) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,0,0)",
      ).run(
        user.id,
        randomUUID(),
        user.role,
        account.id,
        String(account.mail || account.userPrincipalName || ""),
        String(account.displayName || "Microsoft 365 account"),
        seal(
          { access: tokens.access_token, refresh: tokens.refresh_token },
          user.id,
        ),
        now() + Math.max(30, Math.min(86400, Number(tokens.expires_in))) * 1000,
      );
    });
    void syncUser(user.id).catch(() => {});
    return {
      ok: true,
      cookieName: row.cookie_name,
      message:
        "Outlook is connected. You can close this window and return to Archetype. Calendar updates will start automatically.",
    };
  }
  function connection(userId, generation) {
    const c = db
      .prepare("SELECT * FROM outlook_connections WHERE user_id=?")
      .get(userId);
    const u = current(userId);
    if (!c || c.generation !== generation || !eligible(u) || c.role !== u.role)
      throw problem("Outlook connection is no longer active.", 409, 3600, true);
    return c;
  }
  async function graph(c, path, method = "GET", payload, etag) {
    c = connection(c.user_id, c.generation);
    let tokens = unseal(c.token, c.user_id);
    if (c.expires < now() + 60000) {
      const next = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh,
      });
      connection(c.user_id, c.generation);
      tokens = {
        access: next.access_token,
        refresh: next.refresh_token || tokens.refresh,
      };
      db.prepare(
        "UPDATE outlook_connections SET token=?,expires=? WHERE user_id=? AND generation=?",
      ).run(
        seal(tokens, c.user_id),
        now() + Math.max(30, Math.min(86400, Number(next.expires_in))) * 1000,
        c.user_id,
        c.generation,
      );
    }
    connection(c.user_id, c.generation);
    return rawGraph(tokens.access, path, method, payload, etag);
  }
  function ownerValue(c, appointmentId) {
    return `archetype:${installation}:${c.user_id}:${appointmentId}`;
  }
  function queryOwner(c, appointmentId) {
    const value = ownerValue(c, appointmentId).replaceAll("'", "''");
    return (
      "/me/calendar/events?" +
      new URLSearchParams({
        $filter: `singleValueExtendedProperties/Any(ep: ep/id eq '${propertyId}' and ep/value eq '${value}')`,
        $expand: `singleValueExtendedProperties($filter=id eq '${propertyId}')`,
        $top: "2",
      })
    );
  }
  async function syncUser(userId, manual = false) {
    return locked(userId, async () => {
      if (!configured) return;
      const c = db
        .prepare("SELECT * FROM outlook_connections WHERE user_id=?")
        .get(userId);
      if (!c || (!manual && c.retry_at > now())) return;
      const user = current(userId);
      if (!eligible(user) || user.role !== c.role) {
        revokeOutlookAccess(db, userId);
        return;
      }
      try {
        const snapshot = get(),
          learnerIds = new Set(
            snapshot.learners
              .filter((l) => user.role === "Manager" || l.assessorId === userId)
              .map((l) => l.id),
          );
        const mappings = db
          .prepare(
            "SELECT * FROM outlook_events WHERE user_id=? AND account_id=?",
          )
          .all(userId, c.account_id);
        const mapped = new Map(mappings.map((m) => [m.appointment_id, m]));
        const wanted = snapshot.appointments.filter(
          (a) =>
            learnerIds.has(a.learnerId) &&
            a.status !== "Cancelled" &&
            (a.date >= today() ||
              (mapped.has(a.id) && !mapped.get(a.id).deleted)),
        );
        const desired = new Set(wanted.map((a) => a.id));
        for (const m of mappings.filter(
          (m) => !m.deleted && !desired.has(m.appointment_id),
        )) {
          // Locate by our ownership marker, never by a user's arbitrary Outlook event ID.
          const found = await graph(c, queryOwner(c, m.appointment_id));
          if (!found || !Array.isArray(found.value))
            throw problem(
              "Outlook did not confirm its calendar entries. Updates will retry.",
              502,
            );
          for (const e of found.value) {
            if (e.attendees?.length)
              throw problem(
                "An Archetype appointment now has attendees in Outlook. Remove those attendees before syncing; Archetype does not send invitations or cancellations.",
                409,
                3600,
              );
            await graph(
              c,
              "/me/events/" + encodeURIComponent(e.id),
              "DELETE",
              undefined,
              e["@odata.etag"],
            );
          }
          db.prepare(
            "UPDATE outlook_events SET event_id=NULL,content_hash=NULL,deleted=1 WHERE user_id=? AND account_id=? AND appointment_id=?",
          ).run(userId, c.account_id, m.appointment_id);
        }
        for (const appointment of wanted) {
          const live = get(),
            actor = live.users.find((u) => u.id === userId),
            a = live.appointments.find((a) => a.id === appointment.id),
            learner = a && live.learners.find((l) => l.id === a.learnerId);
          if (
            !actor ||
            !a ||
            a.status === "Cancelled" ||
            !learner ||
            (actor.role !== "Manager" && learner.assessorId !== userId)
          )
            continue;
          const payload = outlookEvent(a, learner, origin),
            digest = hash(JSON.stringify(payload));
          let m = mapped.get(a.id);
          if (!manual && m?.event_id && !m.deleted && m.content_hash === digest)
            continue;
          if (!m) {
            m = { transaction_id: randomUUID() };
            db.prepare(
              "INSERT INTO outlook_events(user_id,account_id,appointment_id,transaction_id) VALUES(?,?,?,?)",
            ).run(userId, c.account_id, a.id, m.transaction_id);
          } else if (m.deleted) {
            m = { ...m, event_id: null, transaction_id: randomUUID() };
            db.prepare(
              "UPDATE outlook_events SET transaction_id=?,deleted=0 WHERE user_id=? AND account_id=? AND appointment_id=?",
            ).run(m.transaction_id, userId, c.account_id, a.id);
          }
          // Ownership lookup also recovers a create whose response was lost or a restored mapping.
          const found = await graph(c, queryOwner(c, a.id));
          if (!found || !Array.isArray(found.value))
            throw problem(
              "Outlook returned an invalid calendar response. Updates will retry.",
              502,
            );
          if (found.value.length > 1)
            throw problem(
              "Duplicate Archetype copies were found in Outlook. Contact your administrator.",
              409,
              3600,
            );
          let remote = found.value[0];
          if (remote) {
            if (remote.attendees?.length)
              throw problem(
                "An Archetype appointment now has attendees in Outlook. Remove those attendees before syncing; Archetype does not send invitations or cancellations.",
                409,
                3600,
              );
            const updated = await graph(
              c,
              "/me/events/" + encodeURIComponent(remote.id),
              "PATCH",
              payload,
              remote["@odata.etag"],
            );
            if (!updated)
              throw problem(
                "An Outlook appointment changed during sync. It will retry.",
                409,
              );
          } else
            remote = await graph(c, "/me/calendar/events", "POST", {
              ...payload,
              transactionId: m.transaction_id,
              singleValueExtendedProperties: [
                { id: propertyId, value: ownerValue(c, a.id) },
              ],
            });
          if (!remote?.id)
            throw problem(
              "Outlook did not confirm the appointment. Updates will retry.",
              502,
            );
          db.prepare(
            "UPDATE outlook_events SET event_id=?,content_hash=?,deleted=0 WHERE user_id=? AND account_id=? AND appointment_id=?",
          ).run(remote.id, digest, userId, c.account_id, a.id);
        }
        db.prepare(
          "UPDATE outlook_connections SET last_sync=?,last_error=NULL,retry_at=0,failures=0 WHERE user_id=? AND generation=?",
        ).run(new Date(now()).toISOString(), userId, c.generation);
      } catch (error) {
        const message = error.status
          ? error.message
          : "Outlook could not complete the update. It will retry.";
        const delay = error.reconnect
          ? 3600
          : Math.max(
              error.retry || 60,
              Math.min(3600, 60 * 2 ** Math.min(c.failures, 5)),
            );
        db.prepare(
          "UPDATE outlook_connections SET last_error=?,retry_at=?,failures=failures+1 WHERE user_id=? AND generation=?",
        ).run(message, now() + delay * 1000, userId, c.generation);
        if (manual)
          throw problem(message, error.status || 502, delay, error.reconnect);
      }
    });
  }
  async function disconnect(user) {
    ensure(user);
    await locked(user.id, async () => revokeOutlookAccess(db, user.id));
    return { connected: false };
  }
  let timer,
    stopped = true;
  async function tick() {
    if (stopped) return;
    db.prepare("DELETE FROM outlook_oauth WHERE expires<?").run(now());
    for (const c of db
      .prepare("SELECT user_id FROM outlook_connections")
      .all()) {
      if (stopped) break;
      if (!locks.has(c.user_id)) await syncUser(c.user_id);
    }
  }
  return {
    status,
    begin,
    complete,
    disconnect,
    sync: async (user) => {
      ensure(user);
      if (!configured)
        throw problem("Microsoft 365 connection setup is not complete.", 503);
      await syncUser(user.id, true);
      return status(user);
    },
    start() {
      if (timer || !configured) return;
      stopped = false;
      timer = setInterval(() => {
        void tick().catch(() => {});
      }, 60000);
      timer.unref();
      void tick().catch(() => {});
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
    },
  };
}
