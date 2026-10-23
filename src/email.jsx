import { sessionHeaders } from "./session";
import React, { useState, useEffect } from "react";
import { Mail, LockKeyhole } from "lucide-react";
async function request(path, data) {
  const r = await fetch("/api/" + path, {
    method: data ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Request failed");
  return result;
}
export function PasswordRecovery({ compact = false }) {
  const [open, O] = useState(!compact),
    [message, M] = useState(""),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const token =
    new URLSearchParams(window.location.hash.slice(1)).get("reset") ||
    new URLSearchParams(window.location.search).get("reset");
  if (!open)
    return (
      <button
        type="button"
        className="text-link"
        onClick={() => O(true)}
        style={{ marginTop: 18 }}
      >
        Forgot your password?
      </button>
    );
  const form = (
    <section className={compact ? "password-recovery" : "reference-login-card"}>
      <h2>{token ? "Choose a new password" : "Recover your account"}</h2>
      <p>
        {token
          ? "Your recovery link expires after one hour."
          : "Enter your account email to request a secure reset link."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          E("");
          M("");
          if (token && f.get("password") !== f.get("confirm"))
            return E("Passwords do not match.");
          B(true);
          try {
            const result = await request(
              token ? "password/reset" : "password/forgot",
              token
                ? { token, password: f.get("password") }
                : { email: f.get("email") },
            );
            M(
              token
                ? "Password updated. Sign in using your new password."
                : result.message,
            );
            if (token) {
              window.history.replaceState({}, "", window.location.pathname);
            }
          } catch (e) {
            E(e.message);
          } finally {
            B(false);
          }
        }}
      >
        {token ? (
          <>
            <label>
              New password
              <input
                type="password"
                name="password"
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                name="confirm"
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </label>
          </>
        ) : (
          <label>
            Email address
            <input type="email" name="email" autoComplete="email" required />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button className="button" disabled={busy}>
          {token ? <LockKeyhole size={16} /> : <Mail size={16} />}{" "}
          {busy
            ? "Submitting…"
            : token
              ? "Set new password"
              : "Email reset link"}
        </button>
      </form>
      {compact ? (
        <button className="text-link" type="button" onClick={() => O(false)}>
          Back to sign in
        </button>
      ) : (
        <a className="text-link" href="/">
          Back to sign in
        </a>
      )}
    </section>
  );
  return compact ? form : <div className="reference-login">{form}</div>;
}
export function EmailSettings({ user, command, notify, busy }) {
  const [status, S] = useState(null),
    [error, E] = useState(""),
    [enabled, N] = useState(user.morningDigest !== false);
  useEffect(() => {
    if (user.role === "Manager")
      request("email/status")
        .then(S)
        .catch((e) => E(e.message));
  }, [user.role]);
  return (
    <section className="panel email-status">
      <div className="panel-header">
        <div>
          <span className="eyebrow">STAY ONE STEP AHEAD</span>
          <h2>Morning email reminders</h2>
          <p>
            A daily summary of urgent actions, overdue reviews and scheduled
            work visible to your account.
          </p>
        </div>
        <Mail size={24} />
      </div>
      <label className="sampling-checkbox">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={async (e) => {
            const value = e.target.checked;
            try {
              await command("notifications.preferences", {
                morningDigest: value,
              });
              N(value);
            } catch (e) {
              notify(e.message);
            }
          }}
        />
        Email me my urgent actions each morning
      </label>
      {status && (
        <>
          <p>
            {status.configured
              ? "Email provider configured."
              : "Email delivery needs configuring in Render."}{" "}
            {status.morningDigestEnabled
              ? `Morning summaries scheduled from ${String(status.hour).padStart(2, "0")}:00 Europe/London.`
              : "Morning email scheduling is switched off."}
          </p>
          <div className="button-row">
            {status.counts.map((x) => (
              <span className="tag" key={x.status}>
                {x.status}: {x.count}
              </span>
            ))}
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
