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
function Kpi({ label, value, detail, icon: Icon = Users }) {
  return (
    <div className="command-kpi">
      <div>
        <Icon size={17} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
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
    pending = s.evidence.filter(
      (e) => e.status === "Submitted" && activeRecord(s, e),
    ),
    overdue = ls.filter((l) => l.exceptions.some((e) => e.type === "review")),
    green = ls.filter((l) => l.rag === "Green").length,
    amber = ls.filter((l) => l.rag === "Amber").length,
    health = ls.length
      ? Math.round(((green + amber * 0.5) / ls.length) * 100)
      : 0;
  const upcoming = ls
    .flatMap((l) =>
      [
        ["Review", l.nextReview],
        ["Gateway", l.gatewayDate],
        ["EPA", l.epaDate],
      ]
        .filter(
          ([, d]) =>
            d &&
            d >= localDate() &&
            d <=
              new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        )
        .map(([type, date]) => ({ l, type, date })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
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
            label="Apprentices"
            value={ls.length}
            detail={`${active.length} active learners`}
            icon={Users}
          />
          <Kpi
            label="Verified progress"
            value={average(ls) + "%"}
            detail="Accepted KSB evidence"
            icon={Target}
          />
          <Kpi
            label="High-risk learners"
            value={risks.length}
            detail="Priority intervention"
            icon={TriangleAlert}
          />
          <Kpi
            label="Overdue reviews"
            value={overdue.length}
            detail="Conversations to arrange"
            icon={CalendarDays}
          />
          <Kpi
            label="Assessment queue"
            value={pending.length}
            detail="Evidence awaiting a decision"
            icon={Layers}
          />
        </div>
      </Hero>
      <div className="command-grid">
        <Card
          className="health-card"
          title="Portfolio health"
          subtitle="RAG distribution and progress position"
          action={<Link onClick={() => go("Analytics")}>Open analytics</Link>}
        >
          <div className="reference-health">
            <div className="health-well">
              <div
                className="reference-donut"
                style={{
                  background: `conic-gradient(#ef4444 0 ${ls.length ? (risks.length / ls.length) * 100 : 0}%,#f59e0b 0 ${ls.length ? ((risks.length + amber) / ls.length) * 100 : 0}%,#22c55e 0 100%)`,
                }}
              >
                <div>
                  <b>{ls.length}</b>
                  <small>APPRENTICES</small>
                </div>
              </div>
            </div>
            <div>
              <div className="health-cohorts">
                {[
                  ["Green", green, "On track"],
                  ["Amber", amber, "Needs attention"],
                  ["Red", risks.length, "Priority support"],
                ].map(([name, n, label]) => (
                  <button key={name} onClick={() => go("Alerts")}>
                    <Status value={name} />
                    <b>{n}</b>
                    <small>{label}</small>
                    <span>View cohort →</span>
                  </button>
                ))}
              </div>
              <div className="health-progress">
                <div>
                  <strong>Verified portfolio progress</strong>
                  <b>{average(ls)}%</b>
                </div>
                <Meter value={average(ls)} />
                <p>
                  Derived from accepted evidence against assigned standards.
                </p>
              </div>
            </div>
          </div>
        </Card>
        <Card
          title="Priority queue"
          subtitle="Highest-value interventions today"
          action={<Link onClick={() => go("Interventions")}>View all</Link>}
        >
          {[...ls]
            .filter((l) => l.exceptions.length)
            .sort((a, b) => b.exceptions.length - a.exceptions.length)
            .slice(0, 4)
            .map((l) => (
              <Person
                key={l.id}
                learner={l}
                onClick={() => openLearner(l.id)}
                detail={l.exceptions[0].text}
              >
                <Status value={l.rag} />
              </Person>
            ))}
          {!ls.some((l) => l.exceptions.length) && (
            <Nothing>No delivery exceptions right now.</Nothing>
          )}
        </Card>
      </div>
      <div className="command-grid equal">
        <Card
          title="Team caseload pulse"
          subtitle="Ownership, risk and review pressure"
          action={<Link onClick={() => go("Team & caseloads")}>Team view</Link>}
        >
          {s.users
            .filter((u) => u.role === "Assessor")
            .map((u) => {
              const cohort = ls.filter((l) => l.assessorId === u.id);
              return (
                <div className="caseload-pulse" key={u.id}>
                  <span className="avatar cool">{initials(u.name)}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <small>
                      {cohort.length} apprentices ·{" "}
                      {cohort.filter((l) => l.rag === "Red").length} at risk
                    </small>
                    <Meter value={average(cohort)} />
                  </div>
                  <b>{average(cohort)}%</b>
                </div>
              );
            })}
        </Card>
        <Card
          title="Quick actions"
          subtitle="Jump straight into operational work"
        >
          <div className="dashboard-actions two">
            <Action
              icon={Users}
              label="Learner directory"
              onClick={() => go("Apprentices")}
            />
            <Action
              icon={TriangleAlert}
              label="Risk alerts"
              onClick={() => go("Alerts")}
            />
            <Action
              icon={ListChecks}
              label="Action plans"
              onClick={() => go("Action plans")}
            />
            <Action
              icon={ClipboardCheck}
              label="Audit & quality"
              onClick={() => go("Audit & quality")}
            />
          </div>
          <div className="blue-callout">
            <strong>One connected picture</strong>
            <p>
              {s.standards.length} standards · {s.users.length} active accounts
              · {ls.length} apprentice records. Every dashboard uses the same
              saved records.
            </p>
          </div>
        </Card>
      </div>
      <div className="command-grid score-grid">
        <Card
          title="Portfolio health score"
          subtitle="Live composite delivery indicator"
        >
          <div className="health-score">
            <div className="score-ring" style={{ "--score": health + "%" }}>
              <b>{health}%</b>
            </div>
            <div>
              <h3>
                {health >= 70
                  ? "A strong foundation"
                  : "Focus support where it matters"}
              </h3>
              <p>
                Green learners count fully, amber learners count half. This
                score is a delivery indicator, not a funding judgement.
              </p>
            </div>
          </div>
        </Card>
        <Card
          title="Next 30 days"
          subtitle="Reviews, Gateway and EPA milestones approaching"
          action={<span className="live-tag">LIVE</span>}
        >
          <div className="milestone-cards">
            {upcoming.slice(0, 3).map((m, i) => (
              <button
                key={m.l.id + m.type + i}
                onClick={() =>
                  openLearner(
                    m.l.id,
                    m.type === "Review" ? "Reviews" : "Gateway",
                  )
                }
              >
                <CalendarDays size={19} />
                <span>{m.type}</span>
                <strong>{fmt(m.date)}</strong>
                <small>{m.l.name}</small>
              </button>
            ))}
          </div>
          {!upcoming.length && (
            <Nothing>No milestones due in the next 30 days.</Nothing>
          )}
        </Card>
      </div>
      <div className="command-grid equal">
        <Card
          title="Programme intelligence"
          subtitle="Largest programmes and portfolio health"
          action={<Link onClick={() => go("Standards & KSBs")}>Explore</Link>}
        >
          {s.standards.map((st) => {
            const cohort = ls.filter((l) => l.standardId === st.id);
            return (
              <div className="programme-row" key={st.id}>
                <div className="programme-icon">
                  <BookOpen size={20} />
                </div>
                <div>
                  <strong>{st.name}</strong>
                  <small>
                    Level {st.level} · {cohort.length} apprentices
                  </small>
                  <Meter value={average(cohort)} />
                </div>
                <b>{average(cohort)}%</b>
              </div>
            );
          })}
        </Card>
        <Card
          title="Compliance radar"
          subtitle="Where the team should focus next"
          action={
            <Link onClick={() => go("Compliance Hub")}>Open compliance</Link>
          }
        >
          <div className="compliance-tiles">
            {[
              ["Overdue reviews", "review"],
              ["Compliance exceptions", "compliance"],
              ["Behind target", "progress"],
              ["Missing dates", "data"],
            ].map(([label, type]) => (
              <button
                key={type}
                onClick={() =>
                  go(type === "compliance" ? "Compliance Hub" : "Alerts")
                }
              >
                <ShieldCheck size={18} />
                <b>
                  {
                    ls.filter((l) => l.exceptions.some((e) => e.type === type))
                      .length
                  }
                </b>
                <small>{label}</small>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
function Assessor({ s, user, go, openLearner, setModal }) {
  const ls = s.learners,
    pending = s.evidence.filter(
      (e) => e.status === "Submitted" && activeRecord(s, e),
    ),
    logs = s.otj.filter((e) => e.status === "Pending" && activeRecord(s, e)),
    reviews = ls.filter(
      (l) =>
        l.nextReview &&
        l.nextReview <=
          new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    ),
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
            <div className="assessor-hero-summary">
              <span>
                <b>{ls.length}</b> apprentices
              </span>
              <span>
                <b>{average(ls)}%</b> average coverage
              </span>
              <span>
                <b>{ls.filter((l) => l.rag === "Red").length}</b> need priority
                support
              </span>
            </div>
          </>
        }
      >
        <EpaPerformance performance={s.epaPerformance} />
      </Hero>
      <SuccessAndUpdates stories={s.successStories || []} />
      <div className="role-stat-grid">
        <Kpi
          label="Evidence to assess"
          value={pending.length}
          detail="Submitted by your learners"
          icon={Layers}
        />
        <Kpi
          label="Learning logs to verify"
          value={logs.length}
          detail="Approve eligible OTJ learning"
          icon={Clock}
        />
        <Kpi
          label="Reviews due soon"
          value={reviews.length}
          detail="Overdue or due within 14 days"
          icon={CalendarDays}
        />
        <Kpi
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
