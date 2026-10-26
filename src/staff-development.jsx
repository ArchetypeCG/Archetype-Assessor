import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Trophy,
  Sparkles,
  Quote,
  Plus,
  CalendarDays,
  MessageSquare,
  ArrowRight,
  X,
  ShieldCheck,
} from "lucide-react";
import { initials, localDate, fmt } from "./lib";
export function SuccessSpotlight({ story, preview = false }) {
  const [expanded, EXPAND] = useState(false);
  if (!story) return null;
  const text = story.story || "Your success story will appear here.";
  return (
    <section
      className="success-spotlight"
      aria-label={preview ? "Success story preview" : "Team success spotlight"}
    >
      <div className="spotlight-decoration" aria-hidden="true">
        <Sparkles size={104} />
      </div>
      <div className="spotlight-heading">
        <span>
          <Sparkles size={16} />{" "}
          {preview ? "DASHBOARD PREVIEW" : "TEAM SPOTLIGHT"}
        </span>
        <span>{story.kind || "Learner success"}</span>
      </div>
      <div className="spotlight-content">
        <div className="spotlight-person">
          <div className="spotlight-monogram">
            {initials(story.personName || "Success story")}
            <Trophy size={22} />
          </div>
          <strong>
            {story.personName || "Celebrate someone’s achievement"}
          </strong>
          <small>{story.achievement || "An achievement worth sharing"}</small>
        </div>
        <div className="spotlight-story">
          <h2>{story.title || "Big moments. Lasting impact."}</h2>
          {story.quote && (
            <blockquote>
              <Quote size={21} />
              {story.quote}
            </blockquote>
          )}
          <p className="preserve-text">
            {expanded || text.length <= 420 ? text : text.slice(0, 420) + "…"}
          </p>
          {text.length > 420 && (
            <button
              className="spotlight-read"
              onClick={() => EXPAND(!expanded)}
            >
              {expanded ? "Show less" : "Read the full story"}
              <ArrowRight size={15} />
            </button>
          )}
          {story.publishedAt && <small>Shared {fmt(story.publishedAt)}</small>}
        </div>
      </div>
    </section>
  );
}
const emptyStory = {
  kind: "Learner success",
  personName: "",
  title: "",
  achievement: "",
  quote: "",
  story: "",
  published: false,
};
export function SpotlightEditor({ s, command, notify, busy }) {
  const initial =
    (s.successStories || []).find((story) => story.published) ||
    (s.successStories || []).at(-1);
  const [draft, D] = useState(initial || emptyStory),
    [error, E] = useState(""),
    [saving, SAVING] = useState(false);
  async function save(event) {
    event.preventDefault();
    E("");
    SAVING(true);
    try {
      const result = await command("spotlight.save", draft);
      D({ ...draft, id: result.storyId });
      notify(
        draft.published
          ? "Success story published to all assessor dashboards"
          : "Success story saved as a draft",
      );
    } catch (error) {
      E(error.message);
    } finally {
      SAVING(false);
    }
  }
  return (
    <>
      <div className="staff-feature-intro">
        <span className="eyebrow">CELEBRATE THE DIFFERENCE</span>
        <h2>Stories worth sharing.</h2>
        <p>
          Celebrate an assessor or apprentice. Publish one spotlight to every
          assessor’s dashboard, or keep it as a draft until it is ready.
        </p>
      </div>
      <div className="spotlight-editor-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Dashboard spotlight</h2>
            <button
              className="button secondary"
              onClick={() => {
                D(emptyStory);
                E("");
              }}
            >
              <Plus size={15} />
              New story
            </button>
          </div>
          <label>
            Previous stories
            <select
              aria-label="Previous success stories"
              value={draft.id || ""}
              onChange={(e) =>
                D(
                  (s.successStories || []).find(
                    (story) => story.id === e.target.value,
                  ) || emptyStory,
                )
              }
            >
              <option value="">New story</option>
              {(s.successStories || []).map((story) => (
                <option key={story.id} value={story.id}>
                  {story.published ? "Published · " : "Draft · "}
                  {story.title}
                </option>
              ))}
            </select>
          </label>
          <form className="form-grid story-form" onSubmit={save}>
            <label>
              Story type
              <select
                value={draft.kind}
                onChange={(e) => D({ ...draft, kind: e.target.value })}
              >
                <option>Learner success</option>
                <option>Assessor success</option>
              </select>
            </label>
            <label>
              Person’s name
              <input
                aria-label="Success story person's name"
                required
                maxLength={160}
                list="spotlight-people"
                value={draft.personName}
                onChange={(e) => D({ ...draft, personName: e.target.value })}
              />
              <datalist id="spotlight-people">
                {[
                  ...s.learners,
                  ...s.users.filter((u) => u.role === "Assessor"),
                ].map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </label>
            <label className="wide">
              Story title
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(e) => D({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="wide">
              Achievement
              <input
                required
                maxLength={250}
                value={draft.achievement}
                onChange={(e) => D({ ...draft, achievement: e.target.value })}
                placeholder="For example: distinction achieved, confidence built, a learner supported"
              />
            </label>
            <label className="wide">
              Success story
              <textarea
                required
                rows={7}
                maxLength={10000}
                value={draft.story}
                onChange={(e) => D({ ...draft, story: e.target.value })}
              />
            </label>
            <label className="wide">
              Featured quote
              <textarea
                rows={3}
                maxLength={2000}
                value={draft.quote}
                onChange={(e) => D({ ...draft, quote: e.target.value })}
              />
            </label>
            <label className="checkbox-label wide">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => D({ ...draft, published: e.target.checked })}
              />
              Publish to all assessor dashboards
            </label>
            <p className="caption wide">
              Only the text entered in this story is published. Apprentice
              support records and staff 1:1 notes are not included.
            </p>
            {error && (
              <p className="form-error wide" role="alert">
                {error}
              </p>
            )}
            <button className="button wide" disabled={saving || busy}>
              {saving
                ? "Saving…"
                : draft.published
                  ? "Publish success story"
                  : "Save draft"}
              <Sparkles size={17} />
            </button>
          </form>
        </section>
        <div className="spotlight-preview">
          <p className="eyebrow">WHAT ASSESSORS WILL SEE</p>
          <SuccessSpotlight key={draft.id || "preview"} story={draft} preview />
        </div>
      </div>
    </>
  );
}
const sections = [
  ["summary", "Meeting summary"],
  ["performance", "Caseload, performance and quality"],
  ["wellbeing", "Wellbeing and workload"],
  ["development", "Development and CPD"],
  ["actions", "Agreed actions and follow-up"],
  ["confidentialNotes", "Confidential manager notes"],
];
function OneToOneDialog({ record, assessors, command, onClose, notify }) {
  const dialog = useRef(null),
    [error, E] = useState(""),
    [pending, P] = useState(false),
    [status, STATUS] = useState(record.status || "Completed");
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  async function submit(event) {
    event.preventDefault();
    P(true);
    E("");
    try {
      await command("assessor.oneToOne.save", {
        ...Object.fromEntries(new FormData(event.currentTarget)),
        ...(record.id ? { id: record.id } : {}),
      });
      notify("Assessor 1:1 record saved");
      onClose();
    } catch (error) {
      E(error.message);
    } finally {
      P(false);
    }
  }
  return createPortal(
    <dialog
      className="staff-record-dialog"
      ref={dialog}
      aria-labelledby="staff-record-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="photo-dialog-heading">
        <div>
          <span className="eyebrow">PRIVATE SUPERVISION RECORD</span>
          <h2 id="staff-record-title">
            {record.id ? "Assessor 1:1 record" : "Record an assessor 1:1"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close 1:1 record"
          disabled={pending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="confidential-callout">
        <ShieldCheck size={18} />
        Master admin access only.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Assessor
          <select
            name="assessorId"
            required
            defaultValue={record.assessorId || ""}
          >
            <option value="">Choose assessor</option>
            {assessors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {!a.active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Meeting date
          <input
            name="date"
            type="date"
            required
            defaultValue={record.date || localDate()}
          />
        </label>
        <label className="wide">
          1:1 title
          <input
            name="title"
            maxLength={200}
            required
            defaultValue={record.title || "Monthly development conversation"}
          />
        </label>
        <label>
          Record status
          <select
            name="status"
            value={status}
            onChange={(e) => STATUS(e.target.value)}
          >
            <option>Completed</option>
            <option>Draft</option>
            <option>Planned</option>
          </select>
        </label>
        <label>
          Next 1:1 date
          <input
            name="nextDate"
            type="date"
            defaultValue={record.nextDate || ""}
          />
        </label>
        {sections.map(([name, label]) => (
          <label className="wide" key={name}>
            {label}
            <textarea
              name={name}
              rows={name === "summary" ? 4 : 3}
              maxLength={20000}
              required={name === "summary" && status === "Completed"}
              defaultValue={record[name] || ""}
            />
          </label>
        ))}
        {record.history?.length > 0 && (
          <details className="wide">
            <summary>
              {record.history.length} previous version
              {record.history.length === 1 ? "" : "s"}
            </summary>
            {record.history.map((version, i) => (
              <article className="one-to-one-history" key={i}>
                <strong>
                  {version.title} · {fmt(version.date)}
                </strong>
                {sections
                  .filter(([key]) => version[key])
                  .map(([key, label]) => (
                    <p key={key}>
                      <b>{label}:</b> {version[key]}
                    </p>
                  ))}
              </article>
            ))}
          </details>
        )}
        {error && (
          <p className="form-error wide" role="alert">
            {error}
          </p>
        )}
        <div className="button-row wide">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={pending}>
            {pending ? "Saving…" : "Save 1:1 record"}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
export function AssessorOneToOnes({ s, command, notify, busy }) {
  const [selected, SELECT] = useState(""),
    [query, Q] = useState(""),
    [editing, EDIT] = useState(null);
  const assessors = s.users.filter((u) => u.role === "Assessor"),
    all = s.assessorOneToOnes || [],
    records = all
      .filter(
        (r) =>
          (!selected || r.assessorId === selected) &&
          `${r.title} ${r.summary} ${r.actions}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.updated.localeCompare(a.updated),
      );
  const latest = assessors
      .map(
        (a) =>
          all
            .filter((r) => r.assessorId === a.id)
            .sort((a, b) => b.date.localeCompare(a.date))[0],
      )
      .filter(Boolean),
    due = latest.filter((r) => r.nextDate && r.nextDate <= localDate()).length;
  return (
    <>
      <div className="staff-feature-intro">
        <span className="eyebrow">PEOPLE. PROGRESS. PURPOSE.</span>
        <h2>Make every conversation count.</h2>
        <p>
          A private space for assessor supervision, meaningful development and
          clear follow-through.
        </p>
        <button
          className="button"
          disabled={busy || !assessors.length}
          onClick={() => EDIT({ assessorId: selected })}
        >
          <Plus size={17} />
          Record a 1:1
        </button>
      </div>
      <div className="staff-summary-grid">
        <article>
          <MessageSquare size={23} />
          <strong>{all.length}</strong>
          <span>Conversations recorded</span>
        </article>
        <article>
          <ShieldCheck size={23} />
          <strong>{all.filter((r) => r.status === "Completed").length}</strong>
          <span>Completed 1:1s</span>
        </article>
        <article>
          <CalendarDays size={23} />
          <strong>{due}</strong>
          <span>Follow-ups due</span>
        </article>
      </div>
      <div className="staff-record-layout">
        <aside className="panel staff-team-list">
          <h3>Your assessor team</h3>
          <button
            className={!selected ? "staff-person selected" : "staff-person"}
            onClick={() => SELECT("")}
          >
            All assessors<span>{all.length} records</span>
          </button>
          {assessors.map((a) => {
            const caseload = s.learners.filter((l) => l.assessorId === a.id),
              count = all.filter((r) => r.assessorId === a.id).length;
            return (
              <button
                className={
                  selected === a.id ? "staff-person selected" : "staff-person"
                }
                key={a.id}
                onClick={() => SELECT(a.id)}
              >
                <span className="avatar cool">{initials(a.name)}</span>
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {caseload.length} apprentices · {count} conversations
                  </small>
                </div>
              </button>
            );
          })}
          {!assessors.length && (
            <p>Add assessor accounts in Accounts & caseloads to begin.</p>
          )}
        </aside>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Conversation history</h2>
              <p>Saved securely · master admin only</p>
            </div>
            <input
              aria-label="Search 1:1 records"
              placeholder="Search conversations…"
              value={query}
              onChange={(e) => Q(e.target.value)}
            />
          </div>
          <div className="one-to-one-timeline">
            {records.map((r) => (
              <article className="one-to-one-card" key={r.id}>
                <div>
                  <span
                    className={"one-to-one-state " + r.status.toLowerCase()}
                  >
                    {r.status}
                  </span>
                  <small>{fmt(r.date)}</small>
                </div>
                <h3>{r.title}</h3>
                <strong>
                  {assessors.find((a) => a.id === r.assessorId)?.name ||
                    "Previous assessor"}
                </strong>
                <p>
                  {r.summary ||
                    "Conversation planned. Add notes after the meeting."}
                </p>
                {r.actions && (
                  <p className="one-to-one-actions">
                    <b>Next steps</b>
                    {r.actions}
                  </p>
                )}
                <footer>
                  {r.nextDate && <small>Next 1:1 · {fmt(r.nextDate)}</small>}
                  <button className="text-link" onClick={() => EDIT(r)}>
                    Open record
                    <ArrowRight size={15} />
                  </button>
                </footer>
              </article>
            ))}
          </div>
          {!records.length && (
            <div className="staff-record-empty">
              <MessageSquare size={34} />
              <h3>Start a meaningful conversation.</h3>
              <p>
                Record your first assessor 1:1 to build a lasting development
                history.
              </p>
            </div>
          )}
        </section>
      </div>
      {editing && (
        <OneToOneDialog
          record={editing}
          assessors={assessors}
          command={command}
          notify={notify}
          onClose={() => EDIT(null)}
        />
      )}
    </>
  );
}
