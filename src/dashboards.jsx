import { assessorDay, assessmentQueue } from "./assessor-day.mjs";
import { adminWorkspace } from "./admin-workspace.mjs";
import { AssessorDay } from "./assessor-day.jsx";
import { EpaPerformance } from "./epa-performance";
import { SuccessAndUpdates } from "./staff-development";
import { LearnerAvatar } from "./learner-photo";
import React from "react";
import {
  Users,
  Layers,
  Clock,
  ShieldCheck,
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  Plus,
  FileText,
  BookOpen,
  Target,
  TriangleAlert,
  Check,
  ClipboardCheck,
  Building2,
  ListChecks,
  MessageSquare,
  GraduationCap,
  Download,
  Upload,
  ChartNoAxesCombined,
} from "lucide-react";
import { fmt, initials, localDate } from "./lib";
export const dashboardTitle = {
  Manager: "Master dashboard",
  Assessor: "Assessor dashboard",
  Apprentice: "My dashboard",
  IQA: "Quality dashboard",
  Employer: "Employer dashboard",
};
export function pageLabel(page, role) {
  if (page === "Off-the-job learning") return "Off-the-job log";
  if (page === "Command centre") return dashboardTitle[role] || page;
  const labels = {
    Apprentice: {
      Portfolios: "My portfolio",
      "Standards & KSBs": "My standard",
      "Off-the-job learning": "Off-the-job log",
      Resources: "Resource library",
      "Reviews Hub": "My reviews",
      "Action plans": "My action plan",
    },
    Assessor: {
      "Assessor 1:1s": "My 1:1s",
      Apprentices: "My caseload",
      Portfolios: "Assessment & portfolios",
      Resources: "Resource library",
    },
    Manager: {
      "Success stories": "Success and updates",
      Resources: "Resource library",
      "Team & caseloads": "Accounts & caseloads",
    },
  };
  return labels[role]?.[page] || page;
}
export function activeRecord(s, record) {
  const learner = s.learners.find((l) => l.id === record.learnerId);
  return (
    learner && (!record.standardId || record.standardId === learner.standardId)
  );
}
const average = (ls) =>
  ls.length
    ? Math.round(ls.reduce((n, l) => n + l.progress, 0) / ls.length)
    : 0;
function Status({ value }) {
  return (
    <span className={"status-dot " + value.toLowerCase().replaceAll(" ", "-")}>
      {value}
    </span>
  );
}
function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={"role-card " + className}>
      <div className="role-card-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Link({ children, onClick }) {
  return (
    <button className="dashboard-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
function Kpi({ label, value, detail, icon: Icon = Users, onClick }) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      className={"command-kpi" + (onClick ? " clickable-kpi" : "")}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <div>
        <Icon size={17} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Element>
  );
}
function Action({ icon: Icon, label, detail, onClick }) {
  return (
    <button className="dashboard-action" onClick={onClick}>
      <span>
        <Icon size={20} />
      </span>
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <ArrowUpRight size={16} />
    </button>
  );
}
function Nothing({ children }) {
  return (
    <div className="dashboard-empty">
      <Check size={22} />
      <p>{children}</p>
    </div>
  );
}
function Meter({ value }) {
  return (
    <div className="dash-meter">
      <i style={{ width: Math.min(100, Math.max(0, value)) + "%" }} />
    </div>
  );
}
function Person({ learner, onClick, detail, children }) {
  return (
    <div className="dash-person">
      <button onClick={onClick}>
        <LearnerAvatar learner={learner} />
        <span>
          <strong>{learner.name}</strong>
          <small>{detail || learner.employer}</small>
        </span>
      </button>
      {children}
    </div>
  );
}
function Hero({
  eyebrow,
  title,
  description,
  children,
  introduction,
  aside,
  badge = "Live workspace · autosave on",
  className = "",
}) {
  return (
    <section className={"command-hero " + className}>
      <div className="command-hero-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          <p>{description}</p>
          {introduction}
        </div>
        {aside ? (
          <div className="command-hero-aside">
            <span className="command-live">
              <i />
              {badge}
            </span>
            {aside}
          </div>
        ) : (
          <span className="command-live">
            <i />
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
export default function RoleDashboard(props) {
  switch (props.user.role) {
    case "Manager":
      return <Master {...props} />;
    case "Assessor":
      return <Assessor {...props} />;
    case "Apprentice":
      return <Apprentice {...props} />;
    case "IQA":
      return <IQA {...props} />;
    default:
      return <Employer {...props} />;
  }
}
function Master({ s, user, go, openLearner, setModal }) {
  const ls = s.learners,
    active = ls.filter((l) => l.status === "Active"),
    risks = ls.filter((l) => l.rag === "Red"),
    pending = assessmentQueue(s),
    overdue = ls.filter((l) => l.exceptions.some((e) => e.type === "review")),
    workspace = adminWorkspace(s);
  return (
    <div data-dashboard="manager">
      {!s.learners.length && (
        <section className="production-onboarding">
          <h2>Set up your live organisation</h2>
          <p>
            Create assessor and IQA accounts, add your verified standards, then
            enrol apprentices and create their linked login accounts. Your
            records and files are saved centrally and shared across authorised
            devices.
          </p>
          <div className="button-row">
            <button className="button" onClick={() => go("Team & caseloads")}>
              1 · Create team accounts
            </button>
            <button
              className="button secondary"
              onClick={() => go("Standards & KSBs")}
            >
              2 · Add official standards
            </button>
            <button
              className="button secondary"
              onClick={() => go("Apprentices")}
            >
              3 · Enrol apprentices
            </button>
            <button className="button secondary" onClick={() => go("Settings")}>
              Check backups & live storage
            </button>
          </div>
        </section>
      )}
      <Hero
        eyebrow="WORK-BASED LEARNING INTELLIGENCE"
        title="Delivery Command Centre"
        description="Live portfolio health, compliance, progress and intervention priorities across the apprenticeship provision."
      >
        <div className="command-kpis">
          <Kpi
            onClick={() => go("Apprentices")}
            label="Apprentices"
            value={ls.length}
            detail={`${active.length} active learners`}
            icon={Users}
          />
          <Kpi
            onClick={() => go("Apprentices", { sort: "progress" })}
            label="Verified progress"
            value={average(ls) + "%"}
            detail="Accepted KSB evidence"
            icon={Target}
          />
          <Kpi
            onClick={() => go("Apprentices", { rag: "Red" })}
            label="High-risk learners"
            value={risks.length}
            detail="Priority intervention"
            icon={TriangleAlert}
          />
          <Kpi
            onClick={() => go("Reviews Hub", { view: "overdue" })}
            label="Overdue reviews"
            value={overdue.length}
            detail="Conversations to arrange"
            icon={CalendarDays}
          />
          <Kpi
            onClick={() => go("Portfolios", { view: "assessment-queue" })}
            label="Assessment queue"
            value={pending.length}
            detail="Evidence awaiting a decision"
            icon={Layers}
          />
        </div>
        <EpaPerformance
          performance={s.epaPerformance}
          overall
          onResult={(result) => go("EPA results", { result })}
        />
      </Hero>
      <section className="admin-workspace" aria-label="Manage your provision">
        <div className="admin-section-intro">
          <div>
            <span className="eyebrow">YOUR OPERATIONAL WORKSPACE</span>
            <h2>Manage delivery.</h2>
            <p>
              Resolve the next issue, plan the week and keep delivery moving.
            </p>
          </div>
          <button onClick={() => go("Report Studio")}>
            <FileText size={15} /> Create a report <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="admin-work-grid">
          <div className="admin-work-column">
            <Card
              className="admin-issue-card"
              title="Priority queue"
              subtitle="The most urgent learner issues, with a direct route to the next step"
              action={<Link onClick={() => go("Alerts")}>All alerts</Link>}
            >
              <div className="admin-issue-list">
                {workspace.issues.slice(0, 5).map(({ learner, exception }) => {
                  const tab =
                    {
                      review: "Reviews",
                      compliance: "Compliance",
                      progress: "Learning plan",
                      skills: "Gateway",
                    }[exception.type] || "Overview";
                  return (
                    <button
                      className="admin-issue-row"
                      key={learner.id}
                      onClick={() => openLearner(learner.id, tab)}
                      aria-label={`Open ${learner.name}: ${exception.text}`}
                    >
                      <LearnerAvatar learner={learner} />
                      <span>
                        <strong>{learner.name}</strong>
                        <small>{exception.text}</small>
                        <span className="admin-issue-owner">
                          {s.users.find((u) => u.id === learner.assessorId)
                            ?.name || "No assessor assigned"}
                          {exception.date
                            ? ` · Due ${fmt(exception.date)}`
                            : ""}
                        </span>
                      </span>
                      <span
                        className={`admin-issue-tag ${exception.severity.toLowerCase()}`}
                      >
                        {exception.severity === "Red"
                          ? "Priority"
                          : "Attention"}
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  );
                })}
              </div>
              {!workspace.issues.length && (
                <Nothing>
                  No open learner issues to show. New delivery concerns will
                  appear here.
                </Nothing>
              )}
            </Card>
            <Card
              className="admin-team-card"
              title="Assessor delivery oversight"
              subtitle="See who owns the work, then open their active caseload"
              action={
                <Link onClick={() => go("Team & caseloads")}>
                  Manage access
                </Link>
              }
            >
              {workspace.unassigned.length > 0 && (
                <button
                  className="admin-assignment-warning"
                  onClick={() =>
                    go("Apprentices", {
                      assessor: "__unassigned__",
                      status: "Active",
                    })
                  }
                >
                  <TriangleAlert size={16} />
                  <span>
                    {workspace.unassigned.length} active apprentice
                    {workspace.unassigned.length === 1 ? " needs" : "s need"} an
                    assessor
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              )}
              <div className="admin-team-labels">
                <span>Assessor / active caseload</span>
                <span>Awaiting review</span>
              </div>
              {workspace.team
                .slice(0, 6)
                .map(({ assessor, learners, evidence, logs }) => (
                  <button
                    className="admin-team-row"
                    key={assessor.id}
                    onClick={() =>
                      go("Apprentices", {
                        assessor: assessor.id,
                        status: "Active",
                      })
                    }
                    aria-label={`Open ${assessor.name} active caseload`}
                  >
                    <span className="avatar cool">
                      {initials(assessor.name)}
                    </span>
                    <span>
                      <strong>{assessor.name}</strong>
                      <small>
                        {learners} active apprentice{learners === 1 ? "" : "s"}
                        {!assessor.active ? " · Account inactive" : ""}
                      </small>
                    </span>
                    <span className="admin-team-work">
                      <b>{evidence} work</b>
                      <small>
                        {logs} OTJ log{logs === 1 ? "" : "s"}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              {!workspace.team.length && (
                <Nothing>
                  Add assessor accounts to assign caseloads and oversee
                  delivery.
                </Nothing>
              )}
              {workspace.team.length > 6 && (
                <button
                  className="admin-panel-footer"
                  onClick={() => go("Team & caseloads")}
                >
                  View all assessors <ArrowUpRight size={14} />
                </button>
              )}
            </Card>
          </div>
          <div className="admin-work-column">
            <Card
              className="admin-week-card"
              title="Your delivery week"
              subtitle="Scheduled sessions and reviews · next seven days"
              action={<Link onClick={() => go("Calendar")}>Calendar</Link>}
            >
              <div className="admin-agenda-list">
                {workspace.events
                  .slice(0, 5)
                  .map(({ appointment, learner }) => (
                    <button
                      className="admin-agenda-row"
                      key={appointment.id}
                      onClick={() =>
                        setModal({
                          type: "sessionDetail",
                          item: appointment,
                          learner,
                        })
                      }
                      aria-label={`Open booking: ${appointment.title} with ${learner.name}`}
                    >
                      <span className="admin-agenda-day">
                        <b>{appointment.date.slice(8)}</b>
                        <small>
                          {new Intl.DateTimeFormat("en-GB", {
                            weekday: "short",
                            timeZone: "Europe/London",
                          }).format(new Date(appointment.date + "T12:00:00Z"))}
                        </small>
                      </span>
                      <span>
                        <strong>{appointment.title}</strong>
                        <small>{learner.name}</small>
                        <span className="admin-agenda-time">
                          {appointment.date === workspace.day
                            ? "Today"
                            : fmt(appointment.date)}{" "}
                          ·{" "}
                          {appointment.allDay
                            ? "All day"
                            : appointment.time
                              ? `${appointment.time}${appointment.endTime ? "–" + appointment.endTime : ""} UK time`
                              : "Time to be confirmed"}
                        </span>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </div>
              {!workspace.events.length && (
                <Nothing>
                  No sessions booked in the next seven days. Schedule the next
                  conversation with an apprentice.
                </Nothing>
              )}
              <button
                className="admin-panel-footer"
                onClick={() => setModal({ type: "session" })}
              >
                <Plus size={14} /> Schedule a session or review{" "}
                <ArrowUpRight size={14} />
              </button>
            </Card>
            <Card
              className="admin-manage-card"
              title="Manage your provision"
              subtitle="Create, maintain and share—without searching through menus"
            >
              <div className="admin-manage-actions">
                {[
                  [
                    Users,
                    "Enrol an apprentice",
                    "Add their programme and delivery details",
                    () => setModal({ type: "learner" }),
                  ],
                  [
                    ShieldCheck,
                    "Create an account",
                    "Set up access for a learner or colleague",
                    () => setModal({ type: "user" }),
                  ],
                  [
                    BookOpen,
                    "Maintain standards & KSBs",
                    "Keep course content and criteria current",
                    () => go("Standards & KSBs"),
                  ],
                  [
                    MessageSquare,
                    "Publish success or an update",
                    "Share news with assessors and apprentices",
                    () => go("Success stories"),
                  ],
                ].map(([Icon, label, detail, action]) => (
                  <button key={label} onClick={action}>
                    <span className="admin-manage-icon">
                      <Icon size={18} />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
function Assessor({ s, user, go, openLearner, setModal }) {
  const workload = assessorDay(s, user.id),
    ls = s.learners,
    pending = workload.pendingEvidence,
    logs = workload.pendingLogs,
    reviews = workload.dueSoonLearners,
    find = (id) => ls.find((l) => l.id === id);
  return (
    <div data-dashboard="assessor">
      <Hero
        eyebrow="YOUR ASSESSOR WORKSPACE"
        title={`Welcome back, ${user.name.split(" ")[0]}.`}
        description="Your learners, your assessment priorities, and the next step for every apprentice."
        badge="Your assigned caseload only"
        className="assessor-hero"
        aside={
          <AssessorDay
            s={s}
            user={user}
            go={go}
            openLearner={openLearner}
            setModal={setModal}
          />
        }
        introduction={
          <>
            <div className="assessor-hero-actions">
              <button onClick={() => go("Portfolios")}>
                <ClipboardCheck size={17} />
                Start assessing
                <ArrowRight size={17} />
              </button>
              <button onClick={() => go("Progress report")}>
                <FileText size={17} />
                Learner progress reports
              </button>
            </div>
            <div
              className="assessor-summary-cards"
              aria-label="Your caseload at a glance"
            >
              {[
                {
                  value: ls.length,
                  label: "Your apprentices",
                  icon: Users,
                  page: "Apprentices",
                },
                {
                  value: average(ls) + "%",
                  label: "Average KSB progress",
                  icon: Target,
                  page: "Apprentices",
                  filters: { sort: "progress" },
                },
                {
                  value: ls.filter((l) => l.rag === "Red").length,
                  label: "Apprentices needing support",
                  icon: TriangleAlert,
                  page: "Apprentices",
                  filters: { rag: "Red" },
                  attention: true,
                },
              ].map(
                ({ value, label, icon: Icon, page, filters, attention }) => (
                  <button
                    type="button"
                    key={label}
                    className={
                      attention
                        ? "assessor-summary-card needs-support"
                        : "assessor-summary-card"
                    }
                    onClick={() => go(page, filters || {})}
                    aria-label={`${label}: ${value}`}
                  >
                    <span className="summary-card-top">
                      <Icon size={17} />
                      <ArrowUpRight size={13} />
                    </span>
                    <strong>{value}</strong>
                    <span className="summary-card-label">{label}</span>
                  </button>
                ),
              )}
            </div>
          </>
        }
      >
        <EpaPerformance performance={s.epaPerformance} />
      </Hero>
      <SuccessAndUpdates stories={s.successStories || []} />
      <div className="role-stat-grid">
        <Kpi
          onClick={() => go("Portfolios")}
          label="Evidence to assess"
          value={pending.length}
          detail="Submitted by your learners"
          icon={Layers}
        />
        <Kpi
          onClick={() => go("Off-the-job learning")}
          label="Learning logs to verify"
          value={logs.length}
          detail="Approve eligible OTJ learning"
          icon={Clock}
        />
        <Kpi
          onClick={() => go("Reviews Hub", { view: "soon" })}
          label="Reviews due soon"
          value={reviews.length}
          detail="Overdue or due within 14 days"
          icon={CalendarDays}
        />
        <Kpi
          onClick={() =>
            go("Action plans", { status: "Open", source: "learner" })
          }
          label="Open learner actions"
          value={s.tasks.filter((t) => t.status === "Open").length}
          detail="Track agreed next steps"
          icon={ListChecks}
        />
      </div>
      <div className="command-grid">
        <Card
          title="Your assessment queue"
          subtitle="Give the feedback that moves learning forward"
          action={<Link onClick={() => go("Portfolios")}>All portfolios</Link>}
        >
          {pending.slice(0, 5).map((e) => {
            const l = find(e.learnerId);
            return (
              <button
                className="assessment-queue-row"
                key={e.id}
                onClick={() =>
                  setModal({ type: "evidenceDetail", item: e, learner: l })
                }
              >
                <span className="evidence-tile">
                  <FileText size={19} />
                </span>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {l?.name} · {fmt(e.date)} · {e.criteria.join(", ")}
                  </small>
                </div>
                <span className="queue-action">
                  Assess
                  <ArrowUpRight size={14} />
                </span>
              </button>
            );
          })}
          {!pending.length && (
            <Nothing>Your assessment queue is clear.</Nothing>
          )}
        </Card>
        <Card
          title="This week’s focus"
          subtitle="A little structure. A lot of progress."
          className="focus-board"
        >
          <span className="focus-orb">
            <Target size={28} />
          </span>
          <h3>
            Keep every learner
            <br />
            moving forward.
          </h3>
          <p>
            {ls.filter((l) => l.rag === "Red").length} learners need priority
            support. Start with a conversation, agree an action, and review the
            evidence.
          </p>
          <button
            className="dashboard-link"
            onClick={() => go("Interventions")}
          >
            Open intervention priorities
            <ArrowRight size={16} />
          </button>
          <div className="focus-checklist">
            <span>
              <Check size={14} />
              Review submitted evidence
            </span>
            <span>
              <Check size={14} />
              Verify off-the-job logs
            </span>
            <span>
              <Check size={14} />
              Plan progress reviews
            </span>
          </div>
        </Card>
      </div>
      <div className="command-grid equal">
        <Card
          title="Your learners at a glance"
          subtitle="Live progress against their assigned standard"
          action={<Link onClick={() => go("Apprentices")}>Open caseload</Link>}
        >
          {ls.slice(0, 5).map((l) => (
            <Person
              key={l.id}
              learner={l}
              onClick={() => openLearner(l.id)}
              detail={`${s.standards.find((st) => st.id === l.standardId)?.name} · ${l.progress}% verified`}
            >
              <Status value={l.rag} />
            </Person>
          ))}
        </Card>
        <Card
          title="Review planner"
          subtitle="Keep conversations timely and purposeful"
          action={<Link onClick={() => go("Reviews Hub")}>Reviews hub</Link>}
        >
          {reviews
            .slice()
            .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
            .slice(0, 4)
            .map((l) => (
              <button
                className="review-plan-row"
                key={l.id}
                onClick={() => setModal({ type: "review", learner: l })}
              >
                <span className="review-date">
                  <b>{new Date(l.nextReview + "T12:00:00").getDate()}</b>
                  <small>
                    {new Date(l.nextReview + "T12:00:00").toLocaleDateString(
                      "en-GB",
                      { month: "short" },
                    )}
                  </small>
                </span>
                <div>
                  <strong>{l.name}</strong>
                  <small>
                    {l.nextReview < localDate()
                      ? "Overdue · arrange a review"
                      : "Progress review due"}
                  </small>
                </div>
                <Plus size={17} />
              </button>
            ))}
          {!reviews.length && (
            <Nothing>No reviews due in the next 14 days.</Nothing>
          )}
          <div className="dashboard-actions two compact">
            <Action
              icon={BookOpen}
              label="Learning plan"
              detail="Sessions, objectives & reflections"
              onClick={() => go("Learning plan")}
            />
            <Action
              icon={BookOpen}
              label="Resource library"
              onClick={() => go("Resources")}
            />
            <Action
              icon={Clock}
              label="Verify learning logs"
              onClick={() => go("Off-the-job learning")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
function Apprentice({ s, user, go, setModal }) {
  const l = s.learners.find((l) => l.id === user.learnerId) || s.learners[0];
  if (!l)
    return (
      <Nothing>
        Your account needs to be linked to an apprentice record. Contact your
        provider.
      </Nothing>
    );
  const standard = s.standards.find((st) => st.id === l.standardId),
    evidence = s.evidence.filter(
      (e) => e.learnerId === l.id && activeRecord(s, e),
    ),
    feedback = evidence
      .filter((e) => e.feedback)
      .slice()
      .sort((a, b) => b.updated.localeCompare(a.updated)),
    tasks = s.tasks.filter((t) => t.learnerId === l.id && t.status === "Open"),
    resources = s.resources.filter(
      (r) => !r.standardId || r.standardId === l.standardId,
    ),
    next = s.appointments
      .filter((a) => a.learnerId === l.id && a.date >= localDate())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    <div data-dashboard="apprentice">
      <Hero
        eyebrow="YOUR APPRENTICESHIP. YOUR FUTURE."
        title={`Hello, ${user.name.split(" ")[0]}. Let’s keep growing.`}
        description={`${standard?.name || "Your apprenticeship"} · Level ${l.level} · ${l.employer}`}
        badge="Your personal learning workspace"
        className="learner-hero"
      >
        <div className="learner-hero-content">
          <div>
            <p>
              Every experience is an opportunity to learn.
              <br />
              Capture your work, reflect on your skills, and see how far you’ve
              come.
            </p>
            <button
              className="white-action"
              onClick={() => setModal({ type: "evidence", learner: l })}
            >
              <Upload size={17} />
              Upload portfolio work
              <ArrowRight size={17} />
            </button>
            <button
              className="hero-outline"
              onClick={() => setModal({ type: "otj", learner: l })}
            >
              <Plus size={16} />
              Log off-the-job learning
            </button>
          </div>
          <div
            className="learner-progress-orb"
            style={{ "--progress": l.progress + "%" }}
          >
            <div>
              <strong>
                {l.progress}
                <span>%</span>
              </strong>
              <small>VERIFIED PROGRESS</small>
              <span>
                {l.coverage.filter((c) => c.achieved).length} of{" "}
                {l.coverage.length} KSBs achieved
              </span>
            </div>
          </div>
        </div>
      </Hero>
      <SuccessAndUpdates stories={s.successStories || []} />
      <div className="role-stat-grid">
        <Kpi
          label="Portfolio evidence"
          value={evidence.length}
          detail={`${evidence.filter((e) => e.status === "Accepted").length} accepted by your assessor`}
          icon={Layers}
        />
        <Kpi
          label="Off-the-job hours"
          value={l.hours + "h"}
          detail={`${l.otjTarget}h planned learning target`}
          icon={Clock}
        />
        <Kpi
          label="Your next review"
          value={
            l.nextReview
              ? new Date(l.nextReview + "T12:00:00").toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short" },
                )
              : "Not set"
          }
          detail={
            s.users.find((u) => u.id === l.assessorId)?.name || "Your assessor"
          }
          icon={CalendarDays}
        />
        <Kpi
          label="Actions to complete"
          value={tasks.length}
          detail={`${tasks.filter((t) => t.due < localDate()).length} overdue actions`}
          icon={ListChecks}
        />
      </div>
      <div className="command-grid">
        <Card
          title="Your learning journey"
          subtitle="Know what you’re working towards"
          action={
            <Link onClick={() => go("Progress report")}>Progress report</Link>
          }
        >
          <div className="standard-intro">
            <span className="programme-icon">
              <GraduationCap size={23} />
            </span>
            <div>
              <h3>{standard?.name}</h3>
              <p>
                {standard?.reference} · {standard?.version}
              </p>
            </div>
          </div>
          {["Knowledge", "Skill", "Behaviour"].map((type) => {
            const criteria = l.coverage.filter((c) => c.type === type),
              done = criteria.filter((c) => c.achieved).length;
            return (
              <div className="learner-ksb-row" key={type}>
                <div>
                  <strong>
                    {type === "Skill"
                      ? "Skills"
                      : type === "Behaviour"
                        ? "Behaviours"
                        : type}
                  </strong>
                  <span>
                    {done} / {criteria.length} achieved
                  </span>
                </div>
                <Meter
                  value={criteria.length ? (done / criteria.length) * 100 : 0}
                />
              </div>
            );
          })}
          <div className="learning-journey-footer">
            <span>
              <ShieldCheck size={15} />
              Only assessed, accepted evidence verifies progress
            </span>
            <Link onClick={() => go("Standards & KSBs")}>View my standard</Link>
          </div>
        </Card>
        <Card
          title="Your next step"
          subtitle="Make room for a little progress"
          className="focus-board learner-focus"
        >
          <span className="focus-orb">
            <Target size={28} />
          </span>
          <h3>
            Something you did today
            <br />
            could be your next evidence.
          </h3>
          <p>
            Think about a task you completed, what you learned, and the skills
            you put into practice.
          </p>
          <button
            className="dashboard-link"
            onClick={() => setModal({ type: "evidence", learner: l })}
          >
            Add a reflection
            <ArrowRight size={16} />
          </button>
          <div className="blue-callout">
            <strong>Your assessor is here to help</strong>
            <p>
              {s.users.find((u) => u.id === l.assessorId)?.name ||
                "Your assessor"}{" "}
              supports your next steps.
            </p>
            <Link onClick={() => go("Messages")}>Send a message</Link>
          </div>
        </Card>
      </div>
      <div className="command-grid equal">
        <Card
          title="Latest assessor feedback"
          subtitle="Turn useful feedback into your next achievement"
          action={<Link onClick={() => go("Portfolios")}>My portfolio</Link>}
        >
          {feedback.slice(0, 3).map((e) => (
            <button
              className="learner-feedback"
              key={e.id}
              onClick={() =>
                setModal({ type: "evidenceDetail", item: e, learner: l })
              }
            >
              <div>
                <span className="evidence-tile">
                  <FileText size={18} />
                </span>
                <strong>{e.title}</strong>
                <Status value={e.status} />
              </div>
              <p>{e.feedback}</p>
              <small>
                {fmt(e.updated)} · Open evidence <ArrowUpRight size={12} />
              </small>
            </button>
          ))}
          {!feedback.length && (
            <Nothing>Your assessor’s feedback will appear here.</Nothing>
          )}
        </Card>
        <Card
          title="Your action plan"
          subtitle="A clear path to your next milestone"
          action={<Link onClick={() => go("Action plans")}>View actions</Link>}
        >
          {tasks.slice(0, 3).map((t) => (
            <button
              className="learner-task"
              key={t.id}
              onClick={() => go("Action plans")}
            >
              <span className="task-checkbox" />
              <div>
                <strong>{t.title}</strong>
                <small>
                  Due {fmt(t.due)} ·{" "}
                  {t.due < localDate() ? "Overdue" : "Planned"}
                </small>
              </div>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!tasks.length && (
            <Nothing>
              No outstanding actions. Keep building your portfolio.
            </Nothing>
          )}
          <div className="next-appointment">
            <CalendarDays size={20} />
            <div>
              <strong>{next?.title || "Your next progress review"}</strong>
              <p>
                {next ? `${fmt(next.date)} · ${next.time}` : fmt(l.nextReview)}
              </p>
            </div>
          </div>
        </Card>
      </div>
      <Card
        title="Your learning toolkit"
        subtitle="Everything you need for your next chapter"
      >
        <div className="dashboard-actions four">
          <Action
            icon={BookOpen}
            label="Resource library"
            detail={`${resources.length} learning resources`}
            onClick={() => go("Resources")}
          />
          <Action
            icon={Clock}
            label="Off-the-job log"
            detail="Record and reflect"
            onClick={() => go("Off-the-job learning")}
          />
          <Action
            icon={FileText}
            label="Progress report"
            detail="See the whole picture"
            onClick={() => go("Progress report")}
          />
          <Action
            icon={MessageSquare}
            label="Messages"
            detail="Talk to your assessor"
            onClick={() => go("Messages")}
          />
        </div>
      </Card>
    </div>
  );
}
function IQA({ s, user, go, setModal, openLearner }) {
  const accepted = s.evidence.filter(
      (e) => e.status === "Accepted" && activeRecord(s, e),
    ),
    sampled = new Set(s.quality.map((q) => q.evidenceId));
  return (
    <div data-dashboard="iqa">
      <Hero
        eyebrow="INTERNAL QUALITY ASSURANCE"
        title={`Quality with confidence, ${user.name.split(" ")[0]}.`}
        description="Review assessment decisions, support consistent practice, and keep quality visible."
        badge="Your quality assurance caseload"
      >
        <div className="command-kpis">
          <Kpi
            label="Assigned learners"
            value={s.learners.length}
            detail="Quality-assured caseload"
          />
          <Kpi
            label="Accepted decisions"
            value={accepted.length}
            detail="Available for sampling"
            icon={Layers}
          />
          <Kpi
            label="Samples recorded"
            value={s.quality.length}
            detail="Findings and evidence trail"
            icon={ClipboardCheck}
          />
          <Kpi
            label="Actions required"
            value={
              s.quality.filter((q) => q.outcome === "Action required").length
            }
            detail="Quality follow-up"
            icon={TriangleAlert}
          />
        </div>
      </Hero>
      <div className="command-grid">
        <Card
          title="Your sampling queue"
          subtitle="Accepted evidence without a recorded sample"
          action={
            <Link onClick={() => go("Audit & quality")}>Quality hub</Link>
          }
        >
          {accepted
            .filter((e) => !sampled.has(e.id))
            .slice(0, 6)
            .map((e) => (
              <button
                className="assessment-queue-row"
                key={e.id}
                onClick={() => setModal({ type: "quality", evidenceId: e.id })}
              >
                <span className="evidence-tile">
                  <ClipboardCheck size={19} />
                </span>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {s.learners.find((l) => l.id === e.learnerId)?.name} ·{" "}
                    {e.criteria.join(", ")}
                  </small>
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))}
        </Card>
        <Card
          title="Quality tools"
          subtitle="Standards, decisions and a clear audit trail"
        >
          <div className="dashboard-actions">
            <Action
              icon={CalendarDays}
              label="Sampling plan & calendar"
              onClick={() => go("Audit & quality")}
            />
            <Action
              icon={Plus}
              label="Plan a KSB sample"
              onClick={() => setModal({ type: "samplingPlan" })}
            />
            <p className="body-copy">
              {
                (s.samplingPlans || []).filter((p) => p.status === "Planned")
                  .length
              }{" "}
              samples planned ·{" "}
              {
                (s.samplingPlans || []).filter(
                  (p) => p.status === "Planned" && p.date < localDate(),
                ).length
              }{" "}
              overdue
            </p>
            <Action
              icon={BookOpen}
              label="Standards & KSBs"
              onClick={() => go("Standards & KSBs")}
            />
            <Action
              icon={FileText}
              label="Learner progress reports"
              onClick={() => go("Progress report")}
            />
            <Action
              icon={ClipboardCheck}
              label="Audit & quality"
              onClick={() => go("Audit & quality")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
function Employer({ s, user, go, openLearner }) {
  return (
    <div data-dashboard="employer">
      <Hero
        eyebrow="YOUR EMPLOYER WORKSPACE"
        title="Growing talent. Building futures."
        description={`Your apprentices at ${user.employer || "your organisation"} — progress, reviews and agreed next steps.`}
        badge="Your organisation’s learners only"
      >
        <div className="command-kpis">
          <Kpi
            label="Your apprentices"
            value={s.learners.length}
            detail="Employer-linked learner records"
            icon={Users}
          />
          <Kpi
            label="Verified progress"
            value={average(s.learners) + "%"}
            detail="Average KSB achievement"
            icon={Target}
          />
          <Kpi
            label="Open actions"
            value={s.tasks.filter((t) => t.status === "Open").length}
            detail="Agreed learner next steps"
            icon={ListChecks}
          />
        </div>
      </Hero>
      <div className="command-grid">
        <Card
          title="Your apprentices"
          subtitle="Support progress in the workplace"
        >
          {s.learners.map((l) => (
            <Person
              key={l.id}
              learner={l}
              onClick={() => openLearner(l.id)}
              detail={`${l.progress}% verified · next review ${fmt(l.nextReview)}`}
            >
              <Status value={l.rag} />
            </Person>
          ))}
        </Card>
        <Card
          title="Support that makes a difference"
          subtitle="Stay connected to learning"
        >
          <div className="dashboard-actions">
            <Action
              icon={FileText}
              label="Progress reports"
              onClick={() => go("Progress report")}
            />
            <Action
              icon={CalendarDays}
              label="Review & acknowledge"
              onClick={() => go("Reviews Hub")}
            />
            <Action
              icon={MessageSquare}
              label="Contact the delivery team"
              onClick={() => go("Messages")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
