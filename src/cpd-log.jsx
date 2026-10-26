import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Plus,
  Clock,
  CalendarDays,
  Download,
  FileText,
  X,
  Trash2,
} from "lucide-react";
import { sessionLink } from "./session";
import { fmt, localDate, filePayload } from "./lib";
const types = [
  "Training",
  "Workshop",
  "Webinar",
  "Reading and research",
  "Professional discussion",
  "Industry practice",
  "Qualification",
  "Other",
];
function CPDDialog({ record, user, assessors, command, notify, onClose }) {
  const dialog = useRef(null),
    [pending, P] = useState(false),
    [error, E] = useState(""),
    [status, STATUS] = useState(record.status || "Completed"),
    [confirm, CONFIRM] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  async function save(event) {
    event.preventDefault();
    E("");
    P(true);
    try {
      const form = new FormData(event.currentTarget),
        payload = {
          ...Object.fromEntries(form),
          ...(record.id ? { id: record.id } : {}),
          files: await filePayload(
            form.getAll("files").filter((file) => file.size),
          ),
        };
      await command("cpd.save", payload);
      notify("CPD entry saved");
      onClose();
    } catch (error) {
      E(error.message);
    } finally {
      P(false);
    }
  }
  async function remove() {
    E("");
    P(true);
    try {
      await command("cpd.delete", { id: record.id });
      notify("CPD entry deleted");
      onClose();
    } catch (error) {
      E(error.message);
    } finally {
      P(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="staff-record-dialog"
      aria-labelledby="cpd-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="photo-dialog-heading">
        <div>
          <span className="eyebrow">PROFESSIONAL LEARNING</span>
          <h2 id="cpd-title">
            {record.id ? "Edit CPD entry" : "Add CPD activity"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close CPD editor"
          disabled={pending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form className="form-grid" onSubmit={save}>
        {user.role === "Manager" && (
          <label className="wide">
            Assessor
            <select
              aria-label="CPD assessor"
              name="assessorId"
              defaultValue={record.assessorId || ""}
              disabled={!!record.id}
              required
            >
              <option value="">Choose assessor</option>
              {assessors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {record.id && (
              <input
                type="hidden"
                name="assessorId"
                value={record.assessorId}
              />
            )}
          </label>
        )}
        <label className="wide">
          Activity title
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={record.title || ""}
          />
        </label>
        <label>
          Activity date
          <input
            name="date"
            type="date"
            required
            defaultValue={record.date || localDate()}
          />
        </label>
        <label>
          Activity type
          <select
            aria-label="CPD activity type"
            name="type"
            defaultValue={record.type || "Training"}
          >
            {types.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Learning hours
          <input
            name="hours"
            type="number"
            required
            min="0"
            max="1000"
            step="0.25"
            defaultValue={record.hours ?? 1}
          />
        </label>
        <label>
          Status
          <select
            aria-label="CPD status"
            name="status"
            value={status}
            onChange={(e) => STATUS(e.target.value)}
          >
            <option>Completed</option>
            <option>Planned</option>
            <option>Draft</option>
          </select>
        </label>
        <label className="wide">
          Activity details
          <textarea
            name="description"
            rows={4}
            required
            maxLength={20000}
            defaultValue={record.description || ""}
          />
        </label>
        <label className="wide">
          What did you learn?
          <textarea
            name="reflection"
            rows={4}
            required={status === "Completed"}
            maxLength={20000}
            defaultValue={record.reflection || ""}
          />
        </label>
        <label className="wide">
          Impact on your practice
          <textarea
            name="impact"
            rows={3}
            maxLength={20000}
            defaultValue={record.impact || ""}
          />
        </label>
        <label className="wide">
          Next steps
          <textarea
            name="nextSteps"
            rows={3}
            maxLength={20000}
            defaultValue={record.nextSteps || ""}
          />
        </label>
        <label className="wide document-dropzone">
          Certificates and supporting evidence
          <input type="file" name="files" multiple />
          <span>
            Up to 5 new files, maximum 5 MB each. CPD files are private to you
            and the master admin.
          </span>
        </label>
        {record.files?.length > 0 && (
          <div className="wide attachment-list">
            {record.files.map((file) => (
              <a
                className="attachment"
                key={file.id}
                href={sessionLink("/api/cpd-files/" + file.id)}
              >
                <FileText size={17} />
                {file.name}
                <Download size={15} />
              </a>
            ))}
          </div>
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
            {pending ? "Saving…" : "Save CPD entry"}
          </button>
          {record.id && (
            <button
              type="button"
              className="text-link story-delete-button"
              disabled={pending}
              onClick={() => CONFIRM(true)}
            >
              <Trash2 size={14} />
              Delete entry
            </button>
          )}
        </div>
        {confirm && (
          <div className="story-delete-confirm wide">
            <strong>Delete this CPD entry?</strong>
            <p>The entry will be removed from the CPD log.</p>
            <div className="button-row">
              <button
                type="button"
                className="button story-delete-button"
                disabled={pending}
                onClick={remove}
              >
                Confirm delete CPD entry
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => CONFIRM(false)}
              >
                Keep entry
              </button>
            </div>
          </div>
        )}
      </form>
    </dialog>,
    document.body,
  );
}
export function CPDLog({ s, user, command, notify, busy }) {
  const [year, YEAR] = useState(localDate().slice(0, 4)),
    [selected, SELECT] = useState(""),
    [query, Q] = useState(""),
    [editing, EDIT] = useState(null),
    manager = user.role === "Manager";
  const assessors = s.users.filter((a) => a.role === "Assessor"),
    all = s.cpdRecords || [],
    years = [
      ...new Set([
        localDate().slice(0, 4),
        ...all.map((record) => record.date.slice(0, 4)),
      ]),
    ]
      .sort()
      .reverse();
  const scoped = all.filter(
      (record) =>
        (!selected || record.assessorId === selected) &&
        (!year || record.date.startsWith(year)),
    ),
    records = scoped
      .filter((record) =>
        `${record.title} ${record.description} ${record.reflection}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  const hours =
    Math.round(
      scoped
        .filter((record) => record.status === "Completed")
        .reduce((total, record) => total + record.hours, 0) * 100,
    ) / 100;
  const last = scoped
    .filter((record) => record.status === "Completed")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return (
    <>
      <div className="staff-feature-intro">
        <span className="eyebrow">KEEP LEARNING. KEEP GROWING.</span>
        <h2>
          {manager
            ? "Assessor professional development."
            : "Your development, kept together."}
        </h2>
        <p>
          Record CPD, reflect on what you learned and keep certificates and
          evidence in one place. Planned activities count towards your hours
          once completed.
        </p>
        <button
          className="button"
          disabled={busy || (manager && !assessors.some((a) => a.active))}
          onClick={() => EDIT({ assessorId: selected })}
        >
          <Plus size={17} />
          Add CPD activity
        </button>
      </div>
      <div className="staff-summary-grid">
        <article>
          <Clock size={23} />
          <strong>{hours}h</strong>
          <span>Completed CPD hours</span>
        </article>
        <article>
          <BookOpen size={23} />
          <strong>
            {scoped.filter((record) => record.status === "Completed").length}
          </strong>
          <span>Completed activities</span>
        </article>
        <article>
          <CalendarDays size={23} />
          <strong className="cpd-last-date">
            {last ? fmt(last.date) : "—"}
          </strong>
          <span>Last completed activity</span>
        </article>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>CPD log</h2>
            <p>
              {manager
                ? "Assessor development records"
                : "Your professional learning history"}
            </p>
          </div>
          <div className="cpd-filters">
            <label>
              Year
              <select
                aria-label="CPD year"
                value={year}
                onChange={(e) => YEAR(e.target.value)}
              >
                <option value="">All years</option>
                {years.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {manager && (
              <label>
                Assessor
                <select
                  aria-label="Filter CPD assessor"
                  value={selected}
                  onChange={(e) => SELECT(e.target.value)}
                >
                  <option value="">All assessors</option>
                  {assessors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              aria-label="Search CPD"
              placeholder="Search CPD…"
              value={query}
              onChange={(e) => Q(e.target.value)}
            />
          </div>
        </div>
        <div className="one-to-one-timeline">
          {records.map((record) => (
            <article className="one-to-one-card" key={record.id}>
              <div>
                <span
                  className={"one-to-one-state " + record.status.toLowerCase()}
                >
                  {record.status}
                </span>
                <small>
                  {fmt(record.date)} · {record.type} · {record.hours}h
                </small>
              </div>
              <h3>{record.title}</h3>
              {manager && (
                <strong>
                  {assessors.find((a) => a.id === record.assessorId)?.name ||
                    "Previous assessor"}
                </strong>
              )}
              <p>{record.description}</p>
              {record.reflection && (
                <p className="one-to-one-actions">
                  <b>Learning reflection</b>
                  {record.reflection}
                </p>
              )}
              {record.files?.length > 0 && (
                <small>
                  {record.files.length} supporting file
                  {record.files.length === 1 ? "" : "s"}
                </small>
              )}
              <footer>
                <button className="text-link" onClick={() => EDIT(record)}>
                  View or edit CPD
                </button>
              </footer>
            </article>
          ))}
        </div>
        {!records.length && (
          <div className="staff-record-empty">
            <BookOpen size={34} />
            <h3>Make space for your next step.</h3>
            <p>
              Add training, workshops, reading, professional discussions or
              industry practice to build your CPD record.
            </p>
          </div>
        )}
      </section>
      {editing && (
        <CPDDialog
          record={editing}
          user={user}
          assessors={assessors}
          command={command}
          notify={notify}
          onClose={() => EDIT(null)}
        />
      )}
    </>
  );
}
