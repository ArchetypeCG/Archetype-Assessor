import { sessionHeaders } from "./session";
import React, { useState, useEffect } from "react";
import { otjProgress } from "../server/otj-target.mjs";
import { fmt, localDate } from "./lib";
export function OTJProgress({ learner, logs = [], initialDate }) {
  const [date, D] = useState(initialDate || localDate());
  const {
    approved: hours,
    expected,
    variance: difference,
  } = otjProgress(learner, logs, date);
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Off-the-job progress</h2>
          <p>Approved log hours compared with the programme training target.</p>
          <p>
            <strong>{learner.name}</strong> · {learner.ref}
          </p>
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
        Programme: {fmt(learner.startDate)} –{" "}
        {fmt(learner.plannedEnd || learner.predictedEnd)} · Total OTJ target:{" "}
        {learner.otjTarget || "Not set"}h
      </p>
      <p className="caption">
        Approved hours use only this apprentice’s approved log entries dated on
        or before the target date, for their current programme. Expected hours
        are spread evenly from the programme start to the planned training end
        date. Adjust the programme dates and total OTJ target for the agreed
        training plan. Planned activities do not count until their OTJ log hours
        are approved.
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
  const [selected, SELECT] = useState("");
  useEffect(() => SELECT(""), [learner.id, learner.standardId]);
  if (!["Manager", "Assessor"].includes(user.role)) return null;
  const templates = (s.learningTemplates || []).filter(
    (t) => t.standardId === learner.standardId,
  );
  const chosen = templates.find((t) => t.id === selected);
  return (
    <section className="panel">
      <h3>Reusable learning activities</h3>
      <p className="caption">
        Choose a saved activity for this programme, then review it before adding
        it to the apprentice’s learning plan.
      </p>
      {templates.length ? (
        <>
          <div className="reusable-activity-picker">
            <label>
              Saved learning activity
              <select
                aria-label="Reusable learning activity"
                value={selected}
                onChange={(e) => SELECT(e.target.value)}
              >
                <option value="">Select an activity…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {t.method}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={!chosen}
              onClick={() =>
                setModal({
                  type: "plan",
                  learner,
                  prefill: {
                    ...chosen,
                    id: undefined,
                    status: "Planned",
                    startDate: localDate(),
                    due: "",
                    outcomeNotes: "",
                  },
                })
              }
            >
              Use selected activity
            </button>
          </div>
          {chosen && (
            <div className="reusable-activity-summary">
              <strong>{chosen.title}</strong>
              <p>{chosen.description}</p>
              <small>
                {chosen.method} · {chosen.plannedHours} planned hours ·{" "}
                {(chosen.criteria || []).join(", ")}
              </small>
            </div>
          )}
          <p className="caption">
            Remove learner-specific details before reusing an activity.
          </p>
        </>
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
      <h3>Originality review</h3>
      <h4>Stored-work similarity</h4>
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
      <h4>Internet source check</h4>
      <p>
        {report.internet?.status || "Not checked"}
        {report.internet?.provider ? ` · ${report.internet.provider}` : ""}
      </p>
      {report.internet?.searchedPassages > 0 && (
        <p>
          {report.internet.matchedPassages} of{" "}
          {report.internet.searchedPassages} searched passages matched.
          {report.internet.requestedPassages
            ? ` ${report.internet.searchedPassages} of ${report.internet.requestedPassages} planned searches completed.`
            : ""}
        </p>
      )}
      {report.internet?.status === "Checked" &&
        !report.internet.matches?.length && (
          <p>No matching passages returned.</p>
        )}
      {(report.internet?.matches || []).map((match, index) => (
        <article className="decision-entry" key={match.url + index}>
          <a href={match.url} target="_blank" rel="noreferrer noopener">
            {match.title || match.url}
          </a>
          <p>{match.snippet}</p>
          <small>Matched passage: {match.passage}</small>
        </article>
      ))}
      {report.unsupportedFiles?.length > 0 && (
        <p>
          Text could not be read from: {report.unsupportedFiles.join(", ")}.
          Images and scanned PDFs need manual review.
        </p>
      )}
      {report.truncated && (
        <p>The text check covered the first 100,000 characters.</p>
      )}
      <h4>AI writing review</h4>
      <p>{report.aiReview?.recommendation || "Not checked"}</p>
      {report.aiReview?.method && <small>{report.aiReview.method}</small>}
      {(report.aiReview?.signals || []).map((signal) => (
        <div key={signal.name}>
          <strong>{signal.name}</strong>
          <p>{signal.detail}</p>
        </div>
      ))}
      {report.aiReview?.questions?.length > 0 && (
        <>
          <h5>Suggested assessor questions</h5>
          <ul>
            {report.aiReview.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      )}
      {onRecheck && (
        <button
          className="button secondary"
          type="button"
          disabled={busy || ["Queued", "Processing"].includes(report.status)}
          onClick={onRecheck}
        >
          Run originality checks
        </button>
      )}
    </section>
  );
}

export function EPASelection({ evidence, allowed, command, busy, notify }) {
  const [selected, S] = useState(!!evidence.epaSelected);
  useEffect(
    () => S(!!evidence.epaSelected),
    [evidence.id, evidence.epaSelected],
  );
  if (!allowed)
    return <span>{selected ? "Selected for EPA" : "Not selected"}</span>;
  return (
    <label className="checkbox-label">
      <input
        type="checkbox"
        aria-label={`Include ${evidence.title} in EPA folder`}
        checked={selected}
        disabled={busy}
        onChange={async (event) => {
          const value = event.target.checked;
          S(value);
          try {
            await command("evidence.epa", { id: evidence.id, selected: value });
          } catch (error) {
            S(!value);
            notify(error.message);
          }
        }}
      />
      {selected ? "Selected for EPA" : "Include in EPA"}
    </label>
  );
}
