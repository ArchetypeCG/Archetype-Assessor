import React, { useState, useEffect } from "react";
import { ArrowUpRight, FileText, Plus } from "lucide-react";
import { assessorDay, assessmentQueue } from "./assessor-day.mjs";
import { fmt } from "./lib";
export function AssessorEvidenceWorkspace({ context, children }) {
  const { s, user, setModal } = context;
  const evidence = assessmentQueue(
    s,
    user.role === "Manager" ? undefined : user.id,
  );
  const title =
    user.role === "Manager" ? "Assessment queue" : "Evidence awaiting feedback";
  return (
    <>
      <section className="workload-panel" aria-label={title}>
        <div className="workload-heading">
          <div>
            <h2>
              {title} <span>{evidence.length}</span>
            </h2>
            <p>
              {user.role === "Manager"
                ? "Submitted work across your provision · current programmes only"
                : "Submitted work across your active caseload · current programmes only"}
            </p>
          </div>
        </div>
        <div className="workload-list">
          {evidence.map((e) => (
            <button
              key={e.id}
              className="workload-row"
              onClick={() =>
                setModal({
                  type: "evidenceDetail",
                  item: e,
                  learner: s.learners.find((l) => l.id === e.learnerId),
                })
              }
            >
              <FileText size={19} />
              <span>
                <strong>{e.title}</strong>
                <small>
                  {s.learners.find((l) => l.id === e.learnerId)?.name} ·
                  Submitted {fmt(e.date)}
                </small>
              </span>
              <span className="workload-row-action">
                Assess <ArrowUpRight size={14} />
              </span>
            </button>
          ))}
        </div>
        {!evidence.length && (
          <p className="workload-empty">
            No submitted work is waiting for your feedback.
          </p>
        )}
      </section>
      <details className="workload-history">
        <summary>
          Browse individual portfolios, uploads and assessed evidence
        </summary>
        {children}
      </details>
    </>
  );
}
export function AssessorReviewWorkspace({ context, children }) {
  const { s, user, setModal, openLearner, pageFilter } = context;
  const [view, setView] = useState(pageFilter.view || "overdue");
  useEffect(() => setView(pageFilter.view || "overdue"), [pageFilter]);
  const work = assessorDay(s, user.role === "Manager" ? undefined : user.id);
  const rows =
    view === "overdue"
      ? work.overdueLearners
      : view === "today"
        ? work.todayLearners
        : view === "soon"
          ? work.dueSoonLearners
          : work.reviewLearners;
  return (
    <>
      <section className="workload-panel" aria-label="Outstanding reviews">
        <div className="workload-heading">
          <div>
            <h2>
              Outstanding reviews <span>{rows.length}</span>
            </h2>
            <p>
              One next-review date per active apprentice. Completed review
              records are separate below.
            </p>
          </div>
          <button
            className="button"
            onClick={() => setModal({ type: "review" })}
          >
            <Plus size={15} /> Record review
          </button>
        </div>
        <div
          className="workload-filters"
          role="group"
          aria-label="Review due date filter"
        >
          {[
            ["overdue", "Overdue", work.overdueReviews],
            ["today", "Due today", work.reviewsToday],
            ["soon", "Due within 14 days", work.dueSoonLearners.length],
            ["all", "All scheduled", work.reviewLearners.length],
          ].map(([value, label, count]) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label} <b>{count}</b>
            </button>
          ))}
        </div>
        <div className="workload-list">
          {rows.map((l) => (
            <div key={l.id} className="workload-review-row">
              <button onClick={() => openLearner(l.id, "Reviews")}>
                <span>
                  <strong>{l.name}</strong>
                  <small>Next review: {fmt(l.nextReview)}</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
              <button
                className="text-link"
                onClick={() => setModal({ type: "review", learner: l })}
              >
                Record review
              </button>
            </div>
          ))}
        </div>
        {!rows.length && (
          <p className="workload-empty">No reviews in this view.</p>
        )}
      </section>
      <details className="workload-history">
        <summary>Completed review records and calendar bookings</summary>
        {children}
      </details>
    </>
  );
}
