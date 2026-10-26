import { ReviewDetails } from "./reviews";
import React from "react";
import {
  Printer,
  Download,
  FileText,
  ShieldCheck,
  Clock,
  Target,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import { fmt, csv, download, localDate } from "./lib";
import { activeRecord } from "./dashboards";
export default function ProgressReport({
  s,
  user,
  learnerId,
  setLearnerId,
  openLearner,
}) {
  const l = s.learners.find((l) => l.id === learnerId) || s.learners[0];
  if (!l)
    return (
      <div className="empty">
        Add an apprentice to generate a progress report.
      </div>
    );
  const standard = s.standards.find((st) => st.id === l.standardId),
    evidence = s.evidence.filter(
      (e) => e.learnerId === l.id && activeRecord(s, e),
    ),
    logs = s.otj.filter((x) => x.learnerId === l.id && activeRecord(s, x)),
    reviews = s.reviews
      .filter((r) => r.learnerId === l.id)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          String(b.createdAt || "").localeCompare(a.createdAt || ""),
      ),
    actions = s.tasks.filter((t) => t.learnerId === l.id),
    isEmployer = user.role === "Employer",
    name = (id) => s.users.find((u) => u.id === id)?.name || "Unassigned";
  const rows = l.coverage.map((c) => ({
    learner: l.name,
    reference: l.ref,
    standard: standard?.name,
    standardVersion: standard?.version,
    programmeStartDate: l.startDate,
    criterion: c.code,
    type: c.type,
    wording: c.text,
    achieved: c.achieved ? "Yes" : "No",
    acceptedEvidence: c.count,
    progress: l.progress,
    progressTarget: l.target,
    approvedHours: l.hours,
    hoursTarget: l.otjTarget,
    nextReview: l.nextReview,
  }));
  return (
    <div className="individual-report">
      <div className="progress-report-toolbar">
        <label>
          Apprentice
          <select
            aria-label="Report apprentice"
            value={l.id}
            onChange={(e) => setLearnerId(e.target.value)}
          >
            {s.learners.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.ref}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            className="button secondary"
            onClick={() =>
              download(
                "progress-report-" + l.ref + ".csv",
                csv(rows),
                "text/csv",
              )
            }
          >
            <Download size={16} />
            Export progress CSV
          </button>
          <button className="button" onClick={() => window.print()}>
            <Printer size={16} />
            Print / save PDF
          </button>
        </div>
      </div>
      <article className="learner-progress-report">
        <header className="report-cover">
          <div>
            <span className="eyebrow">
              INDIVIDUAL APPRENTICESHIP PROGRESS REPORT
            </span>
            <h2>{l.name}</h2>
            <p>
              {l.ref} · {l.employer}
            </p>
            <div className="report-standard-label">
              <BookIcon />
              <span>
                {standard?.name} · Level {l.level}
              </span>
            </div>
          </div>
          <div className="report-generated">
            <strong>
              archetype<span>.</span>
            </strong>
            <p>Generated {fmt(localDate())}</p>
            <span className="report-risk" data-rag={l.rag}>
              {l.rag} · {l.status}
            </span>
          </div>
        </header>
        <div className="report-meta">
          <div>
            <span>Programme start date</span>
            <strong>{fmt(l.startDate)}</strong>
          </div>
          <div>
            <span>Assessor</span>
            <strong>{name(l.assessorId)}</strong>
          </div>
          <div>
            <span>Quality assurer</span>
            <strong>{name(l.iqaId)}</strong>
          </div>
          <div>
            <span>Planned end</span>
            <strong>{fmt(l.plannedEnd)}</strong>
          </div>
          <div>
            <span>Standard version</span>
            <strong>{standard?.version}</strong>
          </div>
        </div>
        <section className="report-section">
          <h3>Functional skills</h3>
          <p>
            English: {l.english}
            {l.englishUpskill ? " · Upskill option" : ""}
            {l.englishNotRequired ? " · Staff marked not required" : ""}
          </p>
          <p>
            Maths: {l.maths}
            {l.mathsUpskill ? " · Upskill option" : ""}
            {l.mathsNotRequired ? " · Staff marked not required" : ""}
          </p>
        </section>
        <section className="report-stat-grid">
          <ReportMetric
            icon={Target}
            value={l.progress + "%"}
            label="Verified KSB progress"
            detail={`${l.target}% expected · ${l.variance > 0 ? "+" : ""}${l.variance}% variance`}
          />
          <ReportMetric
            icon={ShieldCheck}
            value={`${l.coverage.filter((c) => c.achieved).length}/${l.coverage.length}`}
            label="Criteria achieved"
            detail="Verified through accepted evidence"
          />
          <ReportMetric
            icon={Clock}
            value={l.hours + "h"}
            label="Approved OTJ learning"
            detail={`${l.otjTarget}h total target · ${l.otjExpected == null ? "Expected-to-date target not set" : `${l.otjExpected}h expected to date · ${l.otjVariance >= 0 ? "On target" : `${Math.abs(l.otjVariance)}h behind`}`}`}
          />
          <ReportMetric
            icon={CalendarDays}
            value={fmt(l.nextReview)}
            label="Next progress review"
            detail={`Last review ${fmt(l.lastReview)}`}
          />
        </section>
        <section className="report-section">
          <h3>Progress against your standard</h3>
          <p>
            Only accepted evidence mapped to the currently assigned standard
            contributes to verified progress.
          </p>
          <div className="report-coverage-bars">
            {["Knowledge", "Skill", "Behaviour"].map((type) => {
              const cs = l.coverage.filter((c) => c.type === type),
                done = cs.filter((c) => c.achieved).length;
              return (
                <div key={type}>
                  <strong>
                    {type === "Skill"
                      ? "Skills"
                      : type === "Behaviour"
                        ? "Behaviours"
                        : type}
                  </strong>
                  <div>
                    <i
                      style={{
                        width: (cs.length ? (done / cs.length) * 100 : 0) + "%",
                      }}
                    />
                  </div>
                  <span>
                    {done}/{cs.length}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Criterion</th>
                  <th>Accepted items</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {l.coverage.map((c) => (
                  <tr key={c.code}>
                    <td>
                      <b className="code">{c.code}</b>
                    </td>
                    <td>{c.text}</td>
                    <td>{c.count}</td>
                    <td>
                      <span
                        className={"tag " + (c.achieved ? "green" : "neutral")}
                      >
                        {c.achieved ? "Achieved" : "Not yet verified"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {!isEmployer && (
          <section className="report-section">
            <h3>Portfolio & learning activity</h3>
            <div className="report-summary-pills">
              <span>{evidence.length} evidence items</span>
              <span>
                {evidence.filter((e) => e.status === "Accepted").length}{" "}
                accepted
              </span>
              <span>
                {evidence.filter((e) => e.status === "Submitted").length}{" "}
                awaiting assessment
              </span>
              <span>
                {logs.filter((o) => o.status === "Pending").length} learning
                logs awaiting approval
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Recent evidence</th>
                    <th>Date</th>
                    <th>KSBs</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 8)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.title}</td>
                        <td>{fmt(e.date)}</td>
                        <td>{e.criteria.join(", ")}</td>
                        <td>{e.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!evidence.length && (
              <p>No evidence has been recorded against this standard.</p>
            )}
          </section>
        )}
        <section className="report-section">
          <h3>Latest review & agreed actions</h3>
          {reviews[0] ? (
            <>
              <div className="report-latest-review">
                <strong>
                  {reviews[0].type} · {fmt(reviews[0].date)}
                </strong>
                {reviews[0].template ? (
                  <ReviewDetails review={reviews[0]} />
                ) : (
                  <>
                    <p>{reviews[0].text}</p>
                    <h4>Agreed next steps</h4>
                    <p>{reviews[0].actions}</p>
                  </>
                )}
                <small>
                  {reviews[0].acknowledgements.length} participant
                  acknowledgements · recorded by {name(reviews[0].by)}
                </small>
              </div>
            </>
          ) : (
            <p>No review recorded yet.</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{name(t.owner)}</td>
                    <td>{fmt(t.due)}</td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="report-section">
          <h3>Readiness, support & delivery</h3>
          <div className="report-readiness">
            {l.gatewayChecks.map(([label, ok]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className={ok ? "good" : "attention"}>
                  {ok ? "Checks passed" : "Outstanding"}
                </strong>
              </div>
            ))}
          </div>
          {l.exceptions.length > 0 && (
            <ul className="report-exceptions">
              {l.exceptions.map((e, i) => (
                <li key={i}>
                  {e.text}
                  {e.date ? " · " + fmt(e.date) : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="caption">
            This report supports progress discussions. Gateway checks are
            provider-configured and do not certify funding or assessment
            eligibility. Acknowledgements are recorded attestations, not
            qualified electronic signatures.
          </p>
        </section>
        <div className="report-foot">
          <span>Archetype · WBL Intelligence</span>
          <span>
            {l.ref} · {fmt(localDate())}
          </span>
        </div>
      </article>
    </div>
  );
}
function BookIcon() {
  return <FileText size={17} />;
}
function ReportMetric({ icon: Icon, value, label, detail }) {
  return (
    <div>
      <Icon size={20} />
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}
