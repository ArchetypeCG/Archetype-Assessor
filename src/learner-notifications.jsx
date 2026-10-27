import React, { useState } from "react";
import {
  Bell,
  CheckCheck,
  ArrowUpRight,
  Archive,
  RotateCcw,
} from "lucide-react";
export function LearnerNotifications({ context }) {
  const {
    s,
    user,
    command,
    busy,
    notify,
    go,
    openLearner,
    setLearnerId,
    setModal,
  } = context;
  const [filter, setFilter] = useState("Unread");
  const alerts = s.notifications || [];
  const active = alerts.filter((n) => !n.clearedAt);
  const unread = active.filter((n) => !n.readAt).length;
  const needed = active.filter((n) => n.needsAction).length;
  const shown = alerts.filter((n) =>
    filter === "Cleared"
      ? n.clearedAt
      : !n.clearedAt &&
        (filter === "All" || (filter === "Unread" ? !n.readAt : n.needsAction)),
  );
  async function update(kind, id) {
    try {
      await command(kind, { id });
      return true;
    } catch (error) {
      notify(error.message);
      return false;
    }
  }
  async function open(n) {
    if (!(await update("notification.read", n.id))) return;
    if (n.learnerId) setLearnerId(n.learnerId);
    if (n.entityType === "message") return go("Messages");
    if (n.entityType === "evidence" && user.role === "Apprentice") {
      const item = s.evidence.find((e) => e.id === n.entityId);
      if (item) {
        openLearner(n.learnerId, "Evidence");
        setModal({ type: "evidenceDetail", item });
        return;
      }
    }
    if (n.entityType === "session") {
      const item = s.appointments.find((e) => e.id === n.entityId);
      go("Calendar");
      if (item)
        setModal({
          type: "sessionDetail",
          item,
          learner: s.learners.find((l) => l.id === n.learnerId),
        });
      return;
    }
    if (n.entityType === "review") return openLearner(n.learnerId, "Reviews");
    if (n.entityType === "task") return go("Action plans");
    if (n.entityType === "plan") return go("Learning plan");
    if (n.entityType === "otj" && user.role === "Apprentice")
      return go("Off-the-job learning");
    go("Progress report");
  }
  return (
    <div className="notifications-inbox">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR UPDATES</span>
          <h1>Alerts</h1>
          <p>
            Assessor updates, feedback and next steps for{" "}
            {user.role === "Employer" ? "your apprentices" : "your programme"}.
          </p>
        </div>
        <button
          className="button"
          disabled={busy || !unread}
          onClick={() => update("notifications.readAll")}
        >
          <CheckCheck size={17} /> Mark all as read
        </button>
      </div>
      <div className="notification-summary">
        <div>
          <strong>{unread}</strong>
          <span>Unread updates</span>
        </div>
        <div>
          <strong>{needed}</strong>
          <span>Need attention</span>
        </div>
      </div>
      <div
        className="notification-filters"
        role="group"
        aria-label="Filter alerts"
      >
        {["Unread", "Action needed", "All", "Cleared"].map((value) => (
          <button
            key={value}
            className={filter === value ? "button primary" : "button"}
            onClick={() => setFilter(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="notification-list">
        {!shown.length && (
          <div className="panel notification-empty">
            <Bell size={28} />
            <h3>
              {filter === "Unread"
                ? "You’re up to date"
                : "No alerts in this view"}
            </h3>
            <p>New shared assessor updates will appear here.</p>
          </div>
        )}
        {shown.map((n) => (
          <article
            className={
              "panel notification-card " + (!n.readAt ? "is-unread" : "")
            }
            key={n.id}
          >
            <div className="notification-card-top">
              <span className="notification-type">
                {s.learners.find((l) => l.id === n.learnerId)?.name ||
                  "Your messages"}{" "}
                · {n.actorName}
              </span>
              <time>
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/London",
                }).format(new Date(n.created))}
              </time>
            </div>
            <h3>
              {!n.readAt && <span className="unread-dot" />}
              {n.title}
            </h3>
            <p>{n.body}</p>
            {n.needsAction && (
              <span className="notification-action-badge">{n.actionLabel}</span>
            )}
            <div className="notification-card-actions">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => open(n)}
              >
                View details <ArrowUpRight size={16} />
              </button>
              {!n.clearedAt && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    update(
                      n.readAt ? "notification.unread" : "notification.read",
                      n.id,
                    )
                  }
                >
                  {n.readAt ? "Mark unread" : "Mark read"}
                </button>
              )}
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  update(
                    n.clearedAt ? "notification.restore" : "notification.clear",
                    n.id,
                  )
                }
              >
                {n.clearedAt ? <RotateCcw size={15} /> : <Archive size={15} />}{" "}
                {n.clearedAt ? "Restore alert" : "Clear alert"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="caption">
        Clearing an alert only clears your list. Complete the activity or
        respond to feedback in the relevant record.
      </p>
    </div>
  );
}
