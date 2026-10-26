import React, { useEffect, useRef, useState } from "react";
import { sessionHeaders } from "./session";
export function CalendarSubscription({ user, command, busy }) {
  const [status, S] = useState(null),
    [url, U] = useState(""),
    [error, E] = useState(""),
    [message, M] = useState("");
  const ref = useRef(null);
  async function load() {
    const response = await fetch("/api/calendar/subscription", {
      headers: sessionHeaders(),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || "Could not load subscription status.");
    S(result);
  }
  useEffect(() => {
    load().catch((error) => E(error.message));
  }, [user.id]);
  async function create() {
    E("");
    M("");
    try {
      const result = await command("calendar.subscribe", {});
      U(result.url);
      await load();
      M("Link created. Copy it into Outlook using Subscribe from web.");
    } catch (error) {
      E(error.message);
    }
  }
  async function revoke() {
    E("");
    try {
      await command("calendar.unsubscribe", {});
      U("");
      await load();
      M("Subscription revoked. You can remove its calendar in Outlook.");
    } catch (error) {
      E(error.message);
    }
  }
  return (
    <section className="outlook-subscription">
      <h3>Automatic Outlook calendar updates</h3>
      <p>
        Subscribe to your visible sessions and reviews. Changes are picked up on
        Outlook’s refresh schedule.
      </p>
      {status && (
        <p>
          {status.enabled
            ? "Private subscription enabled"
            : "No active subscription"}
          {status.lastFetched
            ? ` · Last fetched ${new Date(status.lastFetched).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
            : ""}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={busy || !status}
          onClick={create}
        >
          {status?.enabled
            ? "Replace subscription link"
            : "Create subscription link"}
        </button>
        {status?.enabled && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={revoke}
          >
            Revoke subscription
          </button>
        )}
      </div>
      {status?.enabled && !url && (
        <p>
          The link is shown only when created. Replacing it disconnects the old
          link.
        </p>
      )}
      {url && (
        <div>
          <label>
            Private Outlook subscription link
            <input
              ref={ref}
              type="text"
              aria-label="Private Outlook subscription link"
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  M("Subscription link copied.");
                } catch {
                  ref.current?.select();
                  M("Link selected. Copy it and paste it into Outlook.");
                }
              }}
            >
              Copy link
            </button>
            <button type="button" className="text-link" onClick={() => U("")}>
              Hide link
            </button>
          </div>
          <p>Keep this link private. Anyone with it can read the calendar.</p>
        </div>
      )}
      <ol>
        <li>In Outlook on the web, open Calendar → Add calendar.</li>
        <li>Choose Subscribe from web and paste your private link.</li>
        <li>Name the calendar and select Import.</li>
      </ol>
      <p>
        Manage sessions in Archetype. This subscription is read-only in Outlook.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
