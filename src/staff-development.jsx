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
  Megaphone,
} from "lucide-react";
import { initials, localDate, fmt } from "./lib";
export function SuccessSpotlight({ story, preview = false }) {
  const [expanded, EXPAND] = useState(false);
  if (!story) return null;
  const text = story.story || "Your success story will appear here.";
  return (
    <section
      className={
        "success-spotlight" +
        (story.kind === "Update" ? " spotlight-update" : "")
      }
      aria-label={
        preview
          ? "Post preview"
          : story.kind === "Update"
            ? "Team update"
            : "Success story"
      }
    >
      <div className="spotlight-decoration" aria-hidden="true">
        <Sparkles size={104} />
      </div>
      <div className="spotlight-heading">
        <span>
          <Sparkles size={16} />{" "}
          {preview
            ? "DASHBOARD PREVIEW"
            : story.kind === "Update"
              ? "LATEST UPDATE"
              : "SUCCESS STORY"}
        </span>
        <span>{story.kind || "Learner success"}</span>
      </div>
      <div className="spotlight-content">
        <div className="spotlight-person">
          <div className="spotlight-monogram">
            {initials(
              story.personName ||
                (story.kind === "Update" ? "Archetype team" : "Success story"),
            )}
            {story.kind === "Update" ? (
              <Megaphone size={22} />
            ) : (
              <Trophy size={22} />
            )}
          </div>
          <strong>
            {story.personName ||
              (story.kind === "Update"
                ? "Archetype team"
                : "Celebrate someone’s achievement")}
          </strong>
          <small>
            {story.achievement ||
              (story.kind === "Update"
                ? "News and announcements"
                : "An achievement worth sharing")}
          </small>
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
export function SuccessAndUpdates({ stories = [] }) {
  const [selected, SELECT] = useState(null),
    [all, ALL] = useState(false);
  const posts = stories
    .filter((post) => post.published)
    .slice()
    .sort((a, b) =>
      (b.publishedAt || b.updated).localeCompare(a.publishedAt || a.updated),
    );
  const featured = posts.find((post) => post.id === selected) || posts[0];
  if (!featured) return null;
  const others = posts.filter((post) => post.id !== featured.id);
  return (
    <section className="success-updates-feed" aria-label="Success and updates">
      <div className="success-updates-heading">
        <div>
          <h2>Success and updates</h2>
          <p>Achievements to celebrate. News to keep you connected.</p>
        </div>
        <Sparkles size={23} />
      </div>
      <SuccessSpotlight key={featured.id + featured.updated} story={featured} />
      {others.length > 0 && (
        <div className="success-updates-list">
          {others.slice(0, all ? others.length : 3).map((post) => (
            <button type="button" key={post.id} onClick={() => SELECT(post.id)}>
              {post.kind === "Update" ? (
                <Megaphone size={20} />
              ) : (
                <Trophy size={20} />
              )}
              <span>
                <small>
                  {post.kind} · {fmt(post.publishedAt || post.updated)}
                </small>
                <strong>{post.title}</strong>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      )}
      {others.length > 3 && (
        <button type="button" className="text-link" onClick={() => ALL(!all)}>
          {all ? "Show fewer posts" : `View all ${posts.length} posts`}
        </button>
      )}
    </section>
  );
}
const emptyStory = {
  kind: "Learner success",
  audience: "Assessors and learners",
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
    [saving, SAVING] = useState(false),
    [deleteId, DELETE_ID] = useState(null);
  const savedStory = (s.successStories || []).find(
    (story) => story.id === draft.id,
  );
  async function manage(action) {
    if (!savedStory) return;
    E("");
    SAVING(true);
    const selectedId = savedStory.id;
    try {
      await command("spotlight." + action, { id: selectedId });
      DELETE_ID(null);
      if (action === "unpublish") {
        D({ ...draft, published: false });
        notify("Post unpublished from dashboards");
      } else {
        const remaining = (s.successStories || []).filter(
          (story) => story.id !== selectedId,
        );
        D(
          remaining.find((story) => story.published) ||
            remaining.at(-1) ||
            emptyStory,
        );
        notify("Post deleted");
      }
    } catch (error) {
      E(error.message);
    } finally {
      SAVING(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    E("");
    SAVING(true);
    try {
      const result = await command("spotlight.save", draft);
      D({ ...draft, id: result.storyId });
      notify(
        draft.published
          ? "Post published to the selected audience"
          : "Post saved as a draft",
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
        <span className="eyebrow">KEEP YOUR COMMUNITY CONNECTED</span>
        <h2>Success and updates.</h2>
        <p>
          Celebrate success or share an update. Choose assessors, learners, or
          both groups as the audience. Drafts stay private until you publish.
        </p>
      </div>
      <div className="spotlight-editor-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Success and updates</h2>
            <button
              className="button secondary"
              disabled={saving || busy}
              onClick={() => {
                DELETE_ID(null);
                D(emptyStory);
                E("");
              }}
            >
              <Plus size={15} />
              New post
            </button>
          </div>
          <label>
            Saved posts
            <select
              aria-label="Saved posts"
              disabled={saving || busy}
              value={draft.id || ""}
              onChange={(e) =>
                D(
                  (s.successStories || []).find(
                    (story) => story.id === e.target.value,
                  ) || emptyStory,
                )
              }
            >
              <option value="">New post</option>
              {(s.successStories || []).map((story) => (
                <option key={story.id} value={story.id}>
                  {story.published ? "Published · " : "Draft · "}
                  {story.title}
                </option>
              ))}
            </select>
          </label>
          {savedStory && (
            <div className="story-management">
              <span
                className={
                  savedStory.published
                    ? "story-live-badge"
                    : "story-draft-badge"
                }
              >
                {savedStory.published
                  ? `Published to ${savedStory.audience || "Assessors"}`
                  : "Saved draft"}
              </span>
              <div className="button-row">
                {savedStory.published && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={saving || busy}
                    onClick={() => manage("unpublish")}
                  >
                    Unpublish post
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary story-delete-button"
                  disabled={saving || busy}
                  onClick={() => DELETE_ID(savedStory.id)}
                >
                  Delete post
                </button>
              </div>
              {deleteId === savedStory.id && (
                <div
                  className="story-delete-confirm"
                  role="group"
                  aria-label="Confirm post deletion"
                >
                  <strong>Delete “{savedStory.title}”?</strong>
                  <p>
                    This removes the saved post from assessor and learner
                    dashboards.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button story-delete-button"
                      disabled={saving || busy}
                      onClick={() => manage("delete")}
                    >
                      Confirm delete post
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={saving || busy}
                      onClick={() => DELETE_ID(null)}
                    >
                      Keep post
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <form className="form-grid story-form" onSubmit={save}>
            <label>
              Post type
              <select
                value={draft.kind}
                onChange={(e) =>
                  D({
                    ...draft,
                    kind: e.target.value,
                    ...(e.target.value === "Update"
                      ? { personName: "", achievement: "", quote: "" }
                      : {}),
                  })
                }
              >
                <option>Learner success</option>
                <option>Assessor success</option>
                <option>Update</option>
              </select>
            </label>
            <label>
              Audience
              <select
                aria-label="Post audience"
                value={draft.audience || "Assessors"}
                onChange={(e) => D({ ...draft, audience: e.target.value })}
              >
                <option>Assessors and learners</option>
                <option>Assessors</option>
                <option>Learners</option>
              </select>
            </label>
            {draft.kind !== "Update" && (
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
            )}
            <label className="wide">
              Title
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(e) => D({ ...draft, title: e.target.value })}
              />
            </label>
            {draft.kind !== "Update" && (
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
            )}
            <label className="wide">
              Story or update
              <textarea
                required
                rows={7}
                maxLength={10000}
                value={draft.story}
                onChange={(e) => D({ ...draft, story: e.target.value })}
              />
            </label>
            {draft.kind !== "Update" && (
              <label className="wide">
                Featured quote
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={draft.quote}
                  onChange={(e) => D({ ...draft, quote: e.target.value })}
                />
              </label>
            )}
            <label className="checkbox-label wide">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => D({ ...draft, published: e.target.checked })}
              />
              Publish to selected audience
            </label>
            <p className="caption wide">
              Only the text entered in this post is published. Apprentice
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
                  ? "Publish post"
                  : "Save draft"}
              <Sparkles size={17} />
            </button>
          </form>
        </section>
        <div className="spotlight-preview">
          <p className="eyebrow">DASHBOARD PREVIEW</p>
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
function OneToOneDialog({
  record,
  assessors,
  learners,
  actions = [],
  command,
  onClose,
  notify,
}) {
  const dialog = useRef(null),
    [error, E] = useState(""),
    [pending, P] = useState(false),
    [status, STATUS] = useState(record.status || "Completed"),
    [assessorId, ASSESSOR] = useState(record.assessorId || ""),
    [linkedLearner, LINK] = useState(record.learnerId || ""),
    [actionItems, ACTIONS] = useState(
      actions.map((action) => ({ ...action, originalStatus: action.status })),
    );
  const caseload = (learners || []).filter(
    (learner) => learner.assessorId === assessorId,
  );
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
        actionItems: actionItems.map(
          ({ id, title, due, status, originalStatus }) => ({
            id,
            title,
            due,
            status,
            originalStatus,
          }),
        ),
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
        Completed and planned records are shared with this assessor. Drafts and
        confidential manager notes stay private.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Assessor
          <select
            name="assessorId"
            required
            value={assessorId}
            disabled={!!record.id}
            onChange={(event) => {
              ASSESSOR(event.target.value);
              LINK("");
            }}
          >
            <option value="">Choose assessor</option>
            {assessors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {!a.active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          {record.id && (
            <input type="hidden" name="assessorId" value={assessorId} />
          )}
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
        <label className="wide">
          Linked apprentice (optional)
          <select
            name="learnerId"
            aria-label="Linked apprentice"
            value={linkedLearner}
            disabled={!assessorId}
            onChange={(event) => LINK(event.target.value)}
          >
            <option value="">No apprentice linked</option>
            {caseload.map((learner) => (
              <option key={learner.id} value={learner.id}>
                {learner.name} · {learner.ref}
              </option>
            ))}
            {record.learnerId &&
              !caseload.some((learner) => learner.id === record.learnerId) && (
                <option value={record.learnerId}>
                  {record.learnerName || "Previously linked apprentice"}
                </option>
              )}
          </select>
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
        <section className="wide one-to-one-action-section">
          <div className="panel-header">
            <div>
              <h3>Actions for the assessor’s action plan</h3>
              <p>
                Add an action and due date. Shared records send these actions to
                the assessor; draft actions stay private.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={pending || actionItems.length >= 20}
              onClick={() =>
                ACTIONS([
                  ...actionItems,
                  { title: "", due: "", status: "Open" },
                ])
              }
            >
              <Plus size={15} />
              Add action
            </button>
          </div>
          {actionItems.map((action, index) => (
            <div
              className="one-to-one-action-editor form-grid"
              key={action.id || index}
            >
              <label className="wide">
                Action {index + 1}
                <input
                  aria-label={`1:1 action ${index + 1}`}
                  required
                  maxLength={500}
                  value={action.title}
                  onChange={(event) =>
                    ACTIONS(
                      actionItems.map((item, n) =>
                        n === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Due date
                <input
                  aria-label={`1:1 action ${index + 1} due date`}
                  type="date"
                  required
                  value={action.due}
                  onChange={(event) =>
                    ACTIONS(
                      actionItems.map((item, n) =>
                        n === index
                          ? { ...item, due: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Status
                <select
                  aria-label={`1:1 action ${index + 1} status`}
                  value={action.status}
                  onChange={(event) =>
                    ACTIONS(
                      actionItems.map((item, n) =>
                        n === index
                          ? { ...item, status: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="Open">In progress</option>
                  <option value="Complete">Complete</option>
                </select>
              </label>
              {!action.id && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    ACTIONS(actionItems.filter((_, n) => n !== index))
                  }
                >
                  Remove unsaved action
                </button>
              )}
            </div>
          ))}
        </section>
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
export function AssessorOneToOnes({
  s,
  user,
  command,
  notify,
  busy,
  go,
  openLearner,
}) {
  const manager = user.role === "Manager";
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
        <h2>
          {manager
            ? "Make every conversation count."
            : "Your development conversations."}
        </h2>
        <p>
          A private space for assessor supervision, meaningful development and
          clear follow-through.
        </p>
        {manager && (
          <button
            className="button"
            disabled={busy || !assessors.length}
            onClick={() => EDIT({ assessorId: selected })}
          >
            <Plus size={17} />
            Record a 1:1
          </button>
        )}
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
      <div
        className={
          manager ? "staff-record-layout" : "staff-record-layout own-records"
        }
      >
        {manager && (
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
        )}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Conversation history</h2>
              <p>
                {manager
                  ? "Shared with each assessor · confidential manager notes remain private"
                  : "Your shared 1:1 records · read-only"}
              </p>
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
                    {manager ? "Open record" : "View record"}
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
                {manager
                  ? "Record your first assessor 1:1 to build a lasting development history."
                  : "Your shared 1:1 records will appear here when your manager saves them."}
              </p>
            </div>
          )}
        </section>
      </div>
      {editing && !manager && (
        <OneToOneView
          record={editing}
          actions={(s.assessorActions || []).filter((action) =>
            editing.actionIds?.includes(action.id),
          )}
          onActions={() => {
            EDIT(null);
            go("Action plans");
          }}
          onApprentice={
            s.learners.some((learner) => learner.id === editing.learnerId)
              ? () => {
                  EDIT(null);
                  openLearner(editing.learnerId);
                }
              : null
          }
          onClose={() => EDIT(null)}
        />
      )}
      {editing && manager && (
        <OneToOneDialog
          record={editing}
          assessors={assessors}
          learners={s.learners}
          actions={(s.assessorActions || []).filter((action) =>
            editing.actionIds?.includes(action.id),
          )}
          command={command}
          notify={notify}
          onClose={() => EDIT(null)}
        />
      )}
    </>
  );
}

function OneToOneView({
  record,
  actions = [],
  onActions,
  onApprentice,
  onClose,
}) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="staff-record-dialog"
      aria-labelledby="shared-record-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="photo-dialog-heading">
        <div>
          <span className="eyebrow">YOUR SHARED 1:1</span>
          <h2 id="shared-record-title">{record.title}</h2>
          <p>
            {fmt(record.date)} · {record.status}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close shared 1:1"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="shared-one-to-one-details">
        {record.learnerId && (
          <section>
            <h3>Linked apprentice</h3>
            <p>{record.learnerName}</p>
            {onApprentice && (
              <button
                type="button"
                className="text-link"
                onClick={onApprentice}
              >
                Open apprentice
              </button>
            )}
          </section>
        )}
        {actions.length > 0 && (
          <section>
            <h3>Actions from this 1:1</h3>
            {actions.map((action) => (
              <div className="shared-one-to-one-action" key={action.id}>
                <strong>{action.title}</strong>
                <p>
                  Due {fmt(action.due)} ·{" "}
                  {action.status === "Open" ? "In progress" : "Complete"}
                </p>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={onActions}
            >
              Open my action plan
            </button>
          </section>
        )}

        {sections
          .filter(([key]) => key !== "confidentialNotes" && record[key])
          .map(([key, label]) => (
            <section key={key}>
              <h3>{label}</h3>
              <p className="preserve-text">{record[key]}</p>
            </section>
          ))}
        {record.nextDate && (
          <p>
            <strong>Next 1:1:</strong> {fmt(record.nextDate)}
          </p>
        )}
        {record.history?.length > 0 && (
          <details>
            <summary>Previous shared versions</summary>
            {record.history.map((version, index) => (
              <article className="one-to-one-history" key={index}>
                <strong>
                  {fmt(version.date)} · {version.title}
                </strong>
                {sections
                  .filter(
                    ([key]) => key !== "confidentialNotes" && version[key],
                  )
                  .map(([key, label]) => (
                    <p key={key}>
                      <b>{label}:</b> {version[key]}
                    </p>
                  ))}
              </article>
            ))}
          </details>
        )}
      </div>
      <button type="button" className="button secondary" onClick={onClose}>
        Close record
      </button>
    </dialog>,
    document.body,
  );
}
