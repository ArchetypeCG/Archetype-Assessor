import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  X,
  Check,
} from "lucide-react";
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function SamplingPlanner({ s, user, setModal, act }) {
  const [month, M] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [risk, R] = useState("All"),
    [status, S] = useState("All");
  if (!["Manager", "IQA"].includes(user.role)) return null;
  const plans = (s.samplingPlans || []).filter(
    (p) =>
      (risk === "All" || p.risk === risk) &&
      (status === "All" || p.status === status),
  );
  const first = new Date(month),
    offset = (first.getDay() + 6) % 7;
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i),
  );
  const learner = (id) =>
    s.learners.find((l) => l.id === id)?.name || "Archived learner";
  return (
    <section className="panel sampling-planner">
      <div className="panel-header">
        <div>
          <span className="eyebrow">QUALITY • PLANNING & COVERAGE</span>
          <h2>Plan every sample with purpose.</h2>
          <p>
            Preselect KSBs, match accepted evidence and schedule interim,
            summative or risk-based sampling.
          </p>
        </div>
        <button
          className="button"
          onClick={() => setModal({ type: "samplingPlan" })}
        >
          <Plus size={16} />
          Plan a sample
        </button>
      </div>
      <div className="sampling-stats">
        {["Planned", "Completed", "Cancelled"].map((status) => (
          <div key={status}>
            <strong>
              {
                (s.samplingPlans || []).filter((p) => p.status === status)
                  .length
              }
            </strong>
            <span>{status}</span>
          </div>
        ))}
      </div>
      <div className="sampling-toolbar">
        <div className="button-row">
          <button
            className="button secondary"
            aria-label="Previous sampling month"
            onClick={() =>
              M(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <h3>
            {month.toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <button
            className="button secondary"
            aria-label="Next sampling month"
            onClick={() =>
              M(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <label>
          Risk
          <select value={risk} onChange={(e) => R(e.target.value)}>
            {["All", "Low", "Medium", "High"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => S(e.target.value)}>
            {["All", "Planned", "Completed", "Cancelled"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="sampling-calendar-scroll">
        <div className="sampling-calendar" aria-label="Sampling plan calendar">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
            <b className="sampling-weekday" key={x}>
              {x}
            </b>
          ))}
          {days.map((d) => (
            <div
              key={dateKey(d)}
              className={
                "sampling-day " +
                (d.getMonth() !== month.getMonth() ? "outside" : "")
              }
            >
              <button
                className="sampling-day-number"
                aria-label={"Plan sample on " + dateKey(d)}
                onClick={() =>
                  setModal({ type: "samplingPlan", date: dateKey(d) })
                }
              >
                {d.getDate()}
              </button>
              {plans
                .filter((p) => p.date === dateKey(d))
                .map((p) => (
                  <button
                    key={p.id}
                    className={"sampling-event risk-" + p.risk.toLowerCase()}
                    onClick={() => setModal({ type: "samplingPlan", item: p })}
                  >
                    <strong>{p.title}</strong>
                    <span>{learner(p.learnerId)}</span>
                    <small>
                      {p.criteria.length} KSBs · {p.status}
                    </small>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className="sampling-agenda">
        <h3>
          <CalendarDays size={18} /> Sampling agenda
        </h3>
        {plans
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((p) => (
            <article key={p.id}>
              <div>
                <span className={"tag " + (p.risk === "High" ? "red" : "")}>
                  {p.risk} risk
                </span>
                <strong>{p.title}</strong>
                <p>
                  {learner(p.learnerId)} · {p.date} · {p.method} · {p.status}
                </p>
                <small>{p.criteria.join(", ")}</small>
                {p.notes && <p>{p.notes}</p>}
                <p>
                  {s.quality.filter((q) => q.planId === p.id).length} findings
                  recorded
                </p>
              </div>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => setModal({ type: "samplingPlan", item: p })}
                >
                  View plan
                </button>
                {p.status === "Planned" && (
                  <>
                    <button
                      className="button"
                      onClick={() =>
                        setModal({ type: "samplingFinding", item: p })
                      }
                    >
                      Record finding
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        act("sampling.status", {
                          id: p.id,
                          learnerId: p.learnerId,
                          status: "Completed",
                        })
                      }
                    >
                      <Check size={15} />
                      Complete
                    </button>
                    <button
                      className="text-link"
                      onClick={() =>
                        act("sampling.status", {
                          id: p.id,
                          learnerId: p.learnerId,
                          status: "Cancelled",
                        })
                      }
                    >
                      Cancel plan
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        {!plans.length && (
          <p className="body-copy">
            No samples planned. Choose a calendar date to begin.
          </p>
        )}
      </div>
    </section>
  );
}
export function SamplingDialog({ s, modal, command, setModal, busy }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("button,input,select,textarea")?.focus();
    const handle = (e) => {
      if (e.key === "Escape" && !busy) setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...dialog.current.querySelectorAll("button,input,select,textarea"),
        ].filter((n) => !n.disabled && n.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [busy]);
  const item = modal.item,
    finding = modal.type === "samplingFinding";
  const [learnerId, L] = useState(item?.learnerId || ""),
    [criteria, C] = useState(item?.criteria || []),
    [evidenceIds, E] = useState(item?.evidenceIds || []),
    [error, ERR] = useState("");
  const learner = s.learners.find((l) => l.id === learnerId),
    standard = s.standards.find(
      (st) => st.id === (item?.standardId || learner?.standardId),
    );
  const eligible = s.evidence.filter(
    (e) =>
      e.learnerId === learnerId &&
      e.status === "Accepted" &&
      (!e.standardId || e.standardId === standard?.id) &&
      e.criteria.some((c) => criteria.includes(c)) &&
      (!finding || !item.evidenceIds.length || item.evidenceIds.includes(e.id)),
  );
  const readonly = !finding && item && item.status !== "Planned";
  const toggle = (code) => {
    const next = criteria.includes(code)
      ? criteria.filter((c) => c !== code)
      : [...criteria, code];
    C(next);
    E(
      evidenceIds.filter((id) =>
        s.evidence
          .find((e) => e.id === id)
          ?.criteria.some((c) => next.includes(c)),
      ),
    );
  };
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) setModal(null);
      }}
    >
      <section
        ref={dialog}
        className="modal sampling-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sampling-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">INTERNAL QUALITY ASSURANCE</span>
            <h2 id="sampling-heading">
              {finding
                ? "Record a sampling finding"
                : item
                  ? "Sampling plan"
                  : "Plan a sample"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close sampling plan"
            disabled={busy}
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            ERR("");
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await command(
                finding ? "quality.add" : "sampling.save",
                finding
                  ? { ...f, planId: item.id, learnerId: item.learnerId }
                  : { ...f, id: item?.id, learnerId, criteria, evidenceIds },
              );
              setModal(null);
            } catch (e) {
              ERR(e.message);
            }
          }}
        >
          <fieldset disabled={readonly || busy}>
            <div className="form-grid">
              {!finding && (
                <>
                  <label className="wide">
                    Apprentice
                    <select
                      aria-label="Apprentice"
                      required
                      value={learnerId}
                      disabled={!!item}
                      onChange={(e) => {
                        L(e.target.value);
                        C([]);
                        E([]);
                      }}
                    >
                      <option value="">Select apprentice</option>
                      {s.learners.map((l) => (
                        <option value={l.id} key={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Plan title
                    <input
                      name="title"
                      defaultValue={item?.title}
                      required
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Sampling date
                    <input
                      type="date"
                      name="date"
                      defaultValue={item?.date || modal.date}
                      required
                    />
                  </label>
                  <label>
                    Method
                    <select name="method" defaultValue={item?.method}>
                      {["Interim", "Summative", "Risk-based", "Follow-up"].map(
                        (x) => (
                          <option key={x}>{x}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Risk level
                    <select
                      aria-label="Risk level"
                      name="risk"
                      defaultValue={item?.risk || "Medium"}
                    >
                      {["Low", "Medium", "High"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <div className="wide">
                    <h3>Preselect KSB criteria</h3>
                    <p>
                      {standard?.name ||
                        "Choose an apprentice to see their standard."}
                    </p>
                    <div className="sampling-criteria">
                      {standard?.criteria.map((c) => (
                        <label key={c.code}>
                          <input
                            type="checkbox"
                            checked={criteria.includes(c.code)}
                            onChange={() => toggle(c.code)}
                          />
                          <span>
                            <b>{c.code}</b> {c.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="wide">
                    <h3>Preselect evidence (optional)</h3>
                    <p>
                      Leave empty to sample any accepted evidence matching the
                      selected criteria.
                    </p>
                    {eligible.map((e) => (
                      <label className="sampling-checkbox" key={e.id}>
                        <input
                          type="checkbox"
                          checked={evidenceIds.includes(e.id)}
                          onChange={() =>
                            E(
                              evidenceIds.includes(e.id)
                                ? evidenceIds.filter((x) => x !== e.id)
                                : [...evidenceIds, e.id],
                            )
                          }
                        />
                        {e.title} · {e.criteria.join(", ")}
                      </label>
                    ))}
                  </div>
                  <label className="wide">
                    Sampling rationale / instructions
                    <textarea
                      name="notes"
                      defaultValue={item?.notes}
                      rows={3}
                    />
                  </label>
                </>
              )}
              {finding && (
                <>
                  <p className="wide">
                    {item.title} · Planned criteria: {criteria.join(", ")}
                  </p>
                  <label className="wide">
                    Accepted evidence
                    <select
                      aria-label="Accepted evidence"
                      name="evidenceId"
                      required
                    >
                      <option value="">Select evidence</option>
                      {eligible.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} ·{" "}
                          {e.criteria
                            .filter((c) => criteria.includes(c))
                            .join(", ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Outcome
                    <select name="outcome">
                      <option>Agreed</option>
                      <option>Action required</option>
                    </select>
                  </label>
                  <label className="wide">
                    Findings and required actions
                    <textarea name="notes" required rows={5} />
                  </label>
                </>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!readonly && (
              <button className="button" disabled={busy}>
                {busy
                  ? "Saving…"
                  : finding
                    ? "Save finding"
                    : "Save sampling plan"}
              </button>
            )}
          </fieldset>
        </form>
      </section>
    </div>
  );
}
