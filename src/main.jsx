import { Trophy } from "lucide-react";
import { AssessorOneToOnes, SpotlightEditor } from "./staff-development";
import { LearnerSupportFields, LearnerDocuments } from "./learner-support";
import { LearnerPhotoEditor } from "./learner-photo";
import {
  OTJProgress,
  PrivateLearnerNotes,
  FunctionalSkillsChecks,
  IntegrityReport,
  EPASelection,
} from "./learner-enhancements";
import { sessionHeaders, sessionLink, rotateSessionTab } from "./session";
import {
  parseTrackerSheet,
  trackerCourseKey,
} from "../server/tracker-import.mjs";
import { SamplingPlanner, SamplingDialog } from "./iqa";
import { ReviewDialog, ReviewDetails } from "./reviews";
import { EmailSettings, PasswordRecovery } from "./email";
import React, {
  useState,
  useEffect,
  useContext,
  createContext,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  TriangleAlert,
  ListChecks,
  ChartNoAxesCombined,
  FileBarChart,
  ShieldCheck,
  GraduationCap,
  Building2,
  CalendarDays,
  Layers,
  BookOpen,
  MessageSquare,
  ClipboardCheck,
  History,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Menu,
  LogOut,
  Download,
  Upload,
  RefreshCw,
  Clock,
  Target,
  FileText,
  Send,
  LockKeyhole,
  BriefcaseBusiness,
  CheckCheck,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import {
  fmt,
  initials,
  csv,
  download,
  filePayload,
  parseStandard,
  reportRows,
  localDate,
} from "./lib";
import RoleDashboard, {
  dashboardTitle,
  pageLabel,
  activeRecord,
} from "./dashboards";
import ProgressReport from "./progress-report";
import {
  SchedulingWorkspace,
  LearningPlan,
  ScheduleDialog,
} from "./scheduling";
import { PasswordGate, AccountControls, ProductionStatus } from "./production";
import "./style.css";
import "./reference-theme.css";
const Context = createContext();
const useApp = () => useContext(Context);
const navGroups = [
  [
    "COMMAND CENTRE",
    [
      [LayoutDashboard, "Command centre"],
      [Users, "Apprentices"],
      [TriangleAlert, "Alerts"],
      [ListChecks, "Action plans"],
      [ChartNoAxesCombined, "Analytics"],
      [FileBarChart, "Report Studio"],
    ],
  ],
  [
    "PORTFOLIOS & LEARNING",
    [
      [Layers, "Portfolios"],
      [FileBarChart, "Progress report"],
      [BookOpen, "Learning plan"],
      [BookOpen, "Standards & KSBs"],
      [Clock, "Off-the-job learning"],
      [FolderOpen, "Resources"],
      [MessageSquare, "Messages"],
    ],
  ],
  [
    "OPERATIONS",
    [
      [Target, "Interventions"],
      [MessageSquare, "Assessor 1:1s"],
      [Trophy, "Success stories"],
      [CalendarDays, "Reviews Hub"],
      [ShieldCheck, "Compliance Hub"],
      [GraduationCap, "Gateway & EPA"],
      [CalendarDays, "Calendar"],
    ],
  ],
  [
    "INTELLIGENCE",
    [
      [Building2, "Employers"],
      [ChartNoAxesCombined, "Forecasting"],
      [Users, "Team & caseloads"],
      [ClipboardCheck, "Audit & quality"],
    ],
  ],
];
async function api(path, options = {}) {
  if (path === "login") rotateSessionTab();
  const res = await fetch("/api/" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...sessionHeaders(),
      ...options.headers,
    },
  });
  const out = await res.json();
  if (!res.ok) {
    const e = Error(out.error || "Request failed");
    e.status = res.status;
    throw e;
  }
  return out;
}
function App() {
  const [state, setState] = useState(null),
    [user, setUser] = useState(null),
    [demo, setDemo] = useState(null),
    [page, setPage] = useState("Command centre"),
    [learnerId, setLearnerId] = useState(""),
    [profile, setProfile] = useState(null),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [signInMessage, setSignInMessage] = useState(""),
    [signInEmail, setSignInEmail] = useState(""),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState("online");
  const modalBase = useRef({ value: null, revision: null });
  if (modalBase.current.value !== modal)
    modalBase.current = { value: modal, revision: state?.revision };
  const timer = useRef();
  useEffect(() => {
    refresh();
    api("demo")
      .then(setDemo)
      .catch(() => {});
    return () => clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (!user || modal || busy) return;
    const sync = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    const interval = setInterval(sync, 20000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", sync);
    };
  }, [user?.id, modal, busy]);
  function notify(message) {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }
  async function refresh(quiet = false) {
    try {
      const r = await api("state");
      setState(r.state);
      setConnection("online");
      setUser(r.user);
      setLearnerId((x) => x || r.state.learners[0]?.id || "");
      setDemo((d) => ({ ...d, enabled: r.demo }));
      setError("");
    } catch (e) {
      if (e.status === 401) {
        setUser(null);
        setState(null);
      } else {
        setConnection("offline");
        if (!quiet) setError(e.message);
      }
    }
  }
  async function command(kind, payload) {
    setBusy(true);
    try {
      const r = await api("command", {
        method: "POST",
        body: JSON.stringify({
          kind,
          payload,
          revision: modal ? modalBase.current.revision : state.revision,
        }),
      });
      setState(r.state);
      setConnection("online");
      notify("Changes saved to the workspace");
      return r.result;
    } catch (e) {
      if (!e.status) setConnection("offline");
      if (e.status === 409) {
        await refresh();
        if (modal)
          e.message +=
            " Your edits remain in this form. Close and reopen the current record before saving again.";
      }
      if (e.status === 401) {
        setUser(null);
        setState(null);
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function act(kind, payload) {
    return command(kind, payload).catch((e) => notify(e.message));
  }
  function go(p) {
    setPage(p);
    setMobile(false);
    setProfile(null);
    window.scrollTo({ top: 0 });
  }
  function openLearner(id, tab = "Overview") {
    setLearnerId(id);
    setProfile({ id, tab });
    setPage("Apprentices");
    setMobile(false);
    window.scrollTo({ top: 0 });
  }
  function finishPasswordChange() {
    setSignInEmail(user?.email || "");
    setSignInMessage(
      "Your password has been saved. Sign in with the new password you just chose; your previous password will no longer work.",
    );
    setModal(null);
    setUser(null);
    setState(null);
    setError("");
  }
  const ctx = {
    s: state,
    user,
    demo,
    command,
    act,
    go,
    openLearner,
    learnerId,
    setLearnerId,
    profile,
    setProfile,
    modal,
    setModal,
    notify,
    busy,
    refresh,
    connection,
    finishPasswordChange,
  };
  if (
    !user &&
    (new URLSearchParams(window.location.search).has("reset") ||
      window.location.hash.startsWith("#reset="))
  )
    return <PasswordRecovery />;
  if (!user)
    return (
      <Login
        demo={demo}
        message={signInMessage}
        initialEmail={signInEmail}
        onLogin={async (email, password) => {
          await api("login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });
          await refresh();
          setSignInMessage("");
        }}
        error={error}
      />
    );
  if (user.mustChangePassword)
    return (
      <PasswordGate
        user={user}
        onChange={async (payload) => {
          await command("password.change", payload);
          finishPasswordChange();
        }}
        onSignOut={async () => {
          await api("logout", { method: "POST", body: "{}" });
          setUser(null);
          setState(null);
        }}
      />
    );
  const restricted = ["Apprentice", "Employer"].includes(user.role);
  const allowed =
    user.role === "Apprentice"
      ? [
          "Command centre",
          "Portfolios",
          "Progress report",
          "Learning plan",
          "Standards & KSBs",
          "Off-the-job learning",
          "Resources",
          "Messages",
          "Action plans",
          "Reviews Hub",
          "Calendar",
          "Gateway & EPA",
        ]
      : user.role === "Employer"
        ? [
            "Command centre",
            "Apprentices",
            "Progress report",
            "Learning plan",
            "Action plans",
            "Reviews Hub",
            "Calendar",
            "Gateway & EPA",
            "Messages",
          ]
        : user.role === "Assessor"
          ? [
              "Command centre",
              "Apprentices",
              "Alerts",
              "Action plans",
              "Progress report",
              "Portfolios",
              "Learning plan",
              "Standards & KSBs",
              "Off-the-job learning",
              "Resources",
              "Messages",
              "Interventions",
              "Reviews Hub",
              "Calendar",
              "Gateway & EPA",
            ]
          : user.role === "IQA"
            ? [
                "Command centre",
                "Apprentices",
                "Progress report",
                "Portfolios",
                "Learning plan",
                "Standards & KSBs",
                "Resources",
                "Messages",
                "Reviews Hub",
                "Audit & quality",
              ]
            : null;
  const priority = state.learners.flatMap((l) => l.exceptions).length;
  return (
    <Context.Provider value={ctx}>
      <div className="app-shell">
        <aside className={mobile ? "side open" : "side"}>
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go("Command centre");
            }}
          >
            <span className="brand-icon">
              a<span>↗︎</span>
            </span>
            archetype<span className="brand-period">.</span>
          </a>
          <div className="workspace-label">
            <div className="workspace-emblem">
              <Layers size={19} />
            </div>
            <div>
              WBL Intelligence
              <small>
                {user.role === "Manager"
                  ? "Master workspace"
                  : user.role + " workspace"}
              </small>
            </div>
            <ChevronRight size={14} />
          </div>
          <div className="nav-scroll">
            {navGroups.map(([group, items]) => {
              const sectionItems =
                user.role === "Assessor"
                  ? group === "COMMAND CENTRE"
                    ? [...items, [CalendarDays, "Calendar"]]
                    : items.filter(([, title]) => title !== "Calendar")
                  : items;
              const links = sectionItems.filter(
                ([, title]) => !allowed || allowed.includes(title),
              );
              return (
                links.length > 0 && (
                  <div className="nav-group" key={group}>
                    <div className="nav-caption">
                      {group === "COMMAND CENTRE" && user.role === "Apprentice"
                        ? "MY WORKSPACE"
                        : group === "COMMAND CENTRE" && user.role === "Assessor"
                          ? "MY DELIVERY"
                          : group}
                    </div>
                    {links.map(([Icon, title]) => (
                      <button
                        key={title}
                        className={
                          "nav-link " + (page === title ? "active" : "")
                        }
                        onClick={() => go(title)}
                      >
                        <Icon size={17} />
                        <span>{pageLabel(title, user.role)}</span>
                        {title === "Alerts" && priority > 0 && (
                          <b>{priority}</b>
                        )}
                      </button>
                    ))}
                  </div>
                )
              );
            })}
          </div>
          <div className="side-bottom">
            <div className="storage-indicator">
              <span />
              {connection === "offline"
                ? "Connection lost"
                : "Server connected"}{" "}
              <small>Shared secure records</small>
            </div>
            <button
              className={"nav-link " + (page === "Settings" ? "active" : "")}
              onClick={() => go("Settings")}
            >
              <Settings size={17} />
              Settings & export
            </button>
            <div className="user-block">
              <div className="avatar">{initials(user.name)}</div>
              <div>
                {user.name}
                <small>
                  {user.role === "Manager" ? "Master user" : user.role}
                </small>
              </div>
              <button
                aria-label="Sign out"
                onClick={async () => {
                  await api("logout", { method: "POST", body: "{}" });
                  setUser(null);
                  setState(null);
                  setLearnerId("");
                  setProfile(null);
                  setModal(null);
                  setMobile(false);
                  setPage("Command centre");
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="workspace-main">
          <header className="topbar">
            <div className="crumb">
              <button
                className="mobile-toggle"
                aria-label="Open navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={22} />
              </button>
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>
                {profile ? "Learner profile" : pageLabel(page, user.role)}
              </strong>
            </div>
            <div className="topbar-right">
              <span className="workspace-live">
                <i />
                {connection === "offline"
                  ? "Offline · reconnect to save"
                  : busy
                    ? "Saving changes…"
                    : "Live workspace"}
              </span>

              <button
                title="Refresh workspace"
                aria-label="Refresh workspace"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
              <div className="avatar mini">{initials(user.name)}</div>
            </div>
          </header>
          <main>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {restricted
                    ? "YOUR LEARNING. YOUR NEXT CHAPTER."
                    : "DELIVERY, LEARNING & COMPLIANCE"}
                </div>
                <h1>
                  {profile
                    ? state.learners.find((l) => l.id === profile.id)?.name
                    : page === "Command centre"
                      ? dashboardTitle[user.role]
                      : pageLabel(page, user.role)}
                  <span>.</span>
                </h1>
                <p>
                  {profile
                    ? "A complete picture of learning, progress and support."
                    : page === "Command centre"
                      ? {
                          Manager:
                            "Clarity across every learner. Confidence in every next step.",
                          Assessor:
                            "Your caseload, your assessment priorities, your next conversations.",
                          Apprentice:
                            "Your progress, your portfolio, and the next step in your apprenticeship.",
                          IQA: "Consistent assessment. Clear decisions. Quality you can trace.",
                          Employer:
                            "Support your apprentices and stay connected to their progress.",
                        }[user.role]
                      : descriptions[page] ||
                        "Connected records. Meaningful progress. One workspace."}
                </p>
              </div>
              <div className="heading-actions">
                {!restricted && (
                  <span className="date-label">
                    {new Date().toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                      timeZone: "Europe/London",
                    })}
                  </span>
                )}
                {["Manager", "Assessor"].includes(user.role) && (
                  <Button onClick={() => setModal({ type: "learner" })}>
                    <Plus size={16} />
                    Add apprentice
                  </Button>
                )}
              </div>
            </div>
            {connection === "offline" && (
              <div className="error-banner" role="status">
                Connection lost. Changes cannot be saved while offline.
                Reconnect and refresh before continuing.
              </div>
            )}
            {error && <div className="error-banner">{error}</div>}
            {profile ? <LearnerProfile /> : <Page page={page} />}
            <footer>
              <strong>archetype.</strong>
              <span>Better insight. Better outcomes.</span>
              <span>Your connected apprenticeship workspace</span>
            </footer>
          </main>
        </div>
        {modal &&
          (["session", "sessionDetail", "plan", "planReflect"].includes(
            modal.type,
          ) ? (
            <ScheduleDialog
              key={modal.type + (modal.item?.id || "")}
              {...ctx}
            />
          ) : modal.type === "review" ? (
            <ReviewDialog {...ctx} />
          ) : ["samplingPlan", "samplingFinding"].includes(modal.type) ? (
            <SamplingDialog
              key={modal.type + (modal.item?.id || "")}
              {...ctx}
            />
          ) : (
            <ModalHost key={modal.type + (modal.item?.id || "")} />
          ))}{" "}
        {toast && (
          <div className="toast" role="status">
            <Check size={17} />
            {toast}
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
const descriptions = {
  "Progress report":
    "Your progress, evidence, learning hours and next steps in one clear report.",
  Apprentices: "Every apprentice, connected to the support they need.",
  Alerts: "The right intervention, before a small gap becomes a bigger one.",
  "Action plans": "Clear ownership. Agreed next steps. Nothing left behind.",
  "Report Studio": "Turn your portfolio data into a clearer picture.",
  "Standards & KSBs": "One standard. Clear expectations. Evidence that counts.",
  Portfolios: "Capture experience. Map evidence. Recognise progress.",
  "Reviews Hub": "Conversations that move learning forward.",
  "Compliance Hub": "Keep the essentials visible, current and under control.",
  "Audit & quality": "A clear record of decisions and the quality behind them.",
  "Off-the-job learning":
    "Capture new learning, reflect on it, and track approved hours.",
};
function Button({ children, secondary = false, ...props }) {
  return (
    <button className={secondary ? "button secondary" : "button"} {...props}>
      {children}
    </button>
  );
}
function Tag({ children, tone = "" }) {
  const t =
    tone ||
    {
      Red: "red",
      Amber: "amber",
      Green: "green",
      Active: "green",
      Accepted: "green",
      Approved: "green",
      Submitted: "blue",
      Draft: "neutral",
      "Changes requested": "amber",
      Pending: "amber",
      Returned: "amber",
      Rejected: "red",
      Complete: "green",
      "In progress": "blue",
      Open: "blue",
      Ready: "green",
      "Action required": "red",
      Agreed: "green",
    }[children] ||
    "neutral";
  return (
    <span className={"tag " + t}>
      <i />
      {children}
    </span>
  );
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={"panel " + className}>
      {(title || action) && (
        <div className="panel-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
function Empty({
  children = "Nothing here yet. Add your first record to get started.",
}) {
  return (
    <div className="empty">
      <FolderOpen size={28} />
      <p>{children}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon = ChartNoAxesCombined,
  tone = "",
}) {
  return (
    <div className={"metric " + tone}>
      <div>
        {label}
        <Icon size={17} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Progress({ value = 0 }) {
  return (
    <div className="progress-track">
      <i style={{ width: Math.min(100, Math.max(0, value)) + "%" }} />
    </div>
  );
}
function nameOf(s, id) {
  return s.users.find((x) => x.id === id)?.name || "Unknown user";
}
function stdOf(s, l) {
  return s.standards.find((x) => x.id === l.standardId)?.name || "No standard";
}
function LearnerLink({ id }) {
  const { s, openLearner } = useApp();
  return (
    <button className="text-link" onClick={() => openLearner(id)}>
      {s.learners.find((l) => l.id === id)?.name || "Learner"}
    </button>
  );
}
function Table({ headers, children }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Page({ page }) {
  const pageContext = useApp();
  switch (page) {
    case "Command centre":
      return <Dashboard />;
    case "Apprentices":
      return <Learners />;
    case "Alerts":
    case "Interventions":
      return <Alerts interventions={page === "Interventions"} />;
    case "Action plans":
      return <Tasks />;
    case "Analytics":
      return <Analytics />;
    case "Report Studio":
      return <Reports />;
    case "Portfolios":
      return <PortfolioHub />;
    case "Progress report":
      return <IndividualReport />;
    case "Standards & KSBs":
      return <Standards />;
    case "Off-the-job learning":
      return <OTJ />;
    case "Resources":
      return <Resources />;
    case "Messages":
      return <Messages />;
    case "Reviews Hub":
      return <Reviews />;
    case "Compliance Hub":
      return <Compliance />;
    case "Gateway & EPA":
      return <Gateway />;
    case "Calendar":
      return <Calendar />;
    case "Learning plan":
      return <LearningPlanPage />;
    case "Employers":
      return <Employers />;
    case "Forecasting":
      return <Forecast />;
    case "Assessor 1:1s":
      return <AssessorOneToOnes {...pageContext} />;
    case "Success stories":
      return <SpotlightEditor {...pageContext} />;
    case "Team & caseloads":
      return <Team />;
    case "Audit & quality":
      return <Quality />;
    default:
      return <SettingsPage />;
  }
}
function Dashboard() {
  const { s, user, go, openLearner, setModal } = useApp();
  return (
    <RoleDashboard
      s={s}
      user={user}
      go={go}
      openLearner={openLearner}
      setModal={setModal}
    />
  );
}
function FilterBar({ query, setQuery, filters = [], children }) {
  return (
    <div className="filterbar">
      <div className="searchbox">
        <Search size={17} />
        <input
          aria-label="Search records"
          placeholder="Search learners, employers, references…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.label}
          aria-label={f.label}
          value={f.value}
          onChange={(e) => f.set(e.target.value)}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option
              key={typeof o === "string" ? o : o.value}
              value={typeof o === "string" ? o : o.value}
            >
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
      ))}
      {children}
    </div>
  );
}
function Learners() {
  const { s, openLearner, setModal, user, notify, command, busy } = useApp(),
    [q, Q] = useState(""),
    [status, S] = useState(""),
    [rag, R] = useState(""),
    [assessor, A] = useState(""),
    [sort, SS] = useState("name"),
    [p, SP] = useState(1);
  let ls = s.learners
    .filter(
      (l) =>
        (!status || l.status === status) &&
        (!rag || l.rag === rag) &&
        (!assessor || l.assessorId === assessor) &&
        `${l.name} ${l.employer} ${l.ref}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "progress"
        ? a.progress - b.progress
        : sort === "risk"
          ? ["Red", "Amber", "Green"].indexOf(a.rag) -
            ["Red", "Amber", "Green"].indexOf(b.rag)
          : a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(ls.length / 12)),
    current = Math.min(p, pages);
  return (
    <>
      <Panel
        title="Apprentice directory"
        subtitle={`${ls.length} learners · select a learner to open their complete record`}
        action={
          <div className="button-row">
            {user.role === "Manager" && (
              <Button secondary onClick={() => setModal({ type: "import" })}>
                <Upload size={14} />
                Import spreadsheet
              </Button>
            )}
            <Button
              secondary
              onClick={() =>
                download("apprentices.csv", csv(reportRows(ls, s)), "text/csv")
              }
            >
              <Download size={14} />
              Export CSV
            </Button>
          </div>
        }
      >
        <FilterBar
          query={q}
          setQuery={(x) => {
            Q(x);
            SP(1);
          }}
          filters={[
            {
              label: "All statuses",
              value: status,
              set: S,
              options: ["Active", "Paused", "Withdrawn", "Completed"],
            },
            {
              label: "All RAG",
              value: rag,
              set: R,
              options: ["Green", "Amber", "Red"],
            },
            {
              label: "All assessors",
              value: assessor,
              set: A,
              options: s.users
                .filter((u) => u.role === "Assessor")
                .map((u) => ({ value: u.id, label: u.name })),
            },
          ]}
        >
          <select
            aria-label="Sort learners"
            value={sort}
            onChange={(e) => SS(e.target.value)}
          >
            <option value="name">Learner A–Z</option>
            <option value="risk">Risk priority</option>
            <option value="progress">Progress low–high</option>
          </select>
        </FilterBar>
        <Table
          headers={[
            "Learner",
            "Employer / programme",
            "Assessor",
            "Progress / target",
            "Next review",
            "Risk",
            "",
          ]}
        >
          {ls.slice((current - 1) * 12, current * 12).map((l) => (
            <tr key={l.id}>
              <td>
                <div className="learner-cell">
                  <LearnerPhotoEditor
                    learner={l}
                    user={user}
                    command={command}
                    busy={busy}
                    compact
                  />
                  <button
                    type="button"
                    className="learner-name-button"
                    onClick={() => openLearner(l.id)}
                  >
                    <strong>{l.name}</strong>
                    <small>
                      {l.ref} · {l.status}
                    </small>
                  </button>
                </div>
              </td>
              <td>
                <strong>{l.employer}</strong>
                <small>
                  {stdOf(s, l)} · L{l.level}
                </small>
              </td>
              <td>{nameOf(s, l.assessorId)}</td>
              <td>
                <div className="progress-value">
                  <b>{l.progress}%</b>
                  <span> / {l.target}%</span>
                </div>
                <Progress value={l.progress} />
              </td>
              <td
                className={
                  l.nextReview && l.nextReview < localDate()
                    ? "danger-text"
                    : ""
                }
              >
                {fmt(l.nextReview)}
              </td>
              <td>
                <Tag>{l.rag}</Tag>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Open " + l.name}
                  onClick={() => openLearner(l.id)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!ls.length && <Empty>No learners match your filters.</Empty>}
        <div className="pagination">
          <span>
            {ls.length} records · page {current} of {pages}
          </span>
          <button disabled={current === 1} onClick={() => SP(current - 1)}>
            <ChevronLeft size={14} />
            Previous
          </button>
          <button disabled={current >= pages} onClick={() => SP(current + 1)}>
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </Panel>
    </>
  );
}
function LearnerPicker() {
  const { s, learnerId, setLearnerId } = useApp();
  return (
    <label className="learner-picker">
      Apprentice
      <select
        aria-label="Select apprentice"
        value={learnerId}
        onChange={(e) => setLearnerId(e.target.value)}
      >
        <option value="">Choose an apprentice</option>
        {s.learners.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} · {l.ref}
          </option>
        ))}
      </select>
    </label>
  );
}
function LearnerProfile() {
  const ctx = useApp();
  const { s, profile, setProfile, go, setModal, user, command, busy } =
      useApp(),
    l = s.learners.find((x) => x.id === profile.id);
  if (!l) return <Empty>Learner record unavailable.</Empty>;
  const tabs =
    user.role === "Employer"
      ? ["Overview", "Reviews", "Actions", "Gateway"]
      : [
          "Overview",
          "Evidence",
          "Learning plan",
          "KSB coverage",
          "Off-the-job log",
          "Reviews",
          "Actions",
          "Compliance",
          "Gateway",
        ];
  return (
    <>
      <div className="profile-top">
        <button className="text-link" onClick={() => go("Apprentices")}>
          <ChevronLeft size={15} />
          Back to directory
        </button>
        {["Manager", "Assessor"].includes(user.role) && (
          <Button
            secondary
            onClick={() => setModal({ type: "learner", item: l })}
          >
            Edit apprentice
          </Button>
        )}
      </div>
      {["Manager", "Assessor"].includes(user.role) && (
        <div className="standard-assignment-bar">
          <div>
            <BookOpen size={19} />
            <span>
              Assigned standard<strong>{stdOf(s, l)}</strong>
            </span>
          </div>
          <Button
            secondary
            onClick={() => setModal({ type: "assignStandard", learner: l })}
          >
            Assign a different standard <ArrowRight size={15} />
          </Button>
        </div>
      )}
      <div className="learner-banner">
        <LearnerPhotoEditor
          key={l.id}
          learner={l}
          user={user}
          command={command}
          busy={busy}
        />
        <div>
          <h2>{l.name}</h2>
          <p>
            {l.ref} · {l.employer} · {stdOf(s, l)} · Level {l.level}
          </p>
        </div>
        <Tag>{l.rag}</Tag>
        <Tag>{l.status}</Tag>
      </div>
      {l.tracker && ["Manager", "Assessor", "IQA"].includes(user.role) && (
        <Panel
          title="Imported WBL tracker"
          subtitle="Staff-only source details. Reported progress is separate from verified evidence coverage."
        >
          <p>
            Tracker progress:{" "}
            {l.tracker.reportedProgress == null
              ? "Not supplied"
              : `${Math.round(l.tracker.reportedProgress * 100) / 100}%`}{" "}
            · Tracker target:{" "}
            {l.tracker.reportedTarget == null
              ? "Not supplied"
              : `${Math.round(l.tracker.reportedTarget * 100) / 100}%`}
          </p>
          <details>
            <summary>View relevant imported tracker fields</summary>
            <Table headers={["Tracker field", "Imported value"]}>
              {Object.entries(l.tracker.fields).map(([field, value]) => (
                <tr key={field}>
                  <td>{field}</td>
                  <td className="preserve-text">{String(value)}</td>
                </tr>
              ))}
            </Table>
          </details>
        </Panel>
      )}
      <div className="tabs">
        {tabs.map((t) => (
          <button
            className={profile.tab === t ? "selected" : ""}
            key={t}
            onClick={() => setProfile({ ...profile, tab: t })}
          >
            {t}
          </button>
        ))}
      </div>
      {profile.tab === "Overview" ? (
        <>
          <div className="metrics">
            <Metric
              label="Verified KSB coverage"
              value={l.progress + "%"}
              detail={`${l.coverage.filter((c) => c.achieved).length} of ${l.coverage.length} criteria achieved`}
            />
            <Metric
              label="Progress variance"
              value={(l.variance > 0 ? "+" : "") + l.variance + "%"}
              detail={`Against a target of ${l.target}%`}
            />
            <Metric
              label="Approved learning"
              value={l.hours + "h"}
              detail={`Of ${l.otjTarget} planned hours`}
              icon={Clock}
            />
            <Metric
              label="Next review"
              value={
                l.nextReview
                  ? new Date(l.nextReview + "T12:00:00").toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short" },
                    )
                  : "Not set"
              }
              detail={nameOf(s, l.assessorId)}
              icon={CalendarDays}
            />
          </div>
          <div className="grid two">
            <Panel title="Learning & support">
              <Detail label="Assessor" value={nameOf(s, l.assessorId)} />
              <Detail label="Quality assurer" value={nameOf(s, l.iqaId)} />
              <Detail label="Planned end" value={fmt(l.plannedEnd)} />
              <Detail label="Predicted end" value={fmt(l.predictedEnd)} />
              <Detail
                label="English / maths"
                value={`${l.english} / ${l.maths}`}
              />
              <Detail label="Notes" value={l.notes || "No additional notes"} />
              {l.programmeHistory?.length > 0 && (
                <details className="programme-history">
                  <summary>
                    Previous standard assignments · {l.programmeHistory.length}
                  </summary>
                  {l.programmeHistory.map((h, i) => (
                    <div key={i}>
                      <strong>
                        {s.standards.find((st) => st.id === h.standardId)
                          ?.name || "Previous standard"}
                      </strong>
                      <p>
                        {fmt(h.changedAt)} · {h.progress}% verified · {h.hours}h
                        learning
                      </p>
                      <small>{h.reason}</small>
                    </div>
                  ))}
                </details>
              )}
            </Panel>
            <Panel title="Attention & interventions">
              {l.exceptions.map((x, i) => (
                <div className="exception" key={i}>
                  <TriangleAlert size={16} />
                  <div>
                    <strong>{x.text}</strong>
                    <small>
                      {x.date ? fmt(x.date) : "Calculated from learner record"}
                    </small>
                  </div>
                  <Tag>{x.severity}</Tag>
                </div>
              ))}
              {!l.exceptions.length && (
                <Empty>No current delivery exceptions.</Empty>
              )}
            </Panel>
          </div>
        </>
      ) : profile.tab === "Evidence" ? (
        <Evidence learner={l} />
      ) : profile.tab === "Learning plan" ? (
        <LearningPlan {...ctx} learner={l} />
      ) : profile.tab === "KSB coverage" ? (
        <Coverage learner={l} />
      ) : profile.tab === "Off-the-job log" ? (
        <OTJ learner={l} />
      ) : profile.tab === "Reviews" ? (
        <Reviews learner={l} />
      ) : profile.tab === "Actions" ? (
        <Tasks learner={l} />
      ) : profile.tab === "Compliance" ? (
        <Compliance learner={l} />
      ) : (
        <Gateway learner={l} />
      )}
    </>
  );
}
function Detail({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function IndividualReport() {
  const ctx = useApp();
  return <ProgressReport {...ctx} />;
}
function PortfolioHub() {
  const ctx = useApp();
  const { s, learnerId, user } = ctx,
    l = s.learners.find((x) => x.id === learnerId);
  return (
    <>
      <LearnerPicker />
      {l ? (
        <>
          <div className="metrics three">
            <Metric
              label="Verified coverage"
              value={l.progress + "%"}
              detail={stdOf(s, l)}
              icon={Target}
            />
            <Metric
              label="Evidence items"
              value={
                s.evidence.filter(
                  (x) => x.learnerId === l.id && activeRecord(s, x),
                ).length
              }
              detail="Across this learner’s portfolio"
              icon={Layers}
            />
            <Metric
              label="Awaiting assessment"
              value={
                s.evidence.filter(
                  (x) =>
                    x.learnerId === l.id &&
                    activeRecord(s, x) &&
                    x.status === "Submitted",
                ).length
              }
              detail="Only accepted evidence counts towards coverage"
              icon={ClipboardCheck}
            />
          </div>
          <OTJProgress key={l.id} learner={l} logs={s.otj} />
          <Evidence learner={l} />
          <PrivateLearnerNotes key={l.id} {...ctx} learner={l} />
          <Coverage learner={l} />
        </>
      ) : (
        <Empty>Add an apprentice before opening a portfolio.</Empty>
      )}
    </>
  );
}
function Evidence({ learner }) {
  const { s, user, setModal, command, busy, notify } = useApp(),
    [epa, EPA] = useState(false),
    [history, HISTORY] = useState(false),
    [q, Q] = useState(""),
    [status, S] = useState("");
  const items = s.evidence.filter(
    (x) =>
      x.learnerId === learner.id &&
      (!epa || !!x.epaSelected) &&
      (history || activeRecord(s, x)) &&
      (!status || x.status === status) &&
      `${x.title} ${x.description}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Panel
      title="Evidence & assessment"
      subtitle={
        epa
          ? "Choose the evidence for this apprentice’s EPA folder. Export includes accepted work and assessor feedback."
          : "Draft → Submitted → Assessed · only accepted evidence verifies KSBs"
      }
      action={
        ["Manager", "Assessor", "Apprentice"].includes(user.role) && (
          <Button onClick={() => setModal({ type: "evidence", learner })}>
            <Plus size={15} />
            Add evidence
          </Button>
        )
      }
    >
      <div className="tabs">
        <button className={!epa ? "selected" : ""} onClick={() => EPA(false)}>
          Portfolio evidence
        </button>
        <button className={epa ? "selected" : ""} onClick={() => EPA(true)}>
          EPA portfolio
        </button>
        {epa &&
          user.role !== "Employer" &&
          s.evidence.some(
            (e) =>
              e.learnerId === learner.id &&
              e.epaSelected &&
              e.status === "Accepted" &&
              activeRecord(s, e),
          ) && (
            <a
              className="button secondary"
              href={sessionLink("/api/epa/" + learner.id + ".zip")}
            >
              Export EPA portfolio
            </a>
          )}
      </div>
      <div className="filterbar">
        <label className="history-toggle">
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => HISTORY(e.target.checked)}
          />
          Include earlier standards
        </label>
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Search evidence"
            placeholder="Search evidence…"
            value={q}
            onChange={(e) => Q(e.target.value)}
          />
        </div>
        <select
          aria-label="Evidence status"
          value={status}
          onChange={(e) => S(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "Draft",
            "Submitted",
            "Accepted",
            "Changes requested",
            "Rejected",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <Table
        headers={[
          "Evidence",
          "KSB mapping",
          "Status",
          "Feedback",
          "EPA folder",
          "",
        ]}
      >
        {items.map((e) => (
          <tr key={e.id}>
            <td>
              <button
                className="text-link"
                onClick={() =>
                  setModal({ type: "evidenceDetail", item: e, learner })
                }
              >
                <FileText size={16} />
                {e.title}
              </button>
              <small>
                Similarity:{" "}
                {e.integrity?.status === "Checked"
                  ? `${e.integrity.similarity}% internal match`
                  : e.integrity?.status || "Not checked"}
              </small>
              <small>
                Internet: {e.integrity?.internet?.status || "Not checked"} · AI
                review:{" "}
                {e.integrity?.aiReview?.recommendation ||
                  e.integrity?.aiReview?.status ||
                  "Not checked"}
              </small>
              <small>
                {e.type} · {fmt(e.date)} · {e.files.length} files
                {e.standardId && e.standardId !== learner.standardId
                  ? " · Earlier standard"
                  : ""}
              </small>
            </td>
            <td>
              <div className="code-list">
                {e.criteria.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </td>
            <td>
              <Tag>{e.status}</Tag>
            </td>
            <td className="feedback-preview">
              {e.feedback || "Awaiting feedback"}
            </td>
            <td>
              <EPASelection
                evidence={e}
                allowed={
                  activeRecord(s, e) &&
                  ["Manager", "Assessor", "Apprentice"].includes(user.role)
                }
                command={command}
                busy={busy}
                notify={notify}
              />
              {e.epaSelected && e.status !== "Accepted" && (
                <small>Awaiting acceptance before export</small>
              )}
            </td>
            <td>
              <button
                className="text-link"
                onClick={() =>
                  setModal({ type: "evidenceDetail", item: e, learner })
                }
              >
                {e.status === "Submitted" &&
                ["Manager", "Assessor"].includes(user.role)
                  ? "Assess"
                  : "Open"}
                <ArrowUpRight size={14} />
              </button>
            </td>
          </tr>
        ))}
      </Table>
      {!items.length && (
        <Empty>
          {epa
            ? "Tick the EPA folder checkbox beside the evidence you want to include."
            : "No evidence matches. Add evidence or change the filters."}
        </Empty>
      )}
    </Panel>
  );
}
function Coverage({ learner }) {
  const { s } = useApp(),
    st = s.standards.find((x) => x.id === learner.standardId);
  return (
    <Panel
      title="Standards & verified coverage"
      subtitle={`${st?.reference || ""} · ${st?.version || ""}`}
    >
      <div className="coverage-summary">
        <strong>
          {learner.progress}% <span>verified</span>
        </strong>
        <Progress value={learner.progress} />
        <small>
          {learner.coverage.filter((c) => c.achieved).length} of{" "}
          {learner.coverage.length} criteria achieved through accepted evidence
        </small>
      </div>
      <Table
        headers={["Code", "Type", "Criterion", "Accepted evidence", "Coverage"]}
      >
        {learner.coverage.map((c) => (
          <tr key={c.code}>
            <td>
              <strong className="code">{c.code}</strong>
            </td>
            <td>{c.type}</td>
            <td className="wide-cell">{c.text}</td>
            <td>{c.count}</td>
            <td>
              <Tag tone={c.achieved ? "green" : "neutral"}>
                {c.achieved ? "Achieved" : "Not yet verified"}
              </Tag>
            </td>
          </tr>
        ))}
      </Table>
      {!learner.coverage.length && (
        <Empty>
          This standard needs criteria before progress can be calculated.
        </Empty>
      )}
    </Panel>
  );
}
function Alerts({ interventions = false }) {
  const { s, openLearner, setModal, user } = useApp(),
    [severity, S] = useState(""),
    [type, T] = useState("");
  const alerts = s.learners
    .flatMap((l) =>
      l.exceptions.map((e, i) => ({ ...e, id: l.id + "-" + i, l })),
    )
    .filter(
      (e) =>
        (!severity || e.severity === severity) && (!type || e.type === type),
    );
  return (
    <>
      <div className="metrics three">
        <Metric
          label="High priority exceptions"
          value={alerts.filter((e) => e.severity === "Red").length}
          detail="Requires timely support"
          icon={TriangleAlert}
        />
        <Metric
          label="Review pressure"
          value={alerts.filter((e) => e.type === "review").length}
          detail="Overdue learner reviews"
          icon={CalendarDays}
        />
        <Metric
          label="Compliance exceptions"
          value={alerts.filter((e) => e.type === "compliance").length}
          detail="Insurance, risk or employer assessment"
          icon={ShieldCheck}
        />
      </div>
      <Panel
        title={interventions ? "Intervention cohorts" : "Delivery alerts"}
        subtitle="Calculated from the current learner records; resolve the underlying issue to clear an alert"
        action={
          <Button
            secondary
            onClick={() =>
              download(
                "interventions.csv",
                csv(
                  alerts.map((e) => ({
                    learner: e.l.name,
                    employer: e.l.employer,
                    severity: e.severity,
                    issue: e.text,
                    due: e.date || "",
                  })),
                ),
                "text/csv",
              )
            }
          >
            <Download size={14} />
            Export cohort
          </Button>
        }
      >
        <div className="filterbar">
          <select
            aria-label="Alert severity"
            value={severity}
            onChange={(e) => S(e.target.value)}
          >
            <option value="">All severities</option>
            <option>Red</option>
            <option>Amber</option>
          </select>
          <select
            aria-label="Alert type"
            value={type}
            onChange={(e) => T(e.target.value)}
          >
            <option value="">All exception types</option>
            {["review", "compliance", "progress", "data", "end", "skills"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </div>
        <Table
          headers={[
            "Priority",
            "Learner",
            "Exception",
            "Due",
            "Owner",
            "Action",
          ]}
        >
          {alerts.map((e) => (
            <tr key={e.id}>
              <td>
                <Tag>{e.severity}</Tag>
              </td>
              <td>
                <LearnerLink id={e.l.id} />
                <small>{e.l.employer}</small>
              </td>
              <td>{e.text}</td>
              <td>{fmt(e.date)}</td>
              <td>{nameOf(s, e.l.assessorId)}</td>
              <td>
                {["Manager", "Assessor"].includes(user.role) ? (
                  <button
                    className="text-link"
                    onClick={() =>
                      setModal({ type: "task", learner: e.l, prefill: e.text })
                    }
                  >
                    Create action <Plus size={14} />
                  </button>
                ) : (
                  <button
                    className="text-link"
                    onClick={() => openLearner(e.l.id)}
                  >
                    Open learner
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {!alerts.length && <Empty>No exceptions in this cohort.</Empty>}
      </Panel>
    </>
  );
}
function Tasks({ learner }) {
  const { s, user, command, notify, busy, setModal } = useApp(),
    [filter, F] = useState("All");
  const items = s.tasks.filter(
    (x) =>
      (!learner || x.learnerId === learner.id) &&
      (filter === "All" || filter === "Overdue"
        ? filter !== "Overdue" || (x.status === "Open" && x.due < localDate())
        : x.status === filter),
  );
  return (
    <Panel
      title="Action plans"
      subtitle="Owned actions linked to each apprentice"
      action={
        ["Manager", "Assessor"].includes(user.role) && (
          <Button onClick={() => setModal({ type: "task", learner })}>
            <Plus size={15} />
            Create action
          </Button>
        )
      }
    >
      <div className="segmented">
        {["Open", "Overdue", "Complete", "All"].map((x) => (
          <button
            className={filter === x ? "selected" : ""}
            key={x}
            onClick={() => F(x)}
          >
            {x === "Open" ? "In progress" : x}
          </button>
        ))}
      </div>
      <Table headers={["Action", "Learner", "Owner", "Due", "Status", ""]}>
        {items.map((t) => (
          <tr key={t.id}>
            <td className="wide-cell">
              <strong>{t.title}</strong>
              {t.description && (
                <small className="preserve-text">{t.description}</small>
              )}
              {t.reviewId && (
                <small>
                  SMART target from a progress review · {t.category}
                </small>
              )}
            </td>
            <td>
              <LearnerLink id={t.learnerId} />
            </td>
            <td>{nameOf(s, t.owner)}</td>
            <td
              className={
                t.status === "Open" && t.due < localDate() ? "danger-text" : ""
              }
            >
              {fmt(t.due)}
            </td>
            <td>
              <Tag>{t.status === "Open" ? "In progress" : t.status}</Tag>
            </td>
            <td>
              {(["Manager", "Assessor"].includes(user.role) ||
                t.owner === user.id) && (
                <button
                  className="text-link"
                  disabled={busy}
                  aria-label={`${t.status === "Complete" ? "Reopen action" : "Mark complete"}: ${t.title}`}
                  onClick={async () => {
                    const status =
                      t.status === "Complete" ? "Open" : "Complete";
                    try {
                      await command("task.setStatus", {
                        id: t.id,
                        learnerId: t.learnerId,
                        status,
                      });
                      F("All");
                      notify(
                        status === "Complete"
                          ? "Action marked complete."
                          : "Action reopened and in progress.",
                      );
                    } catch (error) {
                      notify(error.message);
                    }
                  }}
                >
                  {t.status === "Complete" ? "Reopen action" : "Mark complete"}
                  <Check size={14} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {!items.length && <Empty>No actions in this view.</Empty>}
    </Panel>
  );
}
function OTJ({ learner }) {
  const { s, user, setModal, act, learnerId, setLearnerId } = useApp(),
    [selected, SELECT] = useState(learner?.id || learnerId || ""),
    [showHistory, SHOWHISTORY] = useState(false),
    [filter, F] = useState("");
  const selectedLearner =
      learner ||
      s.learners.find((l) => l.id === selected) ||
      (user.role === "Apprentice" ? s.learners[0] : null),
    ls = selectedLearner ? [selectedLearner] : s.learners,
    ids = new Set(ls.map((l) => l.id)),
    items = s.otj.filter(
      (x) =>
        ids.has(x.learnerId) &&
        (showHistory || activeRecord(s, x)) &&
        (!filter || x.status === filter),
    );
  return (
    <>
      {!learner && user.role !== "Apprentice" && (
        <label className="learner-picker">
          Apprentice
          <select
            aria-label="Off-the-job log apprentice"
            value={selected}
            onChange={(e) => {
              SELECT(e.target.value);
              if (e.target.value) setLearnerId(e.target.value);
            }}
          >
            <option value="">All apprentices</option>
            {s.learners.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.ref}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedLearner && (
        <OTJProgress
          key={selectedLearner.id}
          learner={selectedLearner}
          logs={s.otj}
        />
      )}
      <div className="metrics three">
        <Metric
          label="Approved learning hours"
          value={ls.reduce((n, l) => n + l.hours, 0)}
          detail="Approved logs contribute to the learning target"
          icon={Clock}
        />
        <Metric
          label="Pending logs"
          value={
            s.otj.filter(
              (x) =>
                ids.has(x.learnerId) &&
                activeRecord(s, x) &&
                x.status === "Pending",
            ).length
          }
          detail="Awaiting assessor verification"
          icon={ClipboardCheck}
        />
        <Metric
          label="Planned hours"
          value={ls.reduce((n, l) => n + l.otjTarget, 0)}
          detail="Configured per learner’s training plan"
          icon={Target}
        />
      </div>
      <Panel
        title="Off-the-job log"
        subtitle="Capture learning, not routine work. Provider must verify eligibility against the applicable funding rules."
        action={
          ["Manager", "Assessor", "Apprentice"].includes(user.role) && (
            <Button
              onClick={() =>
                setModal({ type: "otj", learner: selectedLearner })
              }
            >
              <Plus size={15} />
              Log learning
            </Button>
          )
        }
      >
        <div className="filterbar">
          <label className="history-toggle">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => SHOWHISTORY(e.target.checked)}
            />
            Include earlier standards
          </label>
          <select
            aria-label="Learning log status"
            value={filter}
            onChange={(e) => F(e.target.value)}
          >
            <option value="">All statuses</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Returned</option>
          </select>
        </div>
        <Table
          headers={[
            "Activity / reflection",
            "Learner",
            "Date",
            "Hours",
            "Status",
            "Review",
          ]}
        >
          {items
            .slice()
            .reverse()
            .map((x) => (
              <tr key={x.id}>
                <td className="wide-cell">
                  <strong>{x.activity}</strong>
                  <small>
                    {x.reflection}
                    {!activeRecord(s, x) ? " · Earlier standard" : ""}
                  </small>
                  {x.feedback && <small>Feedback: {x.feedback}</small>}
                </td>
                <td>
                  <LearnerLink id={x.learnerId} />
                </td>
                <td>{fmt(x.date)}</td>
                <td>{x.hours}h</td>
                <td>
                  <Tag>{x.status}</Tag>
                </td>
                <td>
                  {activeRecord(s, x) &&
                    x.status === "Pending" &&
                    ["Manager", "Assessor"].includes(user.role) && (
                      <div className="button-row">
                        <button
                          className="text-link"
                          onClick={() =>
                            act("otj.decide", {
                              id: x.id,
                              learnerId: x.learnerId,
                              status: "Approved",
                            })
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="text-link danger-text"
                          onClick={() =>
                            setModal({ type: "otjDecision", item: x })
                          }
                        >
                          Return
                        </button>
                      </div>
                    )}
                </td>
              </tr>
            ))}
        </Table>
        {!items.length && <Empty>No learning logs in this view.</Empty>}
      </Panel>
    </>
  );
}
function Reviews({ learner }) {
  const { s, user, setModal, act } = useApp(),
    items = s.reviews
      .filter((x) => !learner || x.learnerId === learner.id)
      .slice()
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          String(b.createdAt || "").localeCompare(a.createdAt || ""),
      );
  const scheduled = s.appointments
    .filter(
      (a) =>
        a.source === "ten-week-review" &&
        a.status === "Planned" &&
        (!learner || a.learnerId === learner.id),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  return (
    <Panel
      title="Progress reviews"
      subtitle="Training, support, functional skills, KSBs, SMART targets and three-party agreement"
      action={
        ["Manager", "Assessor"].includes(user.role) && (
          <Button onClick={() => setModal({ type: "review", learner })}>
            <Plus size={15} />
            Record review
          </Button>
        )
      }
    >
      {scheduled.length > 0 && (
        <div className="review-series-upcoming">
          <h3>Scheduled 10-week reviews</h3>
          <p>
            The next reviews in the shared calendar. Open a review for its
            agenda and booking details.
          </p>
          {scheduled.map((a) => (
            <button
              className="review-planned-row"
              key={a.id}
              onClick={() =>
                setModal({
                  type: "sessionDetail",
                  item: a,
                  learner: s.learners.find((l) => l.id === a.learnerId),
                })
              }
            >
              <CalendarDays size={19} />
              <span>
                <strong>
                  {s.learners.find((l) => l.id === a.learnerId)?.name}
                </strong>
                <small>
                  {fmt(a.date)} · {a.allDay ? "Time to be confirmed" : a.time}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
      {items.map((r) => (
        <article className="review-record" data-review-id={r.id} key={r.id}>
          <div className="review-heading">
            <div className="calendar-tile">
              <span>
                {new Date(r.date + "T12:00:00").toLocaleDateString("en-GB", {
                  month: "short",
                })}
              </span>
              <strong>{Number(r.date.slice(-2))}</strong>
            </div>
            <div>
              <h3>{r.type}</h3>
              <p>
                <LearnerLink id={r.learnerId} /> · Recorded by {nameOf(s, r.by)}
              </p>
            </div>
            <span className="next-date">Next: {fmt(r.nextDate)}</span>
          </div>
          <p className="preserve-text">{r.text}</p>
          {[
            ["Learner voice", r.learnerVoice],
            ["Employer voice", r.employerVoice],
            ["Wellbeing & support", r.wellbeing],
            ["Next learning objectives", r.nextObjectives],
          ]
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div className="review-extra" key={label}>
                <strong>{label}</strong>
                <p className="preserve-text">{value}</p>
              </div>
            ))}
          <div className="agreed-actions">
            <strong>Agreed next steps</strong>
            <p>{r.actions}</p>
          </div>
          {r.template && (
            <details className="review-full-record">
              <summary>View the complete review</summary>
              <ReviewDetails review={r} />
            </details>
          )}
          <div className="review-agreement-status">
            {[
              ["Apprentice", "Learner"],
              ["Employer", "Employer"],
              ["Assessor", "Assessor"],
            ].map(([role, label]) => (
              <span
                key={role}
                className={
                  "tag " +
                  (r.acknowledgements.some(
                    (a) =>
                      a.role === role &&
                      (role !== "Assessor" ||
                        a.by ===
                          (r.template?.context.assessorId ||
                            s.learners.find((l) => l.id === r.learnerId)
                              ?.assessorId)),
                  )
                    ? "green"
                    : "neutral")
                }
              >
                {label}:{" "}
                {r.acknowledgements.some(
                  (a) =>
                    a.role === role &&
                    (role !== "Assessor" ||
                      a.by ===
                        (r.template?.context.assessorId ||
                          s.learners.find((l) => l.id === r.learnerId)
                            ?.assessorId)),
                )
                  ? "acknowledged"
                  : "awaiting acknowledgement"}
              </span>
            ))}
          </div>
          <div className="ack-row">
            {r.acknowledgements.map((a) => (
              <Tag key={a.by} tone="green">
                {a.name || nameOf(s, a.by)} ({a.role}) acknowledged ·{" "}
                {fmt(a.date)}
              </Tag>
            ))}
            {!r.acknowledgements.some((a) => a.by === user.id) && (
              <button
                className="text-link"
                onClick={() =>
                  act("review.ack", { id: r.id, learnerId: r.learnerId })
                }
              >
                <CheckCheck size={15} />
                Agree & acknowledge review
              </button>
            )}
          </div>
        </article>
      ))}
      {!items.length && <Empty>No reviews recorded yet.</Empty>}
      <p className="caption">
        Acknowledgements record the signed-in participant and time. They are not
        qualified electronic signatures.
      </p>
    </Panel>
  );
}
function Compliance({ learner }) {
  const { s, user, setModal } = useApp(),
    ls = learner ? [learner] : s.learners;
  return (
    <Panel
      title="Compliance radar"
      subtitle="Track insurance, workplace risk assessments and employer reviews. These checks support delivery oversight; they do not certify legal compliance."
    >
      <Table
        headers={[
          "Learner / employer",
          "ELI expiry",
          "Risk assessment",
          "Employer assessment",
          "Review due",
          "Data health",
          "",
        ]}
      >
        {ls.map((l) => (
          <tr key={l.id}>
            <td>
              <LearnerLink id={l.id} />
              <small>{l.employer}</small>
            </td>
            {["eliDue", "riskDue", "employerDue", "nextReview"].map((k) => (
              <td key={k}>
                <span
                  className={l[k] && l[k] < localDate() ? "danger-text" : ""}
                >
                  {fmt(l[k])}
                </span>
                {l[k] && l[k] < localDate() && (
                  <small className="danger-text">Overdue</small>
                )}
              </td>
            ))}
            <td>
              <Tag
                tone={
                  l.exceptions.some((e) => e.type === "data")
                    ? "amber"
                    : "green"
                }
              >
                {l.exceptions.some((e) => e.type === "data")
                  ? "Missing dates"
                  : "Dates recorded"}
              </Tag>
            </td>
            <td>
              {["Manager", "Assessor"].includes(user.role) && (
                <button
                  className="text-link"
                  onClick={() => setModal({ type: "learner", item: l })}
                >
                  Update <ArrowUpRight size={14} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {!ls.length && <Empty />}
    </Panel>
  );
}
function Gateway({ learner }) {
  const { s, user, setModal } = useApp(),
    ls = learner ? [learner] : s.learners;
  return (
    <Panel
      title="Gateway & end-point assessment"
      subtitle="Readiness is calculated from verified evidence, learning hours, functional skills and review/compliance dates. Final EPA eligibility requires provider checks."
    >
      <Table
        headers={[
          "Learner",
          "KSBs",
          "Learning hours",
          "Functional skills",
          "Readiness",
          "Gateway / EPA",
          "",
        ]}
      >
        {ls.map((l) => {
          const ready = l.gatewayChecks.every((x) => x[1]);
          return (
            <tr key={l.id}>
              <td>
                <LearnerLink id={l.id} />
                <small>{stdOf(s, l)}</small>
              </td>
              <td>
                {l.progress}%<Progress value={l.progress} />
              </td>
              <td>
                {l.hours} / {l.otjTarget}h
              </td>
              <td>
                <small>
                  English: {l.english}
                  {l.englishUpskill ? " · Upskill" : ""}
                  {l.englishNotRequired ? " · Not required" : ""}
                </small>
                <small>
                  Maths: {l.maths}
                  {l.mathsUpskill ? " · Upskill" : ""}
                  {l.mathsNotRequired ? " · Not required" : ""}
                </small>
              </td>
              <td>
                <Tag tone={ready ? "green" : "amber"}>
                  {ready ? "Checks passed" : "Not ready"}
                </Tag>
                <small>
                  {l.gatewayChecks.filter((x) => x[1]).length} /{" "}
                  {l.gatewayChecks.length} checks
                </small>
              </td>
              <td>
                <small>Gateway: {fmt(l.gatewayDate)}</small>
                <small>EPA: {fmt(l.epaDate)}</small>
              </td>
              <td>
                <button
                  className="text-link"
                  onClick={() => setModal({ type: "gateway", learner: l })}
                >
                  View checklist <ArrowUpRight size={14} />
                </button>
              </td>
            </tr>
          );
        })}
      </Table>
      {!ls.length && <Empty />}
    </Panel>
  );
}
function Analytics() {
  const { s, go } = useApp();
  const groups = ["Green", "Amber", "Red"].map((name) => ({
    name,
    count: s.learners.filter((l) => l.rag === name).length,
  }));
  return (
    <>
      <div className="metrics">
        <Metric
          label="Portfolio size"
          value={s.learners.length}
          detail="Visible apprentices"
          icon={Users}
        />
        <Metric
          label="Average coverage"
          value={
            (s.learners.length
              ? Math.round(
                  s.learners.reduce((n, l) => n + l.progress, 0) /
                    s.learners.length,
                )
              : 0) + "%"
          }
          detail="Verified KSB achievement"
          icon={Target}
        />
        <Metric
          label="Open actions"
          value={s.tasks.filter((x) => x.status === "Open").length}
          detail={`${s.tasks.filter((x) => x.status === "Open" && x.due < localDate()).length} overdue`}
          icon={ListChecks}
        />
        <Metric
          label="Learning approvals"
          value={s.otj.filter((x) => x.status === "Pending").length}
          detail="Pending off-the-job logs"
          icon={Clock}
        />
      </div>
      <div className="grid two">
        <Panel
          title="Risk distribution"
          subtitle="Calculated from today’s portfolio"
        >
          <BarChart items={groups} total={s.learners.length} />
        </Panel>
        <Panel
          title="Assessor caseload"
          subtitle="Learners allocated to each active assessor"
        >
          <BarChart
            items={s.users
              .filter((u) => u.role === "Assessor")
              .map((u) => ({
                name: u.name,
                count: s.learners.filter((l) => l.assessorId === u.id).length,
              }))}
            total={s.learners.length}
          />
        </Panel>
        <Panel
          title="Employer risk"
          subtitle="Number of learners requiring priority support"
        >
          <BarChart
            items={[...new Set(s.learners.map((l) => l.employer))].map(
              (name) => ({
                name,
                count: s.learners.filter(
                  (l) => l.employer === name && l.rag === "Red",
                ).length,
              }),
            )}
            total={s.learners.length}
          />
        </Panel>
        <Panel
          title="Delivery exceptions"
          subtitle="Count of active issues, rather than unique learners"
        >
          <BarChart
            items={[
              "review",
              "compliance",
              "progress",
              "data",
              "end",
              "skills",
            ].map((name) => ({
              name,
              count: s.learners
                .flatMap((l) => l.exceptions)
                .filter((e) => e.type === name).length,
            }))}
            total={Math.max(1, s.learners.flatMap((l) => l.exceptions).length)}
          />
        </Panel>
      </div>
      <div className="insight-note">
        <FileBarChart size={22} />
        <div>
          <strong>Take the detail with you.</strong>
          <p>
            Build filtered, grouped reports with a complete learner-level
            export.
          </p>
        </div>
        <Button secondary onClick={() => go("Report Studio")}>
          Open Report Studio <ArrowRight size={15} />
        </Button>
      </div>
    </>
  );
}
function BarChart({ items, total }) {
  return (
    <div className="bar-chart">
      {items.map((x) => (
        <div key={x.name}>
          <div>
            <span>{x.name}</span>
            <strong>{x.count}</strong>
          </div>
          <div className="bar-track">
            <i
              className={x.name.toLowerCase()}
              style={{
                width:
                  Math.max(
                    x.count ? 2 : 0,
                    (x.count / Math.max(1, total)) * 100,
                  ) + "%",
              }}
            />
          </div>
        </div>
      ))}
      {!items.length && <Empty />}
    </div>
  );
}
function Reports() {
  const { s, notify } = useApp(),
    [title, T] = useState("Apprenticeship portfolio report"),
    [q, Q] = useState(""),
    [rag, R] = useState(""),
    [status, S] = useState(""),
    [assessor, A] = useState(""),
    [employer, E] = useState(""),
    [standard, ST] = useState(""),
    [exception, EX] = useState(""),
    [group, G] = useState("assessor"),
    [min, MIN] = useState(""),
    [max, MAX] = useState(""),
    [from, F] = useState(""),
    [to, TO] = useState(""),
    [dateField, DF] = useState("nextReview"),
    [sort, SS] = useState("risk");
  let ls = s.learners.filter(
    (l) =>
      (!rag || l.rag === rag) &&
      (!status || l.status === status) &&
      (!assessor || l.assessorId === assessor) &&
      (!employer || l.employer === employer) &&
      (!standard || l.standardId === standard) &&
      (min === "" || l.progress >= Number(min)) &&
      (max === "" || l.progress <= Number(max)) &&
      (!from || (l[dateField] && l[dateField] >= from)) &&
      (!to || (l[dateField] && l[dateField] <= to)) &&
      (!exception || exception === "behind"
        ? !exception || l.variance < 0
        : exception === "gateway"
          ? l.gatewayStatus === "Ready"
          : l.exceptions.some((e) => e.type === exception)) &&
      `${l.name} ${l.employer} ${l.ref}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  ls.sort((a, b) =>
    sort === "risk"
      ? ["Red", "Amber", "Green"].indexOf(a.rag) -
        ["Red", "Amber", "Green"].indexOf(b.rag)
      : sort === "progress"
        ? a.progress - b.progress
        : a.name.localeCompare(b.name),
  );
  const rows = reportRows(ls, s),
    allFields = rows.length
      ? Object.keys(rows[0])
      : Object.keys(
          reportRows([{ ...s.learners[0], ref: "", name: "" }], s)[0],
        ),
    [fields, FIELDS] = useState([
      "ref",
      "name",
      "employer",
      "assessor",
      "progress",
      "target",
      "variance",
      "rag",
      "nextReview",
    ]);
  const selectedRows = rows.map((r) =>
      Object.fromEntries(fields.map((f) => [f, r[f]])),
    ),
    groups = {};
  for (const r of rows) {
    const key = r[group] || "Unassigned";
    groups[key] = (groups[key] || 0) + 1;
  }
  async function excel() {
    try {
      const ExcelJS = await import("exceljs");
      const wb = new (ExcelJS.default || ExcelJS).Workbook(),
        ws = wb.addWorksheet("Portfolio");
      ws.columns = fields.map((f) => ({ header: f, key: f, width: 24 }));
      ws.addRows(selectedRows);
      download(
        "portfolio-report.xlsx",
        await wb.xlsx.writeBuffer(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <>
      <Panel
        title="Report controls"
        subtitle="Choose your cohort, date range and fields. The report updates as you filter."
        action={
          <div className="button-row">
            <Button
              secondary
              disabled={!fields.length}
              onClick={() =>
                download("portfolio-report.csv", csv(selectedRows), "text/csv")
              }
            >
              <Download size={14} />
              CSV
            </Button>
            <Button secondary disabled={!fields.length} onClick={excel}>
              Excel
            </Button>
            <Button secondary onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        }
      >
        <div className="report-title-input">
          <label>
            Report title
            <input value={title} onChange={(e) => T(e.target.value)} />
          </label>
        </div>
        <FilterBar
          query={q}
          setQuery={Q}
          filters={[
            {
              label: "All RAG",
              value: rag,
              set: R,
              options: ["Red", "Amber", "Green"],
            },
            {
              label: "All statuses",
              value: status,
              set: S,
              options: ["Active", "Paused", "Withdrawn", "Completed"],
            },
            {
              label: "All assessors",
              value: assessor,
              set: A,
              options: s.users
                .filter((u) => u.role === "Assessor")
                .map((u) => ({ value: u.id, label: u.name })),
            },
          ]}
        />
        <div className="report-controls">
          <label>
            Employer
            <select value={employer} onChange={(e) => E(e.target.value)}>
              <option value="">All employers</option>
              {[...new Set(s.learners.map((l) => l.employer))].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Standard
            <select value={standard} onChange={(e) => ST(e.target.value)}>
              <option value="">All standards</option>
              {s.standards.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Exception filter
            <select value={exception} onChange={(e) => EX(e.target.value)}>
              <option value="">No exception filter</option>
              <option value="review">Overdue reviews</option>
              <option value="compliance">Compliance exceptions</option>
              <option value="behind">Behind target</option>
              <option value="gateway">Gateway ready</option>
            </select>
          </label>
          <label>
            Min progress %
            <input
              type="number"
              min="0"
              max="100"
              value={min}
              onChange={(e) => MIN(e.target.value)}
            />
          </label>
          <label>
            Max progress %
            <input
              type="number"
              min="0"
              max="100"
              value={max}
              onChange={(e) => MAX(e.target.value)}
            />
          </label>
          <label>
            Date field
            <select value={dateField} onChange={(e) => DF(e.target.value)}>
              <option value="nextReview">Next review</option>
              <option value="plannedEnd">Planned end</option>
              <option value="predictedEnd">Predicted end</option>
              <option value="eliDue">Insurance expiry</option>
              <option value="riskDue">Risk assessment</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => F(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => TO(e.target.value)}
            />
          </label>
          <label>
            Group by
            <select value={group} onChange={(e) => G(e.target.value)}>
              {[
                "assessor",
                "employer",
                "standard",
                "rag",
                "status",
                "level",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(e) => SS(e.target.value)}>
              <option value="risk">Risk priority</option>
              <option value="progress">Progress low–high</option>
              <option value="name">Learner A–Z</option>
            </select>
          </label>
        </div>
        <details className="field-picker">
          <summary>Report fields · {fields.length} selected</summary>
          <div>
            {allFields.map((f) => (
              <label key={f}>
                <input
                  type="checkbox"
                  checked={fields.includes(f)}
                  onChange={(e) =>
                    FIELDS(
                      e.target.checked
                        ? [...fields, f]
                        : fields.filter((x) => x !== f),
                    )
                  }
                />
                {f}
              </label>
            ))}
          </div>
        </details>
      </Panel>
      <div className="print-report">
        <div className="report-heading">
          <span className="eyebrow">PORTFOLIO INTELLIGENCE</span>
          <h2>{title}</h2>
          <p>
            Generated {fmt(localDate())} · {ls.length} records ·{" "}
            {workspaceLabel()}
          </p>
        </div>
        <div className="metrics three">
          <Metric
            label="Records"
            value={ls.length}
            detail="Matching selected filters"
          />
          <Metric
            label="Average progress"
            value={
              (ls.length
                ? Math.round(ls.reduce((n, l) => n + l.progress, 0) / ls.length)
                : 0) + "%"
            }
            detail="Verified standard coverage"
          />
          <Metric
            label="Red risk"
            value={ls.filter((l) => l.rag === "Red").length}
            detail="Priority support in this cohort"
          />
        </div>
        <Panel title="Portfolio breakdown" subtitle={"Grouped by " + group}>
          <BarChart
            items={Object.entries(groups).map(([name, count]) => ({
              name,
              count,
            }))}
            total={ls.length}
          />
        </Panel>
        <Panel
          title="Detailed learner data"
          subtitle="Underlying records supporting this report"
        >
          <Table headers={fields}>
            {selectedRows.map((r, i) => (
              <tr key={ls[i].id}>
                {fields.map((f) => (
                  <td key={f}>{String(r[f] ?? "")}</td>
                ))}
              </tr>
            ))}
          </Table>
          {!ls.length && <Empty>No learners match the report filters.</Empty>}
        </Panel>
      </div>
    </>
  );
}
function workspaceLabel() {
  return "current workspace data";
}
function Standards() {
  const { s, user, setModal, learnerId } = useApp(),
    [selected, S] = useState(s.standards[0]?.id || ""),
    library =
      user.role === "Apprentice"
        ? s.standards.filter((st) =>
            s.learners.some((l) => l.standardId === st.id),
          )
        : s.standards,
    st = library.find((x) => x.id === selected) || library[0];
  return (
    <>
      <Panel
        title="Standard library"
        subtitle="Programme KSBs and standard assignments. One standard version per course."
        action={
          ["Manager", "IQA"].includes(user.role) && (
            <Button onClick={() => setModal({ type: "standard" })}>
              <Plus size={15} />
              Create standard
            </Button>
          )
        }
      >
        <div className="standard-cards">
          {library.map((x) => (
            <div className="standard-card-entry" key={x.id}>
              <button
                aria-pressed={st?.id === x.id}
                className={
                  "standard-card " + (st?.id === x.id ? "selected" : "")
                }
                onClick={() => S(x.id)}
              >
                <div className="icon-tile">
                  <BookOpen size={21} />
                </div>
                <span>LEVEL {x.level}</span>
                <h3>{x.name}</h3>
                <p>{x.reference}</p>
                <small>
                  {x.criteria.length} KSB criteria · {x.version}
                </small>
                <ArrowUpRight size={18} />
              </button>
              {["Manager", "IQA"].includes(user.role) && (
                <Button
                  secondary
                  onClick={() => setModal({ type: "standard", item: x })}
                  aria-label={`Edit standard: ${x.name}`}
                >
                  Edit standard & KSBs
                </Button>
              )}
            </div>
          ))}
        </div>
        {!s.standards.length && (
          <Empty>Create a standard, then add learners to it.</Empty>
        )}
      </Panel>
      {["Manager", "Assessor"].includes(user.role) && (
        <Panel
          title="Apprentice standard assignments"
          subtitle="Choose the right programme for each apprentice. Programme changes preserve historic evidence and hours."
        >
          <Table
            headers={[
              "Apprentice",
              "Assigned standard",
              "Verified progress",
              "Action",
            ]}
          >
            {s.learners.map((l) => (
              <tr key={l.id}>
                <td>
                  <LearnerLink id={l.id} />
                </td>
                <td>{stdOf(s, l)}</td>
                <td>{l.progress}%</td>
                <td>
                  <button
                    className="text-link"
                    onClick={() =>
                      setModal({ type: "assignStandard", learner: l })
                    }
                  >
                    Assign standard <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
      {st && (
        <Panel
          title={st.name + " · criteria"}
          subtitle={st.version}
          action={
            ["Manager", "IQA"].includes(user.role) && (
              <Button onClick={() => setModal({ type: "standard", item: st })}>
                Edit standard & KSBs
              </Button>
            )
          }
        >
          <Table headers={["Code", "Type", "Full criterion wording"]}>
            {st.criteria.map((c) => (
              <tr key={c.code}>
                <td>
                  <b className="code">{c.code}</b>
                </td>
                <td>{c.type}</td>
                <td>{c.text}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </>
  );
}
function Resources() {
  const { s, user, setModal } = useApp(),
    [q, Q] = useState(""),
    [library, LIBRARY] = useState(""),
    libraries = s.standards.filter(
      (st) =>
        ["Manager", "Assessor", "IQA"].includes(user.role) ||
        s.learners.some((l) => l.standardId === st.id),
    ),
    items = s.resources.filter(
      (r) =>
        (!library ||
          (library === "shared" ? !r.standardId : r.standardId === library)) &&
        `${r.title} ${r.description} ${r.category}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    );
  return (
    <Panel
      title="Learning resource library"
      subtitle="Guidance, learning materials, policies and EPA preparation"
      action={
        ["Manager", "Assessor", "IQA"].includes(user.role) && (
          <Button
            onClick={() =>
              setModal({
                type: "resource",
                standardId: library === "shared" ? "" : library,
              })
            }
          >
            <Plus size={15} />
            Add resource
          </Button>
        )
      }
    >
      <label>
        Resource library
        <select
          aria-label="Resource library"
          value={library}
          onChange={(e) => LIBRARY(e.target.value)}
        >
          <option value="">All libraries</option>
          <option value="shared">Shared resources</option>
          {libraries.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name} ·{" "}
              {s.resources.filter((r) => r.standardId === st.id).length}{" "}
              resources
            </option>
          ))}
        </select>
      </label>
      {library && library !== "shared" && (
        <h3>
          {libraries.find((st) => st.id === library)?.name} resource library
        </h3>
      )}
      <div className="searchbox resource-search">
        <Search size={17} />
        <input
          aria-label="Search resources"
          placeholder="Search your resources…"
          value={q}
          onChange={(e) => Q(e.target.value)}
        />
      </div>
      <div className="resource-grid">
        {items.map((r) => (
          <article className="resource-card" key={r.id}>
            <div className="icon-tile">
              <FileText size={23} />
            </div>
            <span className="eyebrow">{r.category}</span>
            <h3>{r.title}</h3>
            <p>{r.description}</p>
            <small>
              {s.standards.find((x) => x.id === r.standardId)?.name ||
                "All standards"}
            </small>
            {r.url && (
              <a
                className="text-link"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                Open resource <ExternalLink size={13} />
              </a>
            )}
            <Files files={r.files} />
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty>
          This library is ready. Add learning materials, templates, links and
          files for this standard.
        </Empty>
      )}
    </Panel>
  );
}
function Files({ files = [] }) {
  return (
    <div className="attachment-list">
      {files.map((f) => (
        <a
          key={f.id}
          href={sessionLink("/api/files/" + f.id)}
          className="attachment"
        >
          <FileText size={15} />
          <span>{f.name}</span>
          <small>{Math.ceil(f.size / 1024)} KB</small>
          <Download size={14} />
        </a>
      ))}
    </div>
  );
}
function Calendar() {
  return <SchedulingWorkspace {...useApp()} />;
}
function LearningPlanPage() {
  return <LearningPlan {...useApp()} />;
}
function Messages() {
  const { s, user, command, notify } = useApp(),
    [recipient, R] = useState(""),
    [pending, P] = useState(false);
  const users = s.users.filter((x) => x.id !== user.id && x.active !== false),
    selected = recipient || users[0]?.id || "",
    items = s.messages.filter(
      (m) =>
        (m.from === user.id && m.to === selected) ||
        (m.to === user.id && m.from === selected),
    );
  return (
    <Panel
      title="Workspace messages"
      subtitle="Messages are delivered to the recipient’s account. Email and SMS notifications are not connected."
    >
      <div className="messaging">
        <div className="contact-list">
          {users.map((u) => (
            <button
              className={selected === u.id ? "selected" : ""}
              key={u.id}
              onClick={() => R(u.id)}
            >
              <span className="avatar cool">{initials(u.name)}</span>
              <div>
                <strong>{u.name}</strong>
                <small>{u.role}</small>
              </div>
            </button>
          ))}
        </div>
        <div className="conversation">
          <div className="conversation-title">
            <MessageSquare size={18} />
            <h3>{nameOf(s, selected)}</h3>
          </div>
          <div className="message-history">
            {items.map((m) => (
              <div
                className={
                  "message " + (m.from === user.id ? "sent" : "received")
                }
                key={m.id}
              >
                <p>{m.text}</p>
                <small>
                  {nameOf(s, m.from)} ·{" "}
                  {new Date(m.date).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                  })}
                </small>
              </div>
            ))}
            {!items.length && (
              <Empty>Start a conversation about learning and progress.</Empty>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              P(true);
              try {
                await command("message.send", {
                  to: selected,
                  text: new FormData(form).get("message"),
                });
                form.reset();
              } catch (e) {
                notify(e.message);
              } finally {
                P(false);
              }
            }}
          >
            <label htmlFor="message">Your message</label>
            <textarea
              id="message"
              name="message"
              required
              maxLength={10000}
              placeholder="Share an update or ask a question…"
            />
            <div className="message-actions">
              <small>
                Replies sync automatically while the workspace is open.
              </small>
              <Button disabled={pending || !selected}>
                <Send size={15} />
                Send message
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Panel>
  );
}
function Employers() {
  const { s, go } = useApp();
  const groups = [...new Set(s.learners.map((l) => l.employer))];
  return (
    <Panel
      title="Employer partnerships"
      subtitle="A connected view of employer cohorts and delivery health"
    >
      <div className="employer-grid">
        {groups.map((name) => {
          const ls = s.learners.filter((l) => l.employer === name);
          return (
            <article className="employer-card" key={name}>
              <div className="icon-tile">
                <Building2 size={23} />
              </div>
              <h3>{name}</h3>
              <p>
                {ls.length} apprentices ·{" "}
                {ls.filter((l) => l.rag === "Red").length} at risk
              </p>
              <Progress
                value={ls.reduce((n, l) => n + l.progress, 0) / ls.length}
              />
              <small>
                Average KSB coverage{" "}
                {Math.round(ls.reduce((n, l) => n + l.progress, 0) / ls.length)}
                %
              </small>
              <details>
                <summary>View apprentices</summary>
                {ls.map((l) => (
                  <div className="employer-learner" key={l.id}>
                    <LearnerLink id={l.id} />
                    <Tag>{l.rag}</Tag>
                  </div>
                ))}
              </details>
            </article>
          );
        })}
      </div>
      {!groups.length && <Empty />}
    </Panel>
  );
}
function Forecast() {
  const { s } = useApp(),
    ls = s.learners.filter((l) => l.status === "Active");
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      name: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      key,
      count: ls.filter((l) => l.predictedEnd?.startsWith(key)).length,
    };
  });
  return (
    <>
      <div className="metrics three">
        <Metric
          label="Planned completion"
          value={
            ls.filter(
              (l) =>
                l.plannedEnd &&
                l.plannedEnd <=
                  new Date(Date.now() + 90 * 86400000)
                    .toISOString()
                    .slice(0, 10),
            ).length
          }
          detail="Active learners ending within 90 days"
        />
        <Metric
          label="Completion slippage"
          value={ls.filter((l) => l.predictedEnd > l.plannedEnd).length}
          detail="Predicted end beyond planned end"
        />
        <Metric
          label="Gateway ready"
          value={ls.filter((l) => l.gatewayChecks.every((x) => x[1])).length}
          detail="All configured checks passed"
        />
      </div>
      <Panel
        title="Predicted completions"
        subtitle="Based on entered predicted end dates; this is a planning view, not an AI prediction"
      >
        <BarChart
          items={months}
          total={Math.max(1, ...months.map((x) => x.count))}
        />
      </Panel>
      <Panel title="Completion planning">
        <Table
          headers={[
            "Learner",
            "Planned end",
            "Predicted end",
            "Variance",
            "KSB progress",
          ]}
        >
          {ls.map((l) => (
            <tr key={l.id}>
              <td>
                <LearnerLink id={l.id} />
              </td>
              <td>{fmt(l.plannedEnd)}</td>
              <td>{fmt(l.predictedEnd)}</td>
              <td>
                {l.plannedEnd && l.predictedEnd
                  ? Math.round(
                      (Date.parse(l.predictedEnd) - Date.parse(l.plannedEnd)) /
                        86400000,
                    ) + " days"
                  : "Not set"}
              </td>
              <td>{l.progress}%</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
function Team() {
  const ctx = useApp();
  const { s, user, setModal } = ctx;
  return (
    <>
      <Panel
        title="Team & caseloads"
        subtitle="Role-based access is enforced by the server, including learner and employer scoping"
        action={
          user.role === "Manager" && (
            <Button onClick={() => setModal({ type: "user" })}>
              <Plus size={15} />
              Add account
            </Button>
          )
        }
      >
        <Table
          headers={[
            "Team member",
            "Role",
            "Caseload",
            "At-risk learners",
            "Account",
          ]}
        >
          {s.users.map((u) => {
            const ls = s.learners.filter(
              (l) =>
                u.role === "Manager" ||
                l.assessorId === u.id ||
                l.iqaId === u.id ||
                l.id === u.learnerId ||
                l.employer === u.employer,
            );
            return (
              <tr key={u.id}>
                <td>
                  <div className="person-inline">
                    <span className="avatar cool">{initials(u.name)}</span>
                    <strong>{u.name}</strong>
                  </div>
                </td>
                <td>
                  <Tag tone="blue">
                    {u.role === "Manager" ? "Master user" : u.role}
                  </Tag>
                </td>
                <td>{ls.length}</td>
                <td>{ls.filter((l) => l.rag === "Red").length}</td>
                <td>
                  {u.email || "Restricted"}
                  {user.role === "Manager" && (
                    <button
                      className="text-link"
                      onClick={() => setModal({ type: "user", item: u })}
                    >
                      Edit access & caseload
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="caption">
          Manage account roles, linked learners and employers, and assessor/IQA
          caseloads.
        </p>
      </Panel>
      <AccountControls {...ctx} />
    </>
  );
}
function Quality() {
  const { s, user, setModal, act } = useApp(),
    [tab, T] = useState("Sampling plan");
  const samples = s.quality,
    eligible = s.evidence.filter((e) => e.status === "Accepted");
  return (
    <>
      <div className="tabs">
        {[
          "Sampling plan",
          "Quality sampling",
          "Audit trail",
          "Data quality",
          "Recovery snapshots",
        ].map((t) => (
          <button
            className={t === tab ? "selected" : ""}
            onClick={() => T(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Sampling plan" ? (
        <SamplingPlanner {...{ s, user, setModal, act }} />
      ) : tab === "Quality sampling" ? (
        <>
          <Panel
            title="Internal quality assurance"
            subtitle="Sample accepted assessment decisions and record IQA findings"
            action={
              ["Manager", "IQA"].includes(user.role) && (
                <Button onClick={() => setModal({ type: "quality" })}>
                  <Plus size={15} />
                  Record sample
                </Button>
              )
            }
          >
            <Table
              headers={[
                "Learner",
                "Evidence",
                "Finding",
                "IQA notes",
                "Recorded by",
              ]}
            >
              {samples.map((q) => (
                <tr key={q.id}>
                  <td>
                    <LearnerLink id={q.learnerId} />
                  </td>
                  <td>
                    {s.evidence.find((e) => e.id === q.evidenceId)?.title}
                  </td>
                  <td>
                    <Tag>{q.outcome}</Tag>
                  </td>
                  <td className="wide-cell">{q.notes}</td>
                  <td>
                    {nameOf(s, q.by)}
                    <small>{fmt(q.date)}</small>
                  </td>
                </tr>
              ))}
            </Table>
            {!samples.length && <Empty>No quality samples recorded yet.</Empty>}
          </Panel>
          <Panel title="Accepted evidence available for sampling">
            <Table
              headers={["Evidence", "Learner", "Assessor feedback", "Samples"]}
            >
              {eligible.map((e) => (
                <tr key={e.id}>
                  <td>{e.title}</td>
                  <td>
                    <LearnerLink id={e.learnerId} />
                  </td>
                  <td className="wide-cell">{e.feedback}</td>
                  <td>{samples.filter((q) => q.evidenceId === e.id).length}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      ) : tab === "Audit trail" ? (
        <Panel
          title="Workspace audit trail"
          subtitle="Server-recorded activity, actor, role and timestamp"
        >
          <Table headers={["When", "Actor", "Role", "Operation", "Learner"]}>
            {s.audit.map((a) => (
              <tr key={a.id}>
                <td>
                  {new Date(a.date).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                  })}
                </td>
                <td>{a.actor}</td>
                <td>{a.role}</td>
                <td>
                  <code>{a.action}</code>
                </td>
                <td>
                  {a.learnerId ? <LearnerLink id={a.learnerId} /> : "Workspace"}
                </td>
              </tr>
            ))}
          </Table>
          {!s.audit.length && (
            <Empty>New activity will appear here as changes are saved.</Empty>
          )}
        </Panel>
      ) : tab === "Data quality" ? (
        <Panel
          title="Data quality checks"
          subtitle="Missing dates, contact details and programme planning fields"
        >
          <Table headers={["Learner", "Missing fields", "Delivery exceptions"]}>
            {s.learners.map((l) => {
              const missing = [
                "email",
                "nextReview",
                "plannedEnd",
                "predictedEnd",
                "eliDue",
                "riskDue",
                "employerDue",
              ].filter((k) => !l[k]);
              return (
                <tr key={l.id}>
                  <td>
                    <LearnerLink id={l.id} />
                  </td>
                  <td>
                    {missing.length ? (
                      missing.join(", ")
                    ) : (
                      <Tag tone="green">Core fields complete</Tag>
                    )}
                  </td>
                  <td>{l.exceptions.length}</td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      ) : (
        <Panel
          title="Recovery snapshots"
          subtitle="Manager-only workspace recovery. Keeps the latest five snapshots in the same database; this is not an external backup."
          action={
            user.role === "Manager" && (
              <Button onClick={() => act("snapshot.create", {})}>
                <Plus size={15} />
                Create snapshot
              </Button>
            )
          }
        >
          {s.snapshots.map((x) => (
            <div className="snapshot-row" key={x.id}>
              <History size={20} />
              <div>
                <strong>{new Date(x.date).toLocaleString("en-GB")}</strong>
                <small>Created by {nameOf(s, x.by)}</small>
              </div>
              <Button
                secondary
                onClick={() => setModal({ type: "restore", item: x })}
              >
                Restore snapshot
              </Button>
            </div>
          ))}
          {!s.snapshots.length && (
            <Empty>
              {user.role === "Manager"
                ? "Create a snapshot before a bulk import or major update."
                : "Only managers can view and restore snapshots."}
            </Empty>
          )}
        </Panel>
      )}
    </>
  );
}
function SettingsPage() {
  const ctx = useApp();
  const { s, user, demo, setModal, notify } = ctx;
  return (
    <>
      <EmailSettings {...ctx} />
      <ProductionStatus {...ctx} />
      <div className="grid two">
        <Panel
          title="Your workspace"
          subtitle="Connected apprenticeship delivery"
        >
          <Detail label="Signed in" value={user.name} />
          <Detail label="Role" value={user.role} />
          <Detail label="Database" value="SQLite · server-side storage" />
          <Detail
            label="Environment"
            value={demo?.enabled ? "Training workspace" : "Production mode"}
          />
          <Detail label="Workspace revision" value={s.revision} />
          <Button secondary onClick={() => setModal({ type: "password" })}>
            <LockKeyhole size={15} />
            Change password
          </Button>
        </Panel>
        <Panel
          title="Export your visible data"
          subtitle="Includes records visible to your role; attachments are downloaded separately"
        >
          <p className="body-copy">
            Export your workspace records as JSON or download a learner-level
            CSV for analysis. Server-held files remain protected by the
            account’s access permissions.
          </p>
          <div className="button-row">
            <Button
              secondary
              onClick={() =>
                download("archetype-workspace.json", JSON.stringify(s, null, 2))
              }
            >
              <Download size={15} />
              Export JSON
            </Button>
            <Button
              secondary
              onClick={() =>
                download(
                  "archetype-learners.csv",
                  csv(reportRows(s.learners, s)),
                  "text/csv",
                )
              }
            >
              Export CSV
            </Button>
          </div>
          <button
            className="text-link legacy-export"
            onClick={() => {
              const evidence = localStorage.getItem("archetype-evidence"),
                messages = localStorage.getItem("archetype-messages");
              if (!evidence && !messages)
                return notify(
                  "No legacy prototype data found in this browser.",
                );
              download(
                "archetype-legacy-browser-data.json",
                JSON.stringify({
                  evidence: evidence ? JSON.parse(evidence) : [],
                  messages: messages ? JSON.parse(messages) : [],
                }),
              );
            }}
          >
            Export older prototype data from this browser
          </button>
        </Panel>
      </div>
      <Panel title="Platform capabilities & boundaries">
        <div className="capability-grid">
          <div>
            <h3>Connected workflows</h3>
            <p>
              Learner records, portfolio evidence, KSB mapping, assessment
              decisions, verified coverage, learning logs, review
              acknowledgements, action plans, compliance dates, gateway
              checklists, resources, appointments, messages, reporting, IQA,
              audit and recovery snapshots.
            </p>
          </div>
          <div>
            <h3>Before live delivery</h3>
            <p>
              Complete organisational security and accessibility review,
              configure HTTPS and secure cookies, arrange external backups,
              verify your standards and funding rules, and add malware scanning.
              Email/SMS, SSO, ILR/MIS integrations, EPA-provider integrations,
              video capture and qualified e-signatures are not included.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
function Login({ demo, onLogin, error, message, initialEmail = "" }) {
  const [err, E] = useState(""),
    [busy, B] = useState(false),
    [email, EM] = useState(initialEmail),
    [pw, PW] = useState("");
  return (
    <div className="reference-login">
      <div className="reference-login-brand">
        <span className="login-brand-icon">
          <Layers size={26} />
        </span>
        <div>
          <strong>
            archetype<span>.</span>
          </strong>
          <small>WBL INTELLIGENCE</small>
        </div>
      </div>
      <div className="reference-login-card">
        <span className="login-workspace-chip">
          <ShieldCheck size={14} />
          CONNECTED APPRENTICESHIP DELIVERY
        </span>
        <h1>Welcome to your workspace.</h1>
        <p>
          A dedicated experience for every role.
          <br />
          One connected picture of learning and progress.
        </p>
        {message && (
          <div className="login-password-success" role="status">
            {message}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            B(true);
            E("");
            try {
              await onLogin(email, pw);
            } catch (e) {
              E(e.message);
            } finally {
              B(false);
            }
          }}
        >
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => EM(e.target.value)}
              placeholder="you@yourorganisation.co.uk"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={pw}
              onChange={(e) => PW(e.target.value)}
            />
          </label>
          {(err || error) && (
            <div className="form-error" role="alert">
              {err || error}
            </div>
          )}
          <Button disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <PasswordRecovery compact />
        <div className="reference-login-security">
          <LockKeyhole size={13} />
          Individual accounts · role-based permissions · server-saved records
        </div>
      </div>
      <div className="reference-login-footer">
        APPRENTICESHIP DELIVERY & COMPLIANCE WORKSPACE
      </div>
    </div>
  );
}
function Field({
  label,
  name,
  type = "text",
  options,
  defaultValue,
  required = false,
  wide = false,
  ...props
}) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      {required && <span className="required"> *</span>}
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={defaultValue || ""}
          required={required}
          {...props}
        />
      ) : type === "select" ? (
        <select
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          {...props}
        >
          {options.map((o) =>
            typeof o === "string" ? (
              <option key={o} value={o}>
                {o}
              </option>
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
          defaultValue={defaultValue ?? ""}
          required={required}
          {...props}
        />
      )}
    </label>
  );
}
function ModalHost() {
  const {
      s,
      user,
      modal,
      setModal,
      command,
      notify,
      busy,
      learnerId,
      finishPasswordChange,
    } = useApp(),
    [error, E] = useState(""),
    [pending, P] = useState(false),
    [learnerEditTab, LEARNER_TAB] = useState("Programme"),
    [criteria, C] = useState(modal.item?.criteria || []),
    [raw, RAW] = useState(
      modal.type === "standard"
        ? (modal.item?.criteria || [])
            .map((c) => `${c.code}: ${c.text}`)
            .join("\n")
        : "",
    ),
    [parsed, PARSED] = useState(
      modal.type === "standard" ? modal.item?.criteria || [] : [],
    ),
    [importRows, IR] = useState(null),
    [trackerSheetRows, TSR] = useState(null),
    [trackerPreview, TP] = useState(null),
    [importError, IE] = useState("");
  const ref = useRef(null);
  const { type, item } = modal;
  const supportRecord =
    (s.learnerSupportRecords || []).find((r) => r.learnerId === item?.id) || {};
  const learner =
    s.learners.find((l) => l.id === modal.learner?.id) ||
    modal.learner ||
    s.learners.find((l) => l.id === learnerId);
  const title = {
    learner: item ? "Edit apprentice" : "Add apprentice",
    evidence: item ? "Edit & resubmit evidence" : "Add portfolio evidence",
    evidenceDetail: "Evidence & assessment",
    otj: "Record off-the-job learning",
    otjDecision: "Return learning log",
    task: "Create an action",
    standard: item ? "Edit standard & KSBs" : "Create apprenticeship standard",
    assignStandard: "Assign apprenticeship standard",
    resource: "Add learning resource",
    appointment: "Schedule appointment",
    quality: "Record IQA sample",
    gateway: "Gateway readiness",
    user: item ? "Edit account access & caseload" : "Add workspace account",
    password: "Change your password",
    import: "Import apprentice records",
    restore: "Restore recovery snapshot",
  }[type];
  useEffect(() => {
    const previous = document.activeElement,
      el = ref.current;
    el?.querySelector("input,select,textarea,button")?.focus();
    const key = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...el.querySelectorAll("button,input,select,textarea,a[href]"),
        ].filter((x) => !x.disabled && x.offsetParent !== null);
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
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const userOptions = (role) =>
    s.users
      .filter((u) => u.role === role && u.active !== false)
      .map((u) => ({ value: u.id, label: u.name }));
  const standards = s.standards.map((x) => ({
    value: x.id,
    label: x.name + " · L" + x.level,
  }));
  const learners = s.learners.map((x) => ({ value: x.id, label: x.name }));
  const learnerField = !modal.learner && (
    <Field
      label="Apprentice"
      name="learnerId"
      type="select"
      defaultValue={learner?.id}
      options={[{ value: "", label: "Select apprentice" }, ...learners]}
      required
      wide
    />
  );
  const st = s.standards.find((x) => x.id === learner?.standardId);
  async function submit(e) {
    e.preventDefault();
    E("");
    if (type === "learner" && !e.currentTarget.checkValidity()) {
      const invalid = e.currentTarget.querySelector(":invalid");
      LEARNER_TAB(
        invalid?.closest("[data-learner-tab]")?.dataset.learnerTab ||
          "Programme",
      );
      E("Complete the required apprentice details before saving.");
      requestAnimationFrame(() => invalid?.focus());
      return;
    }
    P(true);
    try {
      const form = new FormData(e.currentTarget),
        p = Object.fromEntries(form);
      if (modal.learner) p.learnerId = modal.learner.id;
      let kind;
      if (type === "learner") {
        p.englishUpskill = form.get("englishUpskill") === "on";
        p.mathsUpskill = form.get("mathsUpskill") === "on";
        p.supportFiles = await filePayload(
          form.getAll("supportFiles").filter((f) => f.size),
        );
        kind = "learner.save";
        if (item) p.id = item.id;
      } else if (type === "evidence") {
        kind = "evidence.save";
        p.learnerId = learner.id;
        p.criteria = criteria;
        if (item) p.id = item.id;
        p.files = await filePayload(form.getAll("files").filter((f) => f.size));
      } else if (type === "evidenceDetail") {
        kind = "evidence.assess";
        p.files = await filePayload(form.getAll("files").filter((f) => f.size));
        p.id = item.id;
        p.learnerId = item.learnerId;
      } else if (type === "assignStandard") {
        kind = "learner.assignStandard";
        p.learnerId = learner.id;
      } else if (type === "standard") {
        kind = "standard.save";
        p.criteria = parsed;
        if (item) p.id = item.id;
      } else if (type === "otj") kind = "otj.add";
      else if (type === "otjDecision") {
        kind = "otj.decide";
        p.id = item.id;
        p.learnerId = item.learnerId;
        p.status = "Returned";
      } else if (type === "task") kind = "task.add";
      else if (type === "resource") {
        kind = "resource.add";
        p.files = await filePayload(form.getAll("files").filter((f) => f.size));
      } else if (type === "appointment") kind = "appointment.add";
      else if (type === "quality") kind = "quality.add";
      else if (type === "gateway") {
        kind = "gateway.record";
        p.learnerId = learner.id;
      } else if (type === "user") {
        kind = item ? "user.update" : "user.add";
        if (item) p.id = item.id;
        p.caseload = form.getAll("caseload");
      } else if (type === "password") {
        if (p.password !== p.confirm)
          throw Error("The new passwords do not match.");
        kind = "password.change";
      } else if (type === "import") {
        kind = trackerSheetRows ? "learners.importTracker" : "learners.import";
        if (trackerSheetRows) p.sheetRows = trackerSheetRows;
        else p.rows = importRows;
      } else if (type === "restore") {
        kind = "snapshot.restore";
        p.id = item.id;
      }
      await command(kind, p);
      setModal(null);
      if (type === "password") finishPasswordChange();
    } catch (e) {
      E(e.message);
    } finally {
      P(false);
    }
  }
  async function readImport(file) {
    IE("");
    IR(null);
    TSR(null);
    TP(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      IE("Import files must be smaller than 10 MB.");
      return;
    }
    try {
      const ExcelJS = await import("exceljs");
      const wb = new (ExcelJS.default || ExcelJS).Workbook();
      if (file.name.toLowerCase().endsWith(".csv")) {
        const sheet = wb.addWorksheet("Import");
        for (const row of parseCSV((await file.text()).replace(/^\uFEFF/, "")))
          sheet.addRow(row);
      } else await wb.xlsx.load(await file.arrayBuffer());
      const sheets = wb.worksheets;
      if (!sheets.length) throw Error("No worksheet found.");
      if (sheets.length > 1)
        notify("Importing the first worksheet: " + sheets[0].name);
      if (sheets[0].rowCount > 1100)
        throw Error("Maximum 1,000 learner rows per import.");
      const trackerCells = [];
      for (let n = 1; n <= sheets[0].rowCount; n++) {
        const row = sheets[0].getRow(n);
        trackerCells.push(
          Array.from({ length: 64 }, (_, i) => {
            const cell = row.getCell(i + 1);
            let value = cell.value;
            if (value && typeof value === "object" && !(value instanceof Date))
              value =
                value.result ??
                value.text ??
                (value.richText
                  ? value.richText.map((t) => t.text).join("")
                  : "");
            if (value instanceof Date) return value.toISOString().slice(0, 10);
            if (typeof value === "number" && cell.numFmt?.includes("%"))
              return String(value * 100) + "%";
            return ["string", "number", "boolean"].includes(typeof value)
              ? value
              : "";
          }),
        );
      }
      const tracker = parseTrackerSheet(trackerCells);
      if (tracker) {
        TSR(trackerCells);
        TP(tracker);
        IR(
          tracker.records.map((row) => ({
            ...row,
            standardId:
              s.standards.find(
                (st) =>
                  trackerCourseKey(st.name) === row.courseKey &&
                  Number(st.level) === row.level,
              )?.id || "",
          })),
        );
        return;
      }
      const rows = [];
      let headers = [];
      const value = (v) =>
        v && typeof v === "object"
          ? (v.text ??
            v.result ??
            (v.richText ? v.richText.map((x) => x.text).join("") : "") ??
            "")
          : v;
      sheets[0].eachRow((row, n) => {
        const cells = row.values.slice(1).map(value);
        if (n === 1) headers = cells.map((x) => String(x || "").trim());
        else if (cells.some((x) => x !== null && x !== undefined && x !== ""))
          rows.push(
            Object.fromEntries(headers.map((k, i) => [k, cells[i] ?? ""])),
          );
      });
      if (!rows.length) throw Error("The sheet has no records.");
      if (rows.length > 1000) throw Error("Maximum 1,000 records per import.");
      const mapped = rows.map((row) => {
        const pick = (...keys) => {
          for (const k of keys)
            if (row[k] !== undefined && row[k] !== "") return row[k];
          return "";
        };
        const standardValue = pick(
            "standardId",
            "standard",
            "Apprenticeship Title",
          ),
          standard = s.standards.find(
            (x) =>
              x.id === standardValue ||
              x.name.toLowerCase() === String(standardValue).toLowerCase(),
          );
        const person = (role, ...keys) => {
          const v = pick(...keys);
          return (
            s.users.find(
              (u) =>
                u.role === role &&
                (u.id === v ||
                  u.name.toLowerCase() === String(v).toLowerCase()),
            )?.id || v
          );
        };
        const dt = (...keys) => {
          const v = pick(...keys);
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === "number")
            return new Date((v - 25569) * 86400000).toISOString().slice(0, 10);
          return String(v).slice(0, 10);
        };
        return {
          ref: String(pick("ref", "Pro Ref No")),
          name: String(
            pick("name", "Learner") ||
              `${pick("First Name")} ${pick("Last Name")}`.trim(),
          ),
          email: String(pick("email", "Email")),
          employer: String(pick("employer", "Employer")),
          standardId: standard?.id || "",
          assessorId: person("Assessor", "assessorId", "assessor", "Assessor"),
          iqaId: person("IQA", "iqaId", "IQA"),
          status: pick("status", "Status") || "Active",
          target: pick("target", "Target Progress %") || 0,
          otjTarget: pick("otjTarget", "OTJ Target Hours") || 278,
          startDate: dt("startDate", "Start Date"),
          plannedEnd: dt("plannedEnd", "Planned End Date"),
          predictedEnd: dt("predictedEnd", "Predicted End Date"),
          ...(Object.hasOwn(row, "initialReviewDate") ||
          Object.hasOwn(row, "Initial Review Date")
            ? {
                initialReviewDate: dt(
                  "initialReviewDate",
                  "Initial Review Date",
                ),
              }
            : {}),
          nextReview: dt("nextReview", "Next Review Due"),
          eliDue: dt("eliDue", "ELI DUE"),
          riskDue: dt("riskDue", "Risk Assessment Due"),
          employerDue: dt("employerDue", "Employer Assessment Due"),
          english: pick("english", "Functional Skills English") || "Pending",
          maths: pick("maths", "Functional Skills Maths") || "Pending",
          epaDate: dt("epaDate", "EPA Date"),
          notes: String(pick("notes", "RAG Reason")),
        };
      });
      IR(mapped);
    } catch (e) {
      IE("Could not read import: " + e.message);
    }
  }
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) setModal(null);
      }}
    >
      <section
        ref={ref}
        className={
          "modal " +
          (["standard", "import", "evidenceDetail"].includes(type)
            ? "modal-wide"
            : "")
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">YOUR CONNECTED WORKSPACE</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={pending}
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} noValidate={type === "learner"}>
          <div className="form-grid">
            {type === "assignStandard" && (
              <>
                <p className="body-copy wide">
                  Assign a standard to {learner?.name}. Previous evidence, hours
                  and assessment decisions are preserved against their original
                  standard. Verified progress and hours are calculated
                  separately for the newly assigned standard.
                </p>
                <Field
                  label="New apprenticeship standard"
                  name="standardId"
                  type="select"
                  options={[
                    { value: "", label: "Choose a different standard" },
                    ...standards.filter((x) => x.value !== learner?.standardId),
                  ]}
                  required
                  wide
                />
                <Field
                  label="Target progress %"
                  name="target"
                  type="number"
                  defaultValue="0"
                  min="0"
                  max="100"
                  required
                />
                <Field
                  label="OTJ target hours"
                  name="otjTarget"
                  type="number"
                  defaultValue={learner?.otjTarget || 278}
                  min="1"
                  max="10000"
                  required
                />
                <Field
                  label="Assignment reason"
                  name="reason"
                  type="textarea"
                  placeholder="Record why the programme or standard is changing."
                  required
                  wide
                />
                <label className="checkbox-label wide">
                  <input type="checkbox" required />I understand that previous
                  programme evidence will be retained as history and will not
                  automatically count towards the new standard.
                </label>
              </>
            )}
            {type === "learner" && (
              <>
                <div
                  className="tabs learner-edit-tabs wide"
                  role="tablist"
                  aria-label="Apprentice details"
                >
                  {["Programme", "Personal & ALS", "Documents"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={learnerEditTab === tab}
                      className={learnerEditTab === tab ? "selected" : ""}
                      onClick={() => LEARNER_TAB(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div
                  className="form-grid wide learner-edit-section"
                  data-learner-tab="Programme"
                  hidden={learnerEditTab !== "Programme"}
                  role="tabpanel"
                  aria-label="Programme"
                >
                  <Field
                    label="Reference"
                    name="ref"
                    defaultValue={item?.ref}
                    required
                  />
                  <Field
                    label="Learner name"
                    name="name"
                    defaultValue={item?.name}
                    required
                  />
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    defaultValue={item?.email}
                  />
                  <Field
                    label="Employer"
                    name="employer"
                    defaultValue={item?.employer}
                    required
                  />
                  {item && (
                    <input
                      type="hidden"
                      name="standardId"
                      value={item.standardId}
                    />
                  )}
                  <Field
                    label="Apprenticeship standard"
                    name="standardId"
                    type="select"
                    options={[
                      { value: "", label: "Choose standard" },
                      ...standards,
                    ]}
                    defaultValue={item?.standardId}
                    disabled={Boolean(item)}
                    required
                  />
                  <Field
                    label="Status"
                    name="status"
                    type="select"
                    options={["Active", "Paused", "Withdrawn", "Completed"]}
                    defaultValue={item?.status || "Active"}
                  />
                  <Field
                    label="Assessor"
                    name="assessorId"
                    type="select"
                    options={userOptions("Assessor")}
                    defaultValue={item?.assessorId || user.id}
                  />
                  <Field
                    label="IQA"
                    name="iqaId"
                    type="select"
                    options={userOptions("IQA")}
                    defaultValue={item?.iqaId}
                  />
                  <Field
                    label="Target progress %"
                    name="target"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={item?.target ?? 0}
                    required
                  />
                  <Field
                    label="OTJ target hours"
                    name="otjTarget"
                    type="number"
                    min="1"
                    max="10000"
                    defaultValue={item?.otjTarget ?? 278}
                    required
                  />
                  {user.role === "Manager" && (
                    <div className="wide review-series-setup">
                      <h3>Automatic 10-week reviews</h3>
                      <Field
                        label="Initial 10-week review date"
                        name="initialReviewDate"
                        type="date"
                        defaultValue={
                          item?.initialReviewDate ??
                          (item?.nextReview &&
                          item?.predictedEnd &&
                          item.nextReview <= item.predictedEnd
                            ? item.nextReview
                            : "")
                        }
                      />
                      <p className="caption">
                        Creates a shared review on this date and every 70 days
                        through the predicted end date. The assessor, apprentice
                        and employer see the same calendar entries. Times and
                        locations remain to be confirmed. Changing the initial
                        date or predicted end updates the schedule; completed
                        reviews are kept. Clear the initial date to stop the
                        automatic series.
                      </p>
                    </div>
                  )}
                  {[
                    ["startDate", "Start date"],
                    ["plannedEnd", "Planned end date"],
                    ["predictedEnd", "Predicted end date"],
                    ["nextReview", "Next review due"],
                    ["eliDue", "ELI expiry"],
                    ["riskDue", "Risk assessment due"],
                    ["employerDue", "Employer assessment due"],
                    ["epaDate", "EPA date"],
                  ].map(([k, label]) => (
                    <Field
                      key={k}
                      label={label}
                      name={k}
                      type="date"
                      defaultValue={item?.[k]}
                    />
                  ))}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="englishUpskill"
                      defaultChecked={!!item?.englishUpskill}
                    />
                    English functional skills upskill option
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="mathsUpskill"
                      defaultChecked={!!item?.mathsUpskill}
                    />
                    Maths functional skills upskill option
                  </label>
                  <Field
                    label="English"
                    name="english"
                    type="select"
                    options={["Pending", "Achieved", "Exempt"]}
                    defaultValue={item?.english}
                  />
                  <Field
                    label="Maths"
                    name="maths"
                    type="select"
                    options={["Pending", "Achieved", "Exempt"]}
                    defaultValue={item?.maths}
                  />
                  <Field
                    label="Confidential staff notes (master admin and assessor)"
                    name="notes"
                    type="textarea"
                    defaultValue={item?.notes}
                    wide
                  />
                  <p className="caption wide">
                    Progress is calculated from accepted evidence, not an
                    editable percentage. Use Assign standard from the profile or
                    standard library to change a programme and retain its
                    history.
                  </p>
                </div>
                <div
                  className="form-grid wide learner-edit-section"
                  data-learner-tab="Personal & ALS"
                  hidden={learnerEditTab !== "Personal & ALS"}
                  role="tabpanel"
                  aria-label="Personal & ALS"
                >
                  <LearnerSupportFields record={supportRecord} />
                </div>
                <div
                  className="form-grid wide learner-edit-section"
                  data-learner-tab="Documents"
                  hidden={learnerEditTab !== "Documents"}
                  role="tabpanel"
                  aria-label="Documents"
                >
                  <LearnerDocuments
                    record={supportRecord}
                    learnerId={item?.id}
                    command={command}
                    busy={pending || busy}
                    onError={E}
                  />
                </div>
              </>
            )}
            {type === "evidence" && (
              <>
                <Field
                  label="Evidence title"
                  name="title"
                  defaultValue={item?.title}
                  required
                  wide
                />
                <Field
                  label="Evidence type"
                  name="type"
                  type="select"
                  options={[
                    "Work product",
                    "Observation",
                    "Witness testimony",
                    "Reflective account",
                    "Professional discussion",
                    "Assignment",
                    "Project",
                    "Photographic evidence",
                    "Other",
                  ]}
                  defaultValue={item?.type || "Reflective account"}
                />
                <Field
                  label="Evidence date"
                  name="date"
                  type="date"
                  defaultValue={item?.date || localDate()}
                  required
                />
                <Field
                  label="Reflection / commentary"
                  name="description"
                  type="textarea"
                  rows={4}
                  defaultValue={item?.description}
                  required
                  wide
                />
                <fieldset className="criteria-picker wide">
                  <legend>Map to knowledge, skills & behaviours</legend>
                  {st?.criteria.map((c) => (
                    <label key={c.code}>
                      <input
                        type="checkbox"
                        checked={criteria.includes(c.code)}
                        onChange={(e) =>
                          C(
                            e.target.checked
                              ? [...criteria, c.code]
                              : criteria.filter((x) => x !== c.code),
                          )
                        }
                      />
                      <strong>{c.code}</strong>
                      <span>{c.text}</span>
                    </label>
                  ))}
                </fieldset>
                <Field
                  label="Evidence attachments"
                  name="files"
                  type="file"
                  multiple
                  wide
                />
                <p className="caption wide">
                  Up to 5 new files, maximum 5 MB each. Files are stored on the
                  server and downloaded through authenticated access.
                </p>
                {item && (
                  <div className="wide">
                    <Files files={item.files} />
                  </div>
                )}
                <Field
                  label="Save as"
                  name="status"
                  type="select"
                  options={["Draft", "Submitted"]}
                  defaultValue={
                    item?.status === "Draft" ? "Draft" : "Submitted"
                  }
                />
              </>
            )}
            {type === "evidenceDetail" && (
              <div className="wide evidence-detail">
                <Tag>{item.status}</Tag>
                {item.standardId && item.standardId !== learner?.standardId && (
                  <p className="blue-callout">
                    Earlier standard:{" "}
                    {s.standards.find((st) => st.id === item.standardId)?.name}.
                    Retained for audit; it does not count towards the current
                    programme.
                  </p>
                )}
                <h3>{item.title}</h3>
                <p>
                  {item.type} · {fmt(item.date)} · {nameOf(s, item.by)}
                </p>
                <div className="code-list">
                  {item.criteria.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <p className="preserve-text">{item.description}</p>
                <Files files={item.files} />
                <IntegrityReport
                  evidence={item}
                  busy={pending || busy}
                  onRecheck={
                    ["Manager", "Assessor", "Apprentice"].includes(user.role)
                      ? async () => {
                          try {
                            await command("evidence.recheck", { id: item.id });
                            setModal({
                              ...modal,
                              item: {
                                ...item,
                                integrity: { status: "Queued" },
                              },
                            });
                          } catch (error) {
                            E(error.message);
                          }
                        }
                      : null
                  }
                />
                {item.feedback && (
                  <div className="feedback-box">
                    <strong>Assessor feedback</strong>
                    <p>{item.feedback}</p>
                    <Files files={item.feedbackFiles} />
                  </div>
                )}
                {item.revisions?.length > 0 && (
                  <details>
                    <summary>Evidence version history</summary>
                    {item.revisions.map((r, i) => (
                      <div className="decision-entry" key={i}>
                        <strong>
                          Version {i + 1} · {r.title} · {r.status}
                        </strong>
                        <p>
                          Saved before edit by {nameOf(s, r.by)} ·{" "}
                          {fmt(r.savedAt)}
                        </p>
                        <p className="preserve-text">{r.description}</p>
                        <p>{r.criteria.join(", ")}</p>
                        <Files files={r.files} />
                      </div>
                    ))}
                  </details>
                )}
                {item.decisions?.length > 0 && (
                  <details>
                    <summary>Assessment history</summary>
                    {item.decisions.map((d, i) => (
                      <div className="decision-entry" key={i}>
                        <strong>
                          {d.status} · {nameOf(s, d.by)} · {fmt(d.date)}
                        </strong>
                        <p>{d.feedback}</p>
                        <Files files={d.files} />
                        {d.evidence && (
                          <p>
                            Evidence assessed: {d.evidence.title} ·{" "}
                            {d.evidence.criteria.join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </details>
                )}
                {(!item.standardId ||
                  item.standardId === learner?.standardId) &&
                  (["Manager", "Assessor"].includes(user.role) ||
                    ["Draft", "Changes requested"].includes(item.status)) &&
                  ["Manager", "Assessor", "Apprentice"].includes(user.role) && (
                    <div className="button-row">
                      <Button
                        secondary
                        type="button"
                        onClick={() =>
                          setModal({ type: "evidence", item, learner })
                        }
                      >
                        Edit evidence & mapping
                      </Button>
                      {["Draft", "Changes requested"].includes(item.status) &&
                        item.criteria.length > 0 && (
                          <Button
                            type="button"
                            disabled={pending}
                            onClick={async () => {
                              P(true);
                              try {
                                await command("evidence.submit", {
                                  id: item.id,
                                  learnerId: item.learnerId,
                                });
                                setModal(null);
                              } catch (e) {
                                E(e.message);
                              } finally {
                                P(false);
                              }
                            }}
                          >
                            Submit evidence <Send size={15} />
                          </Button>
                        )}
                    </div>
                  )}
                {(!item.standardId ||
                  item.standardId === learner?.standardId) &&
                  ["Submitted", "Accepted", "Changes requested"].includes(
                    item.status,
                  ) &&
                  ["Manager", "Assessor"].includes(user.role) && (
                    <div className="assessment-form">
                      <Field
                        label={
                          item.status === "Submitted"
                            ? "Assessment decision"
                            : "Reassessment decision"
                        }
                        name="status"
                        type="select"
                        options={["Accepted", "Changes requested"]}
                      />
                      <Field
                        label="Assessor feedback"
                        name="feedback"
                        type="textarea"
                        rows={4}
                        defaultValue={item.feedback}
                        required
                      />
                      <Field
                        label="Attach assessor feedback files"
                        name="files"
                        type="file"
                        multiple
                        wide
                      />
                    </div>
                  )}
              </div>
            )}
            {type === "otj" && (
              <>
                {learnerField}
                <Field
                  label="Learning activity"
                  name="activity"
                  required
                  wide
                />
                <Field
                  label="Learning date"
                  name="date"
                  type="date"
                  defaultValue={localDate()}
                  max={localDate()}
                  required
                />
                <Field
                  label="Duration (hours)"
                  name="hours"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  required
                />
                <Field
                  label="What new learning took place?"
                  name="reflection"
                  type="textarea"
                  required
                  rows={4}
                  wide
                />
                <p className="caption wide">
                  New logs are submitted for approval. Only approved hours
                  contribute to the learner’s target.
                </p>
              </>
            )}
            {type === "otjDecision" && (
              <>
                <p className="body-copy wide">
                  Return “{item.activity}” to the learner with useful feedback.
                </p>
                <Field
                  label="Feedback"
                  name="feedback"
                  type="textarea"
                  required
                  wide
                />
              </>
            )}
            {type === "task" && (
              <>
                {learnerField}
                <Field
                  label="Agreed action"
                  name="title"
                  type="textarea"
                  defaultValue={modal.prefill}
                  required
                  wide
                />
                <Field
                  label="Action owner"
                  name="owner"
                  type="select"
                  options={s.users.map((u) => ({
                    value: u.id,
                    label: u.name + " · " + u.role,
                  }))}
                  defaultValue={learner?.assessorId || user.id}
                />
                <Field label="Due date" name="due" type="date" required />
              </>
            )}
            {type === "standard" && (
              <>
                <Field
                  label="Standard title"
                  name="name"
                  defaultValue={item?.name}
                  required
                />
                <Field
                  label="Reference"
                  name="reference"
                  defaultValue={item?.reference}
                  placeholder="ST reference"
                  required
                />
                <Field
                  label="Version"
                  name="version"
                  defaultValue={item?.version}
                  placeholder="Version / effective date"
                  required
                />
                <Field
                  label="Level"
                  name="level"
                  type="select"
                  options={["2", "3", "4", "5", "6", "7"]}
                  defaultValue={item?.level || "3"}
                />
                <label className="wide">
                  Paste official KSB criteria
                  <textarea
                    rows={10}
                    value={raw}
                    onChange={(e) => {
                      RAW(e.target.value);
                      PARSED([]);
                    }}
                    placeholder={
                      "K1: Full knowledge criterion wording\nS1: Full skill criterion wording\nB1: Full behaviour criterion wording"
                    }
                  />
                </label>
                <Button
                  secondary
                  type="button"
                  onClick={() => {
                    const p = parseStandard(raw);
                    PARSED(p);
                    if (!p.length)
                      E(
                        "No criteria detected. Use K1:, S1: or B1: at the beginning of each criterion.",
                      );
                    else E("");
                  }}
                >
                  Parse & preview criteria
                </Button>
                <p className="caption wide">
                  Edits apply to all apprentices assigned to this standard. Used
                  criterion codes cannot be removed or renamed. Review every
                  extracted criterion before saving. The parser is a formatting
                  aid; it does not validate an official standard.
                </p>
                {parsed.length > 0 && (
                  <div className="wide parsed-criteria">
                    {parsed.map((c, i) => (
                      <div key={i}>
                        <b>{c.code}</b>
                        <textarea
                          aria-label={c.code + " wording"}
                          value={c.text}
                          onChange={(e) =>
                            PARSED(
                              parsed.map((x, j) =>
                                i === j ? { ...x, text: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={"Remove " + c.code}
                          onClick={() =>
                            PARSED(parsed.filter((_, j) => j !== i))
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {type === "resource" && (
              <>
                <Field label="Resource title" name="title" required />
                <Field
                  label="Category"
                  name="category"
                  type="select"
                  options={[
                    "Learning material",
                    "Template",
                    "Assessment guidance",
                    "EPA preparation",
                    "Policy & compliance",
                    "Video",
                    "Website",
                    "Other",
                  ]}
                />
                <Field
                  label="Standard"
                  name="standardId"
                  type="select"
                  defaultValue={modal.standardId || ""}
                  options={[
                    { value: "", label: "All standards" },
                    ...standards,
                  ]}
                />
                <Field
                  label="HTTPS link"
                  name="url"
                  type="url"
                  placeholder="https://…"
                />
                <Field
                  label="Description"
                  name="description"
                  type="textarea"
                  wide
                />
                <Field
                  label="Resource attachments"
                  name="files"
                  type="file"
                  multiple
                  wide
                />
              </>
            )}
            {type === "appointment" && (
              <>
                {learnerField}
                <Field label="Appointment title" name="title" required wide />
                <Field
                  label="Date"
                  name="date"
                  type="date"
                  defaultValue={localDate()}
                  required
                />
                <Field
                  label="Time (Europe/London)"
                  name="time"
                  type="time"
                  defaultValue="10:00"
                  required
                />
                <Field label="Location / meeting link" name="location" wide />
                <Field
                  label="Agenda / notes"
                  name="notes"
                  type="textarea"
                  wide
                />
              </>
            )}
            {type === "quality" && (
              <>
                <Field
                  label="Accepted evidence to sample"
                  name="evidenceId"
                  type="select"
                  defaultValue={modal.evidenceId}
                  options={[
                    { value: "", label: "Select accepted evidence" },
                    ...s.evidence
                      .filter((e) => e.status === "Accepted")
                      .map((e) => ({
                        value: e.id,
                        label:
                          s.learners.find((l) => l.id === e.learnerId)?.name +
                          " · " +
                          e.title,
                      })),
                  ]}
                  required
                  wide
                />
                <Field
                  label="Quality outcome"
                  name="outcome"
                  type="select"
                  options={["Agreed", "Action required"]}
                />
                <Field
                  label="IQA findings & required actions"
                  name="notes"
                  type="textarea"
                  rows={4}
                  required
                  wide
                />
              </>
            )}
            {type === "gateway" && (
              <>
                <p className="body-copy wide">
                  {learner?.name} · {stdOf(s, learner)}
                </p>
                <FunctionalSkillsChecks
                  learner={learner}
                  user={user}
                  command={command}
                  busy={busy}
                  notify={notify}
                  onUpdated={() =>
                    setModal((current) =>
                      current?.type === "gateway" &&
                      current.learner?.id === learner.id
                        ? { ...current }
                        : current,
                    )
                  }
                />
                <div className="gateway-checklist wide">
                  {learner?.gatewayChecks.map(([label, ok]) => (
                    <div key={label}>
                      <span className={ok ? "passed" : "not-passed"}>
                        {ok ? <Check size={17} /> : <X size={17} />}
                      </span>
                      <strong>{label}</strong>
                      <Tag tone={ok ? "green" : "amber"}>
                        {ok ? "Passed" : "Outstanding"}
                      </Tag>
                    </div>
                  ))}
                </div>
                <p className="caption wide">
                  These are configured readiness checks. Confirm the applicable
                  assessment plan, provider requirements and employer agreement
                  separately.
                </p>
                {learner.gatewayNotes && (
                  <p className="body-copy wide">
                    Recorded declaration: {learner.gatewayNotes}
                  </p>
                )}
                {["Manager", "Assessor"].includes(user.role) &&
                  learner?.gatewayChecks.every((x) => x[1]) && (
                    <>
                      <Field
                        label="Gateway date"
                        name="date"
                        type="date"
                        defaultValue={localDate()}
                        required
                      />
                      <Field label="EPA date" name="epaDate" type="date" />
                      <Field
                        label="Provider declaration / agreement notes"
                        name="notes"
                        type="textarea"
                        required
                        wide
                      />
                    </>
                  )}
              </>
            )}
            {type === "user" && (
              <>
                <Field
                  label="Full name"
                  name="name"
                  defaultValue={item?.name}
                  required
                />
                <Field
                  label="Email address"
                  name="email"
                  defaultValue={item?.email}
                  type="email"
                  required
                />
                <Field
                  label="Role"
                  name="role"
                  type="select"
                  defaultValue={item?.role || "Assessor"}
                  options={[
                    "Manager",
                    "Assessor",
                    "IQA",
                    "Apprentice",
                    "Employer",
                  ]}
                />
                {!item && (
                  <Field
                    label="Initial password"
                    name="password"
                    type="password"
                    minLength="12"
                    autoComplete="new-password"
                    required
                  />
                )}
                <Field
                  label="Linked apprentice (apprentice role only)"
                  name="learnerId"
                  defaultValue={item?.learnerId}
                  type="select"
                  options={[{ value: "", label: "Not linked" }, ...learners]}
                />
                <Field
                  label="Employer organisation (employer role only)"
                  name="employer"
                  defaultValue={item?.employer}
                  type="select"
                  options={[
                    { value: "", label: "Not linked" },
                    ...[...new Set(s.learners.map((l) => l.employer))],
                  ]}
                />
                {item && (
                  <fieldset className="wide">
                    <legend>Assessor / IQA caseload</legend>
                    <p>
                      Selecting a learner reassigns their assessor or IQA to
                      this account. Other roles use the linked learner or
                      employer above.
                    </p>
                    {s.learners.map((l) => (
                      <label key={l.id}>
                        <input
                          type="checkbox"
                          name="caseload"
                          value={l.id}
                          defaultChecked={
                            l.assessorId === item.id || l.iqaId === item.id
                          }
                        />
                        {l.name}
                      </label>
                    ))}
                  </fieldset>
                )}
                <p className="caption wide">
                  Account edits keep the existing password. Changes to access or
                  email sign the user out. New accounts must change their
                  initial password.
                </p>
              </>
            )}
            {type === "password" && (
              <>
                <Field
                  label="Current password"
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                  wide
                />
                <Field
                  label="New password"
                  name="password"
                  type="password"
                  minLength="12"
                  autoComplete="new-password"
                  maxLength="200"
                  required
                  wide
                />
                <Field
                  label="Confirm new password"
                  name="confirm"
                  type="password"
                  minLength="12"
                  maxLength="200"
                  autoComplete="new-password"
                  required
                  wide
                />
                <p className="caption wide">
                  Changing your password signs out all your sessions. Sign in
                  again with your new password.
                </p>
              </>
            )}
            {type === "restore" && (
              <>
                <div className="form-error wide">
                  This replaces learner and learning records with the snapshot
                  from {fmt(item.date)}. Accounts and audit history are
                  retained. Create a new snapshot first if you need to preserve
                  current records.
                </div>
                <label className="checkbox-label wide">
                  <input type="checkbox" required />I understand and want to
                  restore this snapshot.
                </label>
              </>
            )}
            {type === "import" && (
              <>
                <p className="body-copy wide">
                  Import CSV or XLSX apprentice records. Existing references are
                  updated; new references are added. The entire import is
                  validated before anything is saved. Evidence and hours must be
                  recorded through their workflows.
                </p>
                <Button
                  type="button"
                  secondary
                  onClick={() =>
                    download(
                      "apprentice-import-template.csv",
                      csv([
                        {
                          ref: "NEW-001",
                          name: "Example Learner",
                          email: "learner@example.test",
                          employer: "Example Employer",
                          standardId: s.standards[0]?.id || "",
                          assessorId:
                            s.users.find((u) => u.role === "Assessor")?.id ||
                            "",
                          iqaId:
                            s.users.find((u) => u.role === "IQA")?.id || "",
                          status: "Active",
                          target: 0,
                          otjTarget: 278,
                          nextReview: localDate(),
                          initialReviewDate: "",
                          eliDue: "",
                          riskDue: "",
                          employerDue: "",
                          plannedEnd: "",
                          predictedEnd: "",
                          english: "Pending",
                          maths: "Pending",
                        },
                      ]),
                      "text/csv",
                    )
                  }
                >
                  <Download size={14} />
                  Download template
                </Button>
                <label className="wide">
                  Choose spreadsheet
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => readImport(e.target.files[0])}
                  />
                </label>
                <p className="caption wide">
                  The WBL tracker is detected automatically, including headings
                  below the title and legend. Other spreadsheets should use the
                  template and match existing standards and staff. XLSX imports
                  use the first worksheet.
                </p>
                {importError && (
                  <p className="form-error wide">{importError}</p>
                )}
                {trackerPreview && (
                  <div className="wide">
                    <h3>WBL tracker replacement preview</h3>
                    <p>
                      {trackerPreview.records.length} records ·{" "}
                      {trackerPreview.missingNames} without names ·{" "}
                      {trackerPreview.duplicateReferences} rows with repeated
                      references.
                    </p>
                    <p>
                      Blank names use learner references. Repeated references
                      receive a worksheet row suffix so records are kept
                      separate. Unmatched staff stay unassigned; missing courses
                      are created with no KSB criteria until their schedules are
                      supplied.
                    </p>
                    <p>
                      Saving replaces fictional practice learners and their
                      linked records. Existing real learners are retained or
                      updated by reference. Tracker progress is kept separately
                      from verified portfolio progress. No accounts or passwords
                      are created.
                    </p>
                    <p>
                      Existing records should be backed up under Settings &
                      export before importing.
                    </p>
                  </div>
                )}
                {importRows && (
                  <div className="wide">
                    <h3>
                      {importRows.length} records ready for server validation
                    </h3>
                    <Table
                      headers={["Ref", "Learner", "Employer", "Standard match"]}
                    >
                      {importRows.slice(0, 10).map((r, i) => (
                        <tr key={i}>
                          <td>{r.ref}</td>
                          <td>{r.name}</td>
                          <td>{r.employer}</td>
                          <td>
                            {r.standardId
                              ? "Matched"
                              : trackerPreview
                                ? "Programme will be created; KSBs needed"
                                : "Not found — fix before import"}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}
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
              Close
            </Button>
            {!(
              type === "evidenceDetail" &&
              !(
                (!item.standardId || item.standardId === learner?.standardId) &&
                ["Submitted", "Accepted", "Changes requested"].includes(
                  item.status,
                ) &&
                ["Manager", "Assessor"].includes(user.role)
              )
            ) &&
              !(
                type === "gateway" &&
                (!["Manager", "Assessor"].includes(user.role) ||
                  !learner?.gatewayChecks.every((x) => x[1]))
              ) && (
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    busy ||
                    (type === "standard" &&
                      !parsed.length &&
                      (!item || item.criteria.length > 0 || raw.trim())) ||
                    (type === "import" && !importRows)
                  }
                >
                  {pending
                    ? "Saving…"
                    : type === "evidenceDetail"
                      ? "Save assessment"
                      : type === "restore"
                        ? "Restore snapshot"
                        : type === "import"
                          ? "Validate & import"
                          : type === "gateway"
                            ? "Record gateway readiness"
                            : "Save changes"}
                  <ArrowRight size={15} />
                </Button>
              )}
          </div>
        </form>
      </section>
    </div>
  );
}
// ExcelJS CSV streaming is Node-specific; browser CSV parsing uses a small RFC 4180 parser below.
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("Unclosed quote in CSV.");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
createRoot(document.getElementById("root")).render(<App />);
