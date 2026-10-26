import { expectedOtjHours } from "../server/otj-target.mjs";
import { OTJProgress, LearningTemplates } from "./learner-enhancements";
import { sessionLink } from "./session";
import React, { useState, useEffect, useRef } from "react";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  FileText,
  X,
  Check,
  ExternalLink,
  Download,
  Users,
  Target,
  Video,
  Pencil,
} from "lucide-react";
import { fmt, localDate } from "./lib";
const staff = (u) => ["Manager", "Assessor"].includes(u.role);
const types = [
  "Teaching session",
  "Progress review",
  "Tripartite review",
  "Workplace observation",
  "Gateway meeting",
  "Employer meeting",
  "EPA preparation",
  "Other",
];
const reviewTypes = ["Progress review", "Tripartite review", "Gateway meeting"];
function Button({ children, secondary = false, ...p }) {
  return (
    <button className={"button" + (secondary ? " secondary" : "")} {...p}>
      {children}
    </button>
  );
}
function Panel({ title, subtitle, action, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Tag({ children }) {
  return (
    <span
      className={
        "tag " +
        ({
          Completed: "green",
          Cancelled: "red",
          "In progress": "blue",
          Planned: "blue",
        }[children] || "neutral")
      }
    >
      {children}
    </span>
  );
}
function Empty({ children }) {
  return (
    <div className="empty">
      <BookOpen size={26} />
      <p>{children}</p>
    </div>
  );
}
function SessionCard({ a, s, setModal }) {
  return (
    <button
      className={
        "session-card " + (a.status === "Cancelled" ? "cancelled" : "")
      }
      onClick={() =>
        setModal({
          type: "sessionDetail",
          item: a,
          learner: s.learners.find((l) => l.id === a.learnerId),
        })
      }
    >
      <span className="session-date">
        <CalendarDays size={21} />
        <b>{fmt(a.date)}</b>
        <small>
          {a.allDay ? "Time to be confirmed" : a.time}
          {a.endTime ? " – " + a.endTime : ""}
        </small>
      </span>
      <div>
        <span className="eyebrow">
          {a.type || "Teaching session"} · {a.delivery || "In person"}
        </span>
        <h3>{a.title}</h3>
        <p>
          {s.learners.find((l) => l.id === a.learnerId)?.name} ·{" "}
          {a.location || "Location to be confirmed"}
        </p>
        <p>
          Expected OTJ by this session:{" "}
          {expectedOtjHours(
            s.learners.find((l) => l.id === a.learnerId) || {},
            a.date,
          ) == null
            ? "Target not set"
            : `${expectedOtjHours(s.learners.find((l) => l.id === a.learnerId) || {}, a.date)}h`}
        </p>
        {a.objectives && <p className="session-preview">{a.objectives}</p>}
        <div className="session-codes">
          {(a.criteria || []).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <span className="session-card-end">
        <Tag>{a.status || "Planned"}</Tag>
        <ArrowUpRight size={17} />
      </span>
    </button>
  );
}
export function SchedulingWorkspace({ s, user, setModal, openLearner }) {
  const [month, M] = useState(localDate().slice(0, 7)),
    [selected, S] = useState(""),
    [query, Q] = useState(""),
    [learnerId, L] = useState(""),
    [type, T] = useState("");
  const first = new Date(month + "-01T12:00:00"),
    days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  const sessions = s.appointments.filter(
    (a) =>
      (!learnerId || a.learnerId === learnerId) &&
      (!type || a.type === type) &&
      `${a.title} ${a.notes} ${a.objectives} ${s.learners.find((l) => l.id === a.learnerId)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const due = s.learners
    .filter(
      (l) =>
        l.nextReview &&
        (!learnerId || l.id === learnerId) &&
        !sessions.some(
          (a) =>
            a.learnerId === l.id &&
            a.date === l.nextReview &&
            reviewTypes.includes(a.type) &&
            a.status !== "Cancelled",
        ),
    )
    .map((l) => ({
      id: "due-" + l.id,
      learnerId: l.id,
      title: "Progress review due",
      date: l.nextReview,
      source: "deadline",
    }));
  const events = [...sessions, ...(!type ? due : [])],
    shown = events
      .filter((a) =>
        selected ? a.date === selected : a.date.startsWith(month),
      )
      .sort((a, b) =>
        (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")),
      );
  function move(n) {
    const d = new Date(first);
    d.setMonth(d.getMonth() + n);
    M(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    S("");
  }
  return (
    <>
      <Panel
        title="Calendar & scheduled learning"
        subtitle="Detailed sessions, review appointments and due dates · all times Europe/London"
        action={
          <div className="button-row">
            <a
              className="button secondary"
              href={sessionLink("/api/calendar.ics")}
            >
              <Download size={15} />
              Export calendar
            </a>
            {staff(user) && (
              <>
                <Button
                  secondary
                  onClick={() =>
                    setModal({
                      type: "session",
                      prefill: {
                        type: "Progress review",
                        date: selected || localDate(),
                      },
                    })
                  }
                >
                  <CalendarDays size={15} />
                  Schedule review
                </Button>
                <Button
                  onClick={() =>
                    setModal({
                      type: "session",
                      prefill: { date: selected || localDate() },
                    })
                  }
                >
                  <Plus size={15} />
                  Schedule session
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="filterbar">
          <div className="searchbox">
            <input
              aria-label="Search sessions"
              placeholder="Search sessions, objectives or apprentices…"
              value={query}
              onChange={(e) => Q(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter calendar apprentice"
            value={learnerId}
            onChange={(e) => L(e.target.value)}
          >
            <option value="">All my apprentices</option>
            {s.learners.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Session type filter"
            value={type}
            onChange={(e) => T(e.target.value)}
          >
            <option value="">All session types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="calendar-controls">
          <Button secondary onClick={() => move(-1)}>
            <ChevronLeft size={15} />
            Previous
          </Button>
          <h3>
            {first.toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <Button secondary onClick={() => move(1)}>
            Next
            <ChevronRight size={15} />
          </Button>
        </div>
        <div className="calendar-grid labels">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
            <div key={x}>{x}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: offset }, (_, i) => (
            <div className="calendar-blank" key={"b" + i} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = month + "-" + String(i + 1).padStart(2, "0");
            return (
              <button
                className={
                  "calendar-day " +
                  (d === localDate() ? "today " : "") +
                  (d === selected ? "selected" : "")
                }
                key={d}
                aria-label={fmt(d)}
                onClick={() => S(selected === d ? "" : d)}
              >
                <strong>{i + 1}</strong>
                {events
                  .filter((a) => a.date === d)
                  .slice(0, 3)
                  .map((a) => (
                    <span
                      key={a.id}
                      className={
                        "calendar-event " +
                        (a.source === "deadline" || reviewTypes.includes(a.type)
                          ? "review"
                          : "") +
                        (a.status === "Cancelled" ? " cancelled" : "")
                      }
                    >
                      {a.allDay ? "TBC" : a.time} {a.title}
                    </span>
                  ))}
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel
        title={
          selected
            ? "Schedule · " + fmt(selected)
            : "This month’s sessions & reviews"
        }
        subtitle="Open a session to see the agenda, preparation, learning outcomes, participants and resources."
      >
        {shown.map((a) =>
          a.source === "deadline" ? (
            <div className="review-deadline" key={a.id}>
              <CalendarDays size={21} />
              <div>
                <h3>
                  Progress review due ·{" "}
                  {s.learners.find((l) => l.id === a.learnerId)?.name}
                </h3>
                <p>{fmt(a.date)} · A deadline, not a booked appointment.</p>
              </div>
              {staff(user) ? (
                <Button
                  secondary
                  onClick={() =>
                    setModal({
                      type: "session",
                      learner: s.learners.find((l) => l.id === a.learnerId),
                      prefill: {
                        type: "Progress review",
                        date: a.date,
                        title: "Progress review",
                      },
                    })
                  }
                >
                  Book review
                </Button>
              ) : (
                <button
                  className="text-link"
                  onClick={() => openLearner(a.learnerId, "Reviews")}
                >
                  View reviews
                  <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          ) : (
            <SessionCard key={a.id} a={a} s={s} setModal={setModal} />
          ),
        )}
        {!shown.length && (
          <Empty>
            No sessions or reviews in this period. Use Schedule session to add
            detailed learning.
          </Empty>
        )}
      </Panel>
    </>
  );
}
export function LearningPlan({
  command,
  notify,
  s,
  user,
  learnerId,
  setLearnerId,
  setModal,
  learner,
}) {
  const l =
      learner || s.learners.find((x) => x.id === learnerId) || s.learners[0],
    [filter, F] = useState("Current"),
    [query, Q] = useState("");
  if (!l)
    return (
      <Empty>
        Add an apprentice and assign a standard before creating a learning plan.
      </Empty>
    );
  const standard = s.standards.find((st) => st.id === l.standardId),
    all = s.learningPlans || [],
    items = all.filter(
      (p) =>
        p.learnerId === l.id &&
        (filter === "Earlier programmes"
          ? p.standardId !== l.standardId
          : p.standardId === l.standardId) &&
        (filter === "All current" ||
        filter === "Earlier programmes" ||
        filter === "Current"
          ? true
          : p.status === filter) &&
        `${p.title} ${p.description} ${p.objectives}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const current = all.filter(
      (p) => p.learnerId === l.id && p.standardId === l.standardId,
    ),
    sessions = s.appointments
      .filter(
        (a) =>
          a.learnerId === l.id &&
          (!a.standardId || a.standardId === l.standardId) &&
          a.status !== "Cancelled",
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return (
    <>
      {!learner && (
        <label className="learner-picker">
          Apprentice
          <select
            aria-label="Learning plan apprentice"
            value={l.id}
            onChange={(e) => setLearnerId(e.target.value)}
          >
            {s.learners.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="learning-plan-banner">
        <span className="programme-icon">
          <BookOpen size={25} />
        </span>
        <div>
          <span className="eyebrow">INDIVIDUAL LEARNING PLAN</span>
          <h2>
            {l.name} · {standard?.name}
          </h2>
          <p>
            {standard?.reference} · Level {l.level} · {l.progress}% verified KSB
            coverage
          </p>
        </div>
        {staff(user) && (
          <div className="button-row">
            <Button onClick={() => setModal({ type: "plan", learner: l })}>
              <Plus size={16} />
              Add learning activity
            </Button>
            <Button
              secondary
              onClick={() => setModal({ type: "session", learner: l })}
            >
              <CalendarDays size={16} />
              Schedule session
            </Button>
          </div>
        )}
      </section>
      <div className="metrics three">
        <div className="metric">
          <div>
            Planned learning activities
            <Target size={17} />
          </div>
          <strong>
            {current.filter((p) => p.status !== "Cancelled").length}
          </strong>
          <p>
            {current.filter((p) => p.status === "Completed").length} completed
            activities
          </p>
        </div>
        <div className="metric">
          <div>
            Planned learning time
            <Clock size={17} />
          </div>
          <strong>
            {current
              .filter((p) => p.status !== "Cancelled")
              .reduce((n, p) => n + p.plannedHours, 0)}
            h
          </strong>
          <p>Planned time does not automatically count as approved OTJ hours</p>
        </div>
        <div className="metric">
          <div>
            Scheduled sessions
            <CalendarDays size={17} />
          </div>
          <strong>
            {sessions.filter((a) => a.status === "Planned").length}
          </strong>
          <p>Open a session for full details and preparation</p>
        </div>
      </div>
      <OTJProgress learner={l} />
      <LearningTemplates s={s} user={user} learner={l} setModal={setModal} />
      <Panel
        title="Your learning activities"
        subtitle="Objectives, mapped KSBs, resources, target dates and learner reflections"
      >
        <div className="filterbar">
          <div className="searchbox">
            <input
              aria-label="Search learning plan"
              placeholder="Search activities or objectives…"
              value={query}
              onChange={(e) => Q(e.target.value)}
            />
          </div>
          <select
            aria-label="Learning activity status"
            value={filter}
            onChange={(e) => F(e.target.value)}
          >
            {[
              "Current",
              "Planned",
              "In progress",
              "Completed",
              "Cancelled",
              "Earlier programmes",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        {items.map((p) => (
          <article className="learning-activity" key={p.id}>
            <div className="learning-activity-heading">
              <div>
                <span className="eyebrow">
                  {fmt(p.startDate)} — {fmt(p.due)} · {p.plannedHours} PLANNED
                  HOURS
                </span>
                <h3>{p.title}</h3>
              </div>
              <Tag>{p.status}</Tag>
            </div>
            <p>Assessment method: {p.method || "Other"}</p>
            <p className="preserve-text">{p.description}</p>
            <h4>Learning objectives</h4>
            <p className="preserve-text">{p.objectives}</p>
            <div className="session-codes">
              {p.criteria.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <ResourceLinks ids={p.resources} s={s} />
            {p.reflection && (
              <div className="plan-reflection">
                <strong>Learner reflection</strong>
                <p className="preserve-text">{p.reflection}</p>
                <small>{fmt(p.reflectionDate)}</small>
              </div>
            )}
            {p.outcomeNotes && (
              <div className="plan-reflection">
                <strong>Completion / outcome notes</strong>
                <p>{p.outcomeNotes}</p>
              </div>
            )}
            <div className="button-row">
              {p.sessionId &&
                s.appointments.some((a) => a.id === p.sessionId) && (
                  <Button
                    secondary
                    onClick={() =>
                      setModal({
                        type: "sessionDetail",
                        item: s.appointments.find((a) => a.id === p.sessionId),
                        learner: l,
                      })
                    }
                  >
                    <CalendarDays size={15} />
                    View linked session
                  </Button>
                )}
              {p.standardId === l.standardId && (
                <>
                  {staff(user) && (
                    <>
                      <Button
                        secondary
                        onClick={() =>
                          setModal({ type: "plan", item: p, learner: l })
                        }
                      >
                        <Pencil size={15} />
                        Edit activity
                      </Button>
                      <Button
                        secondary
                        onClick={async () => {
                          try {
                            await command("plan.template.save", { id: p.id });
                            notify("Learning activity saved for reuse.");
                          } catch (error) {
                            notify(error.message);
                          }
                        }}
                      >
                        Save as reusable activity
                      </Button>
                      {!p.sessionId && (
                        <Button
                          secondary
                          onClick={() =>
                            setModal({
                              type: "session",
                              plan: p,
                              learner: l,
                              prefill: {
                                title: p.title,
                                description: p.description,
                                objectives: p.objectives,
                                criteria: p.criteria,
                                resources: p.resources,
                                date: p.startDate,
                              },
                            })
                          }
                        >
                          <CalendarDays size={15} />
                          Schedule session
                        </Button>
                      )}
                    </>
                  )}
                  {(staff(user) || user.role === "Apprentice") && (
                    <Button
                      secondary
                      onClick={() =>
                        setModal({ type: "planReflect", item: p, learner: l })
                      }
                    >
                      <FileText size={15} />
                      {p.reflection
                        ? "Update reflection"
                        : "Add learning reflection"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {!items.length && (
          <Empty>
            No learning activities in this view. Your assessor can add a
            detailed plan and link it to scheduled sessions.
          </Empty>
        )}
      </Panel>
      <Panel
        title="Scheduled teaching & review sessions"
        subtitle="Sessions are shared with the same apprentice and authorised staff accounts"
      >
        {sessions.map((a) => (
          <SessionCard key={a.id} a={a} s={s} setModal={setModal} />
        ))}
        {!sessions.length && (
          <Empty>No sessions have been scheduled for this learner.</Empty>
        )}
      </Panel>
    </>
  );
}
function ResourceLinks({ ids = [], s }) {
  return (
    <div className="session-resources">
      {ids.map((id) => {
        const r = s.resources.find((x) => x.id === id);
        return (
          r && (
            <div key={id}>
              <BookOpen size={16} />
              <strong>{r.title}</strong>
              {r.url && (
                <a href={r.url} target="_blank" rel="noreferrer">
                  Open resource
                  <ExternalLink size={13} />
                </a>
              )}
              {r.files.map((f) => (
                <a key={f.id} href={sessionLink("/api/files/" + f.id)}>
                  {f.name}
                  <Download size={13} />
                </a>
              ))}
            </div>
          )
        );
      })}
    </div>
  );
}
function F({
  label,
  name,
  type = "text",
  value,
  required = false,
  options,
  wide = false,
  ...p
}) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      {required ? " *" : ""}
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={value || ""}
          required={required}
          {...p}
        />
      ) : type === "select" ? (
        <select
          name={name}
          defaultValue={value ?? ""}
          required={required}
          {...p}
        >
          {options.map((o) =>
            typeof o === "string" ? (
              <option key={o}>{o}</option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value ?? ""}
          required={required}
          {...p}
        />
      )}
    </label>
  );
}
function Choices({ label, name, items, selected = [] }) {
  return (
    <fieldset className="session-choice-list wide">
      <legend>{label}</legend>
      {items.length ? (
        items.map((x) => (
          <label key={x.value}>
            <input
              type="checkbox"
              name={name}
              value={x.value}
              defaultChecked={selected.includes(x.value)}
            />
            <span>{x.label}</span>
          </label>
        ))
      ) : (
        <p>No items available for this learner.</p>
      )}
    </fieldset>
  );
}
export function ScheduleDialog({
  s,
  user,
  modal,
  setModal,
  learnerId,
  command,
  busy,
}) {
  const item = modal.item,
    prefill = item || modal.prefill || {},
    [error, E] = useState(""),
    [pending, P] = useState(false),
    [editing, EDIT] = useState(modal.type !== "sessionDetail"),
    [selected, L] = useState(
      modal.learner?.id ||
        item?.learnerId ||
        learnerId ||
        s.learners[0]?.id ||
        "",
    );
  const l = s.learners.find((x) => x.id === selected),
    standard = s.standards.find((x) => x.id === l?.standardId),
    ref = useRef(null),
    isPlan = modal.type === "plan",
    isReflection = modal.type === "planReflect";
  const archived = item?.standardId && item.standardId !== l?.standardId;
  useEffect(() => {
    const prior = document.activeElement,
      element = ref.current,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.querySelector("button,input,select,textarea")?.focus();
    const key = (e) => {
      if (e.key === "Escape" && !pending) setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...element.querySelectorAll("button,input,textarea,select,a[href]"),
        ].filter((n) => !n.disabled && n.offsetParent !== null);
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  async function save(e) {
    e.preventDefault();
    E("");
    P(true);
    try {
      const f = new FormData(e.currentTarget),
        payload = { ...Object.fromEntries(f), learnerId: selected };
      if (item) payload.id = item.id;
      if (isReflection) await command("plan.reflect", payload);
      else {
        payload.criteria = f.getAll("criteria");
        payload.resources = f.getAll("resources");
        if (isPlan) await command("plan.save", payload);
        else {
          payload.participants = f.getAll("participants");
          payload.updateReviewDue = f.get("updateReviewDue") === "on";
          if (modal.plan) payload.planId = modal.plan.id;
          await command("session.save", payload);
        }
      }
      setModal(null);
    } catch (e) {
      E(e.message);
    } finally {
      P(false);
    }
  }
  const title = isReflection
    ? "Reflect on your learning"
    : isPlan
      ? item
        ? "Edit learning activity"
        : "Plan a learning activity"
      : editing
        ? item
          ? "Edit scheduled session"
          : "Schedule a session or review"
        : "Session & review details";
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) setModal(null);
      }}
    >
      <section
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-title"
        ref={ref}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CONNECTED LEARNING & DELIVERY</span>
            <h2 id="schedule-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close session dialog"
            disabled={pending}
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        {!editing ? (
          <>
            {l && <OTJProgress learner={l} initialDate={item.date} />}
            <div className="session-detail-cover">
              <span className="eyebrow">
                {item.type || "Teaching session"} ·{" "}
                {item.delivery || "In person"}
              </span>
              <h3>{item.title}</h3>
              <p>
                {l?.name} · {fmt(item.date)} ·{" "}
                {item.allDay ? "Time to be confirmed" : item.time}
                {item.endTime ? " – " + item.endTime : ""} · Europe/London
              </p>
              <Tag>{item.status || "Planned"}</Tag>
            </div>
            <div className="session-detail-grid">
              <Section title="Session overview" text={item.description} />
              <Section title="Learning objectives" text={item.objectives} />
              <Section title="Agenda & detailed notes" text={item.notes} />
              <Section
                title="Preparation & what to bring"
                text={item.preparation}
              />
              <Section title="Location" text={item.location} />
              <Section
                title="Attendance"
                text={`${item.attendance || "Not recorded"}`}
              />
              <Section title="Outcomes / follow-up" text={item.outcomeNotes} />
              {item.staffNotes && (
                <Section title="Staff-only notes" text={item.staffNotes} />
              )}
            </div>
            {item.meetingUrl && (
              <a
                className="button secondary"
                href={item.meetingUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Video size={16} />
                Open online meeting
              </a>
            )}
            <div className="session-codes">
              {(item.criteria || []).map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Section
              title="Participants"
              text={(item.participants || [])
                .map(
                  (id) =>
                    s.users.find((u) => u.id === id)?.name ||
                    "Former participant",
                )
                .join(", ")}
            />
            <ResourceLinks ids={item.resources} s={s} />
            {item.status === "Cancelled" && (
              <Section
                title="Cancellation reason"
                text={item.cancellationReason}
              />
            )}
            <div className="modal-actions">
              <Button secondary onClick={() => setModal(null)}>
                Close
              </Button>
              {staff(user) && !archived && (
                <>
                  <Button secondary onClick={() => EDIT(true)}>
                    <Pencil size={15} />
                    Edit session
                  </Button>
                  {reviewTypes.includes(item.type) &&
                    item.status !== "Cancelled" &&
                    !item.reviewId && (
                      <Button
                        onClick={() =>
                          setModal({
                            type: "review",
                            learner: l,
                            appointment: item,
                          })
                        }
                      >
                        Record completed review
                      </Button>
                    )}
                </>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={save}>
            {item?.source === "ten-week-review" && (
              <p className="caption">
                This is one occurrence of the administrator’s 10-week review
                schedule. Confirm its time and location below. Editing this
                occurrence keeps the remaining dates unchanged.
              </p>
            )}
            <div className="form-grid">
              {!modal.learner && !item && (
                <label className="wide">
                  Apprentice *
                  <select
                    aria-label="Session apprentice"
                    value={selected}
                    onChange={(e) => L(e.target.value)}
                    required
                  >
                    <option value="">Select apprentice</option>
                    {s.learners.map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {isReflection ? (
                <>
                  <p className="body-copy wide">
                    {item.title} · {l?.name}
                  </p>
                  <F
                    label="Your learning reflection"
                    name="reflection"
                    type="textarea"
                    value={item.reflection}
                    required
                    rows={6}
                    wide
                  />
                </>
              ) : (
                <>
                  <F
                    label={
                      isPlan
                        ? "Learning activity title"
                        : "Session / review title"
                    }
                    name="title"
                    value={prefill.title}
                    required
                    wide
                  />
                  {isPlan ? (
                    <>
                      <F
                        label="Assessment method"
                        name="method"
                        type="select"
                        value={prefill.method || "Other"}
                        options={[
                          "Discussion",
                          "Observation",
                          "Review",
                          "Learner support",
                          "Assignment",
                          "Project",
                          "Workshop",
                          "Teaching",
                          "Other",
                        ]}
                      />

                      <F
                        label="Start date"
                        name="startDate"
                        type="date"
                        value={prefill.startDate || localDate()}
                        required
                      />
                      <F
                        label="Target completion date"
                        name="due"
                        type="date"
                        value={prefill.due}
                        required
                      />
                      <F
                        label="Planned learning hours"
                        name="plannedHours"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.25"
                        value={prefill.plannedHours ?? 1}
                        required
                      />
                      <F
                        label="Activity status"
                        name="status"
                        type="select"
                        value={prefill.status || "Planned"}
                        options={[
                          "Planned",
                          "In progress",
                          "Completed",
                          "Cancelled",
                        ]}
                      />
                    </>
                  ) : (
                    <>
                      <F
                        label="Session type"
                        name="type"
                        type="select"
                        value={prefill.type || "Teaching session"}
                        options={types}
                      />
                      <F
                        label="Delivery method"
                        name="delivery"
                        type="select"
                        value={
                          prefill.delivery === "To be confirmed"
                            ? "In person"
                            : prefill.delivery || "In person"
                        }
                        options={["In person", "Online", "Hybrid"]}
                      />
                      <F
                        label="Session date"
                        name="date"
                        type="date"
                        value={prefill.date || localDate()}
                        required
                      />
                      <F
                        label="Session status"
                        name="status"
                        type="select"
                        value={prefill.status || "Planned"}
                        options={["Planned", "Completed", "Cancelled"]}
                      />
                      <F
                        label="Start time (Europe/London)"
                        name="time"
                        type="time"
                        value={prefill.time || (prefill.allDay ? "" : "10:00")}
                        required
                      />
                      <F
                        label="End time (Europe/London)"
                        name="endTime"
                        type="time"
                        value={
                          prefill.endTime || (prefill.allDay ? "" : "11:00")
                        }
                        required
                      />
                      <F
                        label="Location / room"
                        name="location"
                        value={prefill.location}
                      />
                      <F
                        label="HTTPS meeting link"
                        name="meetingUrl"
                        type="url"
                        value={prefill.meetingUrl}
                        placeholder="https://…"
                      />
                    </>
                  )}
                  <F
                    label={
                      isPlan
                        ? "Detailed learning activity"
                        : "Session description"
                    }
                    name="description"
                    type="textarea"
                    value={prefill.description}
                    required={isPlan}
                    rows={3}
                    wide
                  />
                  <F
                    label="Learning objectives / expected outcomes"
                    name="objectives"
                    type="textarea"
                    value={prefill.objectives}
                    required={isPlan}
                    rows={3}
                    wide
                  />
                  {!isPlan && (
                    <>
                      <F
                        label="Detailed agenda / review discussion points"
                        name="notes"
                        type="textarea"
                        value={prefill.notes}
                        rows={5}
                        wide
                      />
                      <F
                        label="Preparation / pre-reading / what to bring"
                        name="preparation"
                        type="textarea"
                        value={prefill.preparation}
                        rows={3}
                        wide
                      />
                      <Choices
                        label="Session participants"
                        name="participants"
                        selected={prefill.participants || [user.id]}
                        items={s.users
                          .filter(
                            (u) =>
                              u.active !== false &&
                              (l?.participantIds || []).includes(u.id),
                          )
                          .map((u) => ({
                            value: u.id,
                            label: u.name + " · " + u.role,
                          }))}
                      />
                      <F
                        label="Attendance"
                        name="attendance"
                        type="select"
                        value={prefill.attendance || "Not recorded"}
                        options={[
                          "Not recorded",
                          "Attended",
                          "Did not attend",
                          "Rescheduled",
                        ]}
                      />
                      <F
                        label="Cancellation reason (if cancelled)"
                        name="cancellationReason"
                        value={prefill.cancellationReason}
                      />
                      <F
                        label="Staff-only notes"
                        name="staffNotes"
                        type="textarea"
                        value={prefill.staffNotes}
                        rows={3}
                        wide
                      />
                      <label className="checkbox-label wide">
                        <input
                          type="checkbox"
                          name="updateReviewDue"
                          defaultChecked
                        />
                        When this is a review, update the apprentice’s next
                        review due date.
                      </label>
                    </>
                  )}
                  <div className="wide" key={selected}>
                    <Choices
                      label="Map to standard criteria"
                      name="criteria"
                      selected={prefill.criteria || []}
                      items={(standard?.criteria || []).map((c) => ({
                        value: c.code,
                        label: c.code + " · " + c.text,
                      }))}
                    />
                    <Choices
                      label="Learning resources"
                      name="resources"
                      selected={prefill.resources || []}
                      items={s.resources
                        .filter(
                          (r) =>
                            !r.standardId || r.standardId === l?.standardId,
                        )
                        .map((r) => ({ value: r.id, label: r.title }))}
                    />
                  </div>
                  <F
                    label="Completion outcomes / follow-up notes"
                    name="outcomeNotes"
                    type="textarea"
                    value={prefill.outcomeNotes}
                    rows={3}
                    wide
                  />
                </>
              )}
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <Button
                secondary
                type="button"
                disabled={pending}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button disabled={pending || busy}>
                {pending
                  ? "Saving…"
                  : "Save " +
                    (isReflection
                      ? "reflection"
                      : isPlan
                        ? "learning activity"
                        : "session")}
                <Check size={16} />
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
function Section({ title, text }) {
  return text ? (
    <section className="session-info">
      <h4>{title}</h4>
      <p className="preserve-text">{text}</p>
    </section>
  ) : null;
}
