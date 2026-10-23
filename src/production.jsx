import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  Download,
  RefreshCw,
  Database,
  Check,
  X,
} from "lucide-react";
export function PasswordGate({ user, onChange, onSignOut }) {
  const [error, E] = useState(""),
    [busy, B] = useState(false);
  return (
    <div className="reference-login">
      <section className="reference-login-card">
        <span className="login-workspace-chip">
          <ShieldCheck size={15} />
          SECURE YOUR ACCOUNT
        </span>
        <h1>Set your own password.</h1>
        <p>
          {user.name}, your initial password is temporary. Choose a unique
          password of at least 12 characters before opening the workspace.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm"))
              return E("The new passwords do not match.");
            B(true);
            E("");
            try {
              await onChange({
                current: f.get("current"),
                password: f.get("password"),
              });
            } catch (e) {
              E(e.message);
            } finally {
              B(false);
            }
          }}
        >
          <input
            type="hidden"
            name="username"
            autoComplete="username"
            value={user.email || ""}
          />
          <label>
            Temporary / current password
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirm"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Set password & sign in again"}
            <LockKeyhole size={15} />
          </button>
        </form>
        <button
          className="text-link"
          onClick={onSignOut}
          style={{ marginTop: 20 }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
export function AccountControls({ s, user, command, refresh, notify }) {
  const [temporary, T] = useState(null),
    [busy, B] = useState(false);
  if (user.role !== "Manager") return null;
  async function reset(account) {
    if (
      !window.confirm(
        `Reset the password for ${account.name}? A secure recovery link will be emailed and their existing sessions will be signed out.`,
      )
    )
      return;
    B(true);
    try {
      const result = await command("user.resetPassword", { id: account.id });
      if (result.emailQueued) {
        notify(`Password reset email queued for ${account.email}.`);
        return;
      }
      T({
        name: account.name,
        email: account.email,
        password: result.temporaryPassword,
      });
    } catch (e) {
      notify(e.message);
    } finally {
      B(false);
    }
  }
  async function toggle(account) {
    if (
      !window.confirm(
        `${account.active === false ? "Reactivate" : "Deactivate"} ${account.name}? Deactivation signs out all their devices.`,
      )
    )
      return;
    B(true);
    try {
      await command("user.setActive", {
        id: account.id,
        active: account.active === false,
      });
    } catch (e) {
      notify(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Account access & recovery</h2>
          <p>
            Password resets send a secure link to the account email. Links
            expire after one hour and can be used once.
          </p>
        </div>
      </div>
      {temporary && (
        <div className="temporary-credentials" role="status">
          <strong>Temporary password · {temporary.name}</strong>
          <p>{temporary.email}</p>
          <code>{temporary.password}</code>
          <p>
            This password is displayed once here. Send it through your
            organisation’s secure channel; it cannot be retrieved later.
          </p>
          <button className="button secondary" onClick={() => T(null)}>
            Dismiss credentials
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Access</th>
              <th>Recovery</th>
            </tr>
          </thead>
          <tbody>
            {s.users.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.name}</strong>
                  <small>{a.email}</small>
                </td>
                <td>{a.role === "Manager" ? "Master user" : a.role}</td>
                <td>
                  <span
                    className={"tag " + (a.active === false ? "red" : "green")}
                  >
                    {a.active === false ? "Inactive" : "Active"}
                  </span>
                  {a.id !== user.id && (
                    <button
                      className="text-link account-action"
                      disabled={busy}
                      onClick={() => toggle(a)}
                    >
                      {a.active === false ? "Reactivate" : "Deactivate"}
                    </button>
                  )}
                </td>
                <td>
                  {a.id !== user.id && a.active !== false && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => reset(a)}
                    >
                      Issue temporary password
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
async function call(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed.");
  return data;
}
export function ProductionStatus({ user, notify }) {
  const [info, I] = useState(null),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  async function load() {
    try {
      I(await call("/api/admin/backups"));
      E("");
    } catch (e) {
      E(e.message);
    }
  }
  useEffect(() => {
    if (user.role === "Manager") load();
  }, [user.id]);
  if (user.role !== "Manager") return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Storage, backups & live operations</h2>
          <p>
            The server is the source of truth. Records and file attachments are
            shared across authorised devices.
          </p>
        </div>
        <button className="button secondary" onClick={load}>
          <RefreshCw size={15} />
          Refresh status
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {info && (
        <>
          <div className="operational-checks">
            {[
              ["Live mode", info.production],
              ["Secure cookies", info.secureCookies],
              [
                "Persistent directory configured",
                info.persistentDirectoryConfigured,
              ],
              ["Encrypted daily backups", info.enabled],
              [
                "Off-site backup destination configured",
                info.offsiteConfigured,
              ],
            ].map(([label, ok]) => (
              <div key={label}>
                <span className={ok ? "operational-ok" : "operational-pending"}>
                  {ok ? <Check size={16} /> : <X size={16} />}
                </span>
                <strong>{label}</strong>
                <small>{ok ? "Configured" : "Not configured"}</small>
              </div>
            ))}
          </div>
          <p className="caption">
            Last encrypted backup:{" "}
            {info.lastBackup
              ? new Date(info.lastBackup).toLocaleString("en-GB")
              : "No backup yet"}{" "}
            · retention {info.retentionDays} days. Off-site upload last
            completed in this process:{" "}
            {info.lastOffsite
              ? new Date(info.lastOffsite).toLocaleString("en-GB")
              : "Not yet recorded"}
            .
          </p>
          {info.lastError && <div className="form-error">{info.lastError}</div>}
          <div className="button-row">
            <button
              className="button"
              disabled={!info.enabled || busy || info.running}
              onClick={async () => {
                B(true);
                try {
                  await call("/api/admin/backups", {
                    method: "POST",
                    body: "{}",
                  });
                  notify("Encrypted backup created.");
                  await load();
                } catch (e) {
                  E(e.message);
                  await load();
                } finally {
                  B(false);
                }
              }}
            >
              <Database size={15} />
              {busy ? "Creating backup…" : "Create encrypted backup"}
            </button>
            <a
              className="text-link"
              href="https://github.com/ArchetypeCG/Archetype-Assessor/blob/main/docs/DEPLOYMENT.md"
              target="_blank"
              rel="noreferrer"
            >
              Deployment & recovery guide
            </a>
          </div>
          <p className="caption">
            Local backups survive restarts on a persistent disk, but not loss of
            that disk. Configure a separate S3-compatible bucket and preserve
            the encryption key securely for disaster recovery.
          </p>
          <div className="backup-files">
            {info.files.slice(0, 7).map((f) => (
              <a
                className="attachment"
                href={"/api/admin/backups/" + encodeURIComponent(f.name)}
                key={f.name}
              >
                <LockKeyhole size={15} />
                <span>
                  {new Date(f.date).toLocaleString("en-GB")} · encrypted SQLite
                  backup
                </span>
                <small>{Math.ceil(f.size / 1024)} KB</small>
                <Download size={14} />
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
