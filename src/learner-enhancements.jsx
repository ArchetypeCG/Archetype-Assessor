import { sessionHeaders } from "./session";
import React, { useState, useEffect } from "react";
import { expectedOtjHours } from "../server/otj-target.mjs";
import { fmt, localDate } from "./lib";
export function OTJProgress({ learner, initialDate }) {
  const [date, D] = useState(initialDate || localDate());
  const expected = expectedOtjHours(learner, date),
    hours = learner.hours || 0,
    difference =
      expected == null ? null : Math.round((hours - expected) * 10) / 10;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Off-the-job progress</h2>
          <p>Approved log hours compared with the programme training target.</p>
        </div>
        <label>
          Target date
          <input
            aria-label="OTJ target date"
            type="date"
            value={date}
            onChange={(e) => D(e.target.value)}
          />
        </label>
      </div>
      <div className="metrics three">
        <div className="metric">
          <span>Approved OTJ hours</span>
          <strong>{hours}h</strong>
        </div>
        <div className="metric">
          <span>Expected by {fmt(date)}</span>
          <strong>{expected == null ? "Not set" : `${expected}h`}</strong>
        </div>
        <div
          className={
            "metric otj-status " +
            (difference == null
              ? "unset"
              : difference >= 0
                ? "on-target"
                : date > localDate()
                  ? "planned"
                  : "behind")
          }
        >
          <span>
            {difference == null
              ? "Set programme dates and an OTJ target"
              : difference >= 0
                ? "On target"
                : date > localDate()
                  ? "Still to log by this date"
                  : "Behind target"}
          </span>
          <strong>
            {difference == null
              ? "—"
              : difference === 0
                ? "On target"
                : `${Math.abs(difference)}h ${difference >= 0 ? "ahead" : date > localDate() ? "to log" : "behind"}`}
          </strong>
        </div>
      </div>
      <p className="caption">
        Expected hours are spread evenly from the programme start to the planned
        training end date. Adjust the programme dates and total OTJ target for
        the agreed training plan. Planned activities do not count until their
        OTJ log hours are approved.
      </p>
    </section>
  );
}
export function PrivateLearnerNotes({
  s,
  user,
  learner,
  command,
  busy,
  notify,
}) {
  const [text, T] = useState("");
  if (!["Manager", "Assessor"].includes(user.role)) return null;
  return (
    <section className="panel">
      <h2>Confidential learner notes</h2>
      <p>
        Visible only to the master administrator and this apprentice’s assessor.
      </p>
      {learner.notes && <p className="preserve-text">{learner.notes}</p>}
      {(s.privateLearnerNotes || [])
        .filter((n) => n.learnerId === learner.id)
        .map((n) => (
          <article key={n.id}>
            <small>
              {s.users.find((u) => u.id === n.by)?.name || "Staff"} ·{" "}
              {fmt(n.date)}
            </small>
            <p className="preserve-text">{n.text}</p>
          </article>
        ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await command("learner.privateNote", {
              learnerId: learner.id,
              text,
            });
            T("");
          } catch (error) {
            notify(error.message);
          }
        }}
      >
        <label>
          New confidential note
          <textarea
            aria-label="New confidential learner note"
            value={text}
            maxLength={20000}
            required
            onChange={(e) => T(e.target.value)}
          />
        </label>
        <button className="button" disabled={busy || !text.trim()}>
          Save confidential note
        </button>
      </form>
    </section>
  );
}
export function FunctionalSkillsChecks({
  learner,
  user,
  command,
  onUpdated,
  busy,
  notify,
}) {
  const [requirements, R] = useState({
    english: !!learner.englishNotRequired,
    maths: !!learner.mathsNotRequired,
  });
  useEffect(
    () =>
      R({
        english: !!learner.englishNotRequired,
        maths: !!learner.mathsNotRequired,
      }),
    [learner.id, learner.englishNotRequired, learner.mathsNotRequired],
  );
  if (!["Manager", "Assessor"].includes(user.role)) return null;
  return (
    <div className="wide">
      <h3>Functional skills requirements</h3>
      <p>
        Mark a subject as not required only after checking the rules applicable
        to this apprentice.
      </p>
      {["english", "maths"].map((subject) => (
        <label key={subject} className="checkbox-label">
          <input
            type="checkbox"
            checked={requirements[subject]}
            disabled={busy}
            onChange={async (e) => {
              const next = { ...requirements, [subject]: e.target.checked };
              R(next);
              try {
                await command("learner.functionalSkills", {
                  learnerId: learner.id,
                  englishNotRequired: next.english,
                  mathsNotRequired: next.maths,
                });
                onUpdated();
              } catch (error) {
                R(requirements);
                notify(error.message);
              }
            }}
          />
          {subject === "english" ? "English" : "Maths"}
          {learner[subject + "Upskill"] ? " upskill" : ""} not required
        </label>
      ))}
    </div>
  );
}
export function LearningTemplates({ s, user, learner, setModal }) {
  if (!["Manager", "Assessor"].includes(user.role)) return null;
  const templates = (s.learningTemplates || []).filter(
    (t) => t.standardId === learner.standardId,
  );
  return (
    <section className="panel">
      <h3>Reusable learning activities</h3>
      <p className="caption">
        Remove learner-specific details from the wording before saving or
        reusing an activity.
      </p>
      {templates.length ? (
        templates.map((t) => (
          <div className="button-row" key={t.id}>
            <span>
              {t.title} · {t.method}
            </span>
            <button
              className="button secondary"
              onClick={() =>
                setModal({
                  type: "plan",
                  learner,
                  prefill: {
                    ...t,
                    id: undefined,
                    status: "Planned",
                    startDate: localDate(),
                    due: "",
                    outcomeNotes: "",
                  },
                })
              }
            >
              Use activity
            </button>
          </div>
        ))
      ) : (
        <p>
          Save an activity below as a template to reuse it with other
          apprentices on the same programme.
        </p>
      )}
    </section>
  );
}

export function IntegrityReport({ evidence, onRecheck, busy }) {
  const [report, R] = useState(evidence.integrity || { status: "Not checked" });
  useEffect(
    () => R(evidence.integrity || { status: "Not checked" }),
    [evidence.id, evidence.integrity?.status, evidence.integrity?.checkedAt],
  );
  useEffect(() => {
    if (!["Queued", "Processing"].includes(report.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/state", {
          headers: sessionHeaders(),
        });
        if (!response.ok) return;
        const data = await response.json(),
          result = data.state.evidence.find(
            (e) => e.id === evidence.id,
          )?.integrity;
        if (result && !cancelled) R(result);
      } catch {}
    };
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [report.status, evidence.id]);
  return (
    <section className="feedback-box">
      <h3>Internal similarity check</h3>
      <p>
        {report.status}
        {report.similarity != null ? ` · ${report.similarity}% text match` : ""}
      </p>
      {report.wordCount != null && (
        <p>
          {report.wordCount} readable words · {report.comparedDocuments} stored
          submissions compared.
        </p>
      )}
      <p className="caption">
        Internal matches only; no internet search. Similarity can include quoted
        material and shared assignment wording. An assessor must review any
        match.
      </p>
      {report.unsupportedFiles?.length > 0 && (
        <p>
          Text could not be read from: {report.unsupportedFiles.join(", ")}.
          Images and scanned PDFs need manual review.
        </p>
      )}
      {report.truncated && (
        <p>The text check covered the first 100,000 characters.</p>
      )}
      <h4>AI authorship review</h4>
      <p className="caption">
        No reliable AI probability score is available. Use discussion, drafts
        and workplace evidence to check the learner’s understanding.
      </p>
      {report.repeatedParagraphs > 0 && (
        <p>
          Review signal: {report.repeatedParagraphs} repeated paragraphs. This
          is not evidence of AI use.
        </p>
      )}
      {onRecheck && (
        <button
          className="button secondary"
          type="button"
          disabled={busy || ["Queued", "Processing"].includes(report.status)}
          onClick={onRecheck}
        >
          Check internal similarity
        </button>
      )}
    </section>
  );
}
