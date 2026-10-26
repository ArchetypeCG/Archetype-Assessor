import React, { useEffect, useState } from "react";
import { sessionHeaders } from "./session";
export function OutlookConnection({ user }) {
  const [status, S] = useState(null),
    [pending, P] = useState(false),
    [error, E] = useState(""),
    [message, M] = useState(""),
    [url, U] = useState("");
  async function request(path, method = "GET") {
    const response = await fetch("/api/outlook/" + path, {
      method,
      headers: {
        ...sessionHeaders(),
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method !== "GET" ? { body: "{}" } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || "Could not update the Outlook connection.");
    return result;
  }
  async function load() {
    const value = await request("status");
    S(value);
    return value;
  }
  useEffect(() => {
    let active = true;
    const refresh = () =>
      load().catch((e) => {
        if (active) E(e.message);
      });
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [user.id]);
  async function connect() {
    E("");
    M("");
    P(true);
    const popup = window.open(
      "about:blank",
      "_blank",
      "popup,width=620,height=760",
    );
    if (popup) popup.opener = null;
    try {
      const result = await request("connect", "POST");
      U(result.url);
      if (popup) popup.location.replace(result.url);
      M(
        "Complete Microsoft sign-in in the new window, then return here. The connection status refreshes automatically.",
      );
    } catch (error) {
      popup?.close();
      E(error.message);
    } finally {
      P(false);
    }
  }
  async function action(path) {
    E("");
    M("");
    P(true);
    try {
      await request(path, "POST");
      await load();
      U("");
      M(
        path === "disconnect"
          ? "Outlook disconnected. Existing copies stay in Outlook; further updates have stopped."
          : "Outlook calendar updated.",
      );
    } catch (error) {
      E(error.message);
      await load().catch(() => {});
    } finally {
      P(false);
    }
  }
  return (
    <section className="outlook-direct">
      <h3>Connect your existing Outlook work calendar</h3>
      <p>
        Send your sessions and reviews directly into your main Microsoft 365
        calendar. Manage appointments in Archetype; updates flow into Outlook
        automatically, without meeting invitations.
      </p>
      {!status && !error && <p>Loading connection…</p>}
      {status && !status.configured && (
        <p>
          An administrator needs to finish Microsoft 365 setup before you can
          connect.
        </p>
      )}
      {status?.connected && (
        <div className="outlook-connection-status">
          <strong>Connected: {status.account.name}</strong>
          <span>{status.account.address}</span>
          <span>
            {status.lastSync
              ? `Last updated ${new Date(status.lastSync).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
              : "First calendar update is pending."}
          </span>
        </div>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={!status?.configured || pending}
          onClick={connect}
        >
          {status?.connected ? "Reconnect Outlook" : "Connect Outlook"}
        </button>
        {status?.connected && (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={pending || status.syncing}
              onClick={() => action("sync")}
            >
              {pending || status.syncing ? "Updating…" : "Sync now"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => action("disconnect")}
            >
              Disconnect Outlook
            </button>
          </>
        )}
        <button
          type="button"
          className="text-link"
          disabled={pending}
          onClick={() => {
            E("");
            load().catch((e) => E(e.message));
          }}
        >
          Refresh connection status
        </button>
      </div>
      {url && (
        <p>
          <a
            className="text-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Continue Microsoft sign-in
          </a>
        </p>
      )}
      {status?.connected && (
        <p className="caption">
          If you previously subscribed to the separate Archetype calendar, hide
          or remove that subscription in Outlook to avoid displaying each
          session twice. Disconnecting stops updates and leaves existing copies
          in Outlook.
        </p>
      )}
      {user.role === "Manager" && !status?.configured && (
        <details>
          <summary>Administrator setup</summary>
          <p>
            Register a Microsoft Entra web application and configure the
            connection in Render.
          </p>
          {status?.redirectUri && (
            <p>
              Redirect URI: <code>{status.redirectUri}</code>
            </p>
          )}
          <a
            className="text-link"
            href="https://github.com/ArchetypeCG/Archetype-Assessor/blob/main/docs/OUTLOOK_DIRECT.md"
            target="_blank"
            rel="noreferrer"
          >
            Open Microsoft 365 setup instructions
          </a>
        </details>
      )}
      {status?.lastError && (
        <p className="form-error" role="alert">
          {status.lastError}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
