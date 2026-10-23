import React, { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, ClipboardCheck, CheckCheck } from "lucide-react";
import { localDate, fmt } from "./lib";
import {
  REVIEW_VERSION,
  REVIEW_CHECKS,
  REVIEW_NARRATIVES,
  REVIEW_RAG,
  REVIEW_DECLARATION,
  TARGET_CATEGORIES,
} from "../server/review-template.mjs";
const sections = [
  "Training & assessment",
  "Training conditions",
  "Recall & recap",
  "Inclusion, safeguarding & wellbeing",
  "Functional skills",
  "Knowledge, skills & behaviours",
  "Impact & participant comments",
];
function Input({
  label,
  type = "text",
  help,
  options,
  wide = false,
  required = true,
  ...props
}) {
  const fieldId = React.useId();
  return (
    <label className={wide ? "wide" : ""} htmlFor={fieldId}>
      <span>
        {label}
        {required && <b className="required"> *</b>}
      </span>
      {help && <small>{help}</small>}
      {options ? (
        <select id={fieldId} required={required} {...props}>
          <option value="">Select an answer</option>
          {options.map((o) => (
            <option
              key={typeof o === "string" ? o : o.value}
              value={typeof o === "string" ? o : o.value}
            >
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          id={fieldId}
          required={required}
          rows={3}
          maxLength={10000}
          {...props}
        />
      ) : (
        <input id={fieldId} type={type} required={required} {...props} />
      )}
    </label>
  );
}
function Section({ number, title, children }) {
  return (
    <section className="review-form-section" data-review-section={number}>
      <div className="review-section-heading">
        <span>{number}</span>
        <h3>{title}</h3>
      </div>
      <div className="review-form-grid">{children}</div>
    </section>
  );
}
function ReviewForm({ s, user, learner, modal, command, setModal, busy }) {
  const defaultOwner =
    s.users.find(
      (account) =>
        account.role === "Apprentice" &&
        learner.participantIds?.includes(account.id),
    )?.id ||
    learner.assessorId ||
    user.id;
  const [checks, C] = useState({}),
    [error, E] = useState("");
  const [targets, T] = useState(() =>
    TARGET_CATEGORIES.slice(0, 2).map((category) => ({
      category,
      what: "",
      how: "",
      why: "",
      owner: defaultOwner,
      due: "",
    })),
  );
  const [date, D] = useState(localDate()),
    [nextDate, N] = useState("");
  const standard = s.standards.find((st) => st.id === learner.standardId),
    assessor = s.users.find((u) => u.id === learner.assessorId);
  const owners = s.users.filter(
    (account) =>
      account.active !== false && learner.participantIds?.includes(account.id),
  );
  function targetChange(index, key, value) {
    T((items) =>
      items.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    );
  }
  async function save(e) {
    e.preventDefault();
    E("");
    const form = new FormData(e.currentTarget);
    const values = Object.fromEntries(form);
    const template = { checks: {}, responses: {}, targets };
    for (const check of REVIEW_CHECKS)
      template.checks[check.key] = {
        answer: checks[check.key] || "",
        details: values[check.key + "Details"] || "",
      };
    for (const field of REVIEW_NARRATIVES)
      template.responses[field.key] = values[field.key];
    for (const key of [
      "partner",
      "dueDate",
      "locationType",
      "onJobHours",
      "offJobHours",
      "progressPercent",
      "progressRag",
      "englishRag",
      "mathsRag",
      "accidentDays",
      "accidentReport",
      "induction",
      "alsReferral",
    ])
      template[key] = values[key];
    try {
      await command("review.add", {
        learnerId: learner.id,
        templateVersion: REVIEW_VERSION,
        template,
        type: values.type,
        date,
        nextDate,
        text: values.text,
        learnerVoice: values.learnerVoice,
        employerVoice: values.employerVoice,
        wellbeing: values.wellbeing,
        nextObjectives: values.nextObjectives,
        location: values.location,
        appointmentId: modal.appointment?.id,
      });
      setModal(null);
    } catch (e) {
      E(e.message);
    }
  }
  return (
    <form onSubmit={save}>
      <fieldset disabled={busy} className="review-fieldset">
        <nav className="review-section-nav" aria-label="Review sections">
          {[
            "Details",
            "Training",
            "Conditions",
            "Recap",
            "Inclusion",
            "English & maths",
            "KSBs",
            "Comments",
            "Progress",
            "Targets",
          ].map((label, index) => (
            <button
              type="button"
              key={label}
              onClick={(e) =>
                e.currentTarget
                  .closest("form")
                  .querySelector(
                    `[data-review-section="${String(index + 1).padStart(2, "0")}"]`,
                  )
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="review-context">
          <div>
            <small>APPRENTICE</small>
            <strong>{learner.name}</strong>
            <span>
              {learner.ref} · {learner.employer}
            </span>
          </div>
          <div>
            <small>PROGRAMME</small>
            <strong>
              {standard?.name} · Level {learner.level}
            </strong>
            <span>
              Assessor: {assessor?.name || "Unassigned"} · Planned end:{" "}
              {fmt(learner.plannedEnd)}
            </span>
          </div>
        </div>
        <p className="review-shared-note">
          This review is shared with accounts authorised to access the
          apprentice. Record agreed support and follow-up here; report
          confidential safeguarding concerns through your organisation’s
          safeguarding procedure.
        </p>
        <Section number="01" title="Review details & training hours">
          <Input
            label="Review type"
            name="type"
            options={[
              "Progress review",
              "Tripartite review",
              "Assessment feedback",
              "Gateway review",
              "One-to-one",
              "Workplace visit",
            ]}
            defaultValue={
              modal.appointment?.type === "Tripartite review"
                ? "Tripartite review"
                : "Progress review"
            }
          />
          <Input
            label="Partner / delivery organisation"
            name="partner"
            required={false}
          />
          <Input
            label="Due date of this review"
            type="date"
            name="dueDate"
            defaultValue={modal.appointment?.date || learner.nextReview}
          />
          <Input
            label="Actual review date"
            type="date"
            value={date}
            max={localDate()}
            onChange={(e) => D(e.target.value)}
          />
          <Input
            label="Next review date"
            type="date"
            value={nextDate}
            min={date}
            onChange={(e) => N(e.target.value)}
          />
          <Input
            label="Review setting"
            name="locationType"
            options={["Workplace", "College", "Remote", "Other"]}
          />
          <Input
            label="Review location / meeting details"
            name="location"
            defaultValue={modal.appointment?.location || ""}
            wide
            required={false}
          />
          <Input
            label="Total on-the-job hours so far"
            name="onJobHours"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            help="Record the confirmed total; this does not add to the off-the-job log."
          />
          <Input
            label="Total off-the-job hours reported at review"
            name="offJobHours"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            help={`The platform currently has ${learner.hours} approved hours for this programme. Check any paper-based records too.`}
          />
        </Section>
        {sections.map((section, index) => (
          <Section
            number={String(index + 2).padStart(2, "0")}
            title={section}
            key={section}
          >
            {REVIEW_CHECKS.filter((c) => c.section === section).map((check) => (
              <div className="review-check wide" key={check.key}>
                <Input
                  label={check.label}
                  options={check.choices || ["Yes", "No"]}
                  value={checks[check.key] || ""}
                  onChange={(e) =>
                    C({ ...checks, [check.key]: e.target.value })
                  }
                />
                {checks[check.key] === check.detailWhen && (
                  <Input
                    label={check.detailLabel}
                    name={check.key + "Details"}
                    type="textarea"
                  />
                )}
                {check.key === "accident" && checks.accident === "Yes" && (
                  <div className="review-form-grid">
                    <Input
                      label="Days absent following the accident"
                      name="accidentDays"
                      type="number"
                      min="0"
                      max="365"
                      step="1"
                    />
                    <Input
                      label="Accident report / investigation status"
                      name="accidentReport"
                      options={["Completed", "Pending", "Not required"]}
                    />
                  </div>
                )}
                {check.key === "roleChanged" &&
                  checks.roleChanged === "Yes" && (
                    <Input
                      label="New placement health and safety induction"
                      name="induction"
                      options={["Completed", "Pending", "Not required"]}
                    />
                  )}{" "}
                {check.key === "alsRequested" &&
                  checks.alsRequested === "Yes" && (
                    <Input
                      label="Additional learning support referral"
                      name="alsReferral"
                      options={[
                        "Requested",
                        "In progress",
                        "Arranged at review",
                      ]}
                    />
                  )}
              </div>
            ))}
            {REVIEW_NARRATIVES.filter((field) => field.section === section).map(
              (field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  name={field.key}
                  help={field.help}
                  type="textarea"
                  wide
                />
              ),
            )}
            {section === "Inclusion, safeguarding & wellbeing" && (
              <Input
                label="Wellbeing and agreed support"
                name="wellbeing"
                type="textarea"
                wide
                required={false}
              />
            )}
            {section === "Functional skills" && (
              <>
                <Input
                  label="English progress rating"
                  name="englishRag"
                  options={[...REVIEW_RAG, "Not applicable"]}
                />
                <Input
                  label="Maths progress rating"
                  name="mathsRag"
                  options={[...REVIEW_RAG, "Not applicable"]}
                />
              </>
            )}
            {section === "Impact & participant comments" && (
              <>
                <Input
                  label="Learner comments"
                  name="learnerVoice"
                  type="textarea"
                  help="Record the apprentice’s contribution, or explain why it is unavailable."
                  wide
                />
                <Input
                  label="Employer comments"
                  name="employerVoice"
                  type="textarea"
                  help="Record the employer’s contribution, or explain why it is unavailable and how follow-up will take place."
                  wide
                />
              </>
            )}
          </Section>
        ))}
        <Section number="09" title="Programme progress & readiness">
          <Input
            label="Programme progress, workplace contribution, career aims and milestones"
            name="text"
            type="textarea"
            rows={5}
            help="Discuss progress against the planned end date, assignments, portfolio evidence, qualifications and EPA preparation where applicable."
            wide
          />
          <Input
            label="Reported programme progress (%)"
            name="progressPercent"
            type="number"
            min="0"
            max="100"
            step="0.1"
            help={`Verified KSB coverage is currently ${learner.progress}%. Reported progress is recorded separately.`}
          />
          <Input
            label="Progress against the planned end date"
            name="progressRag"
            options={REVIEW_RAG}
          />
          <Input
            label="Next learning objectives / EPA preparation"
            name="nextObjectives"
            type="textarea"
            wide
            required={false}
          />
        </Section>
        <Section number="10" title="SMART targets to the next review">
          <p className="wide body-copy">
            Agree specific, measurable, achievable, realistic and time-bound
            actions. Include programme / workplace and off-the-job learning
            targets. Saving creates an action with an owner and due date for
            each target.
          </p>
          {targets.map((target, index) => (
            <div className="review-target wide" key={index}>
              <div className="review-target-heading">
                <h4>Target {index + 1}</h4>
                {targets.length > 2 && (
                  <button
                    type="button"
                    className="text-link danger-text"
                    aria-label={"Remove target " + (index + 1)}
                    onClick={() => T(targets.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={15} />
                    Remove
                  </button>
                )}
              </div>
              <div className="review-form-grid">
                <Input
                  label={"Target " + (index + 1) + " category"}
                  options={TARGET_CATEGORIES}
                  value={target.category}
                  onChange={(e) =>
                    targetChange(index, "category", e.target.value)
                  }
                />
                <Input
                  label={"Target " + (index + 1) + " owner"}
                  options={owners.map((u) => ({
                    value: u.id,
                    label: u.name + " · " + u.role,
                  }))}
                  value={target.owner}
                  onChange={(e) => targetChange(index, "owner", e.target.value)}
                />
                <Input
                  label={"Target " + (index + 1) + ": what will be achieved?"}
                  type="textarea"
                  value={target.what}
                  maxLength={2000}
                  onChange={(e) => targetChange(index, "what", e.target.value)}
                  wide
                />
                <Input
                  label={
                    "Target " +
                    (index + 1) +
                    ": how will it be achieved and measured?"
                  }
                  type="textarea"
                  value={target.how}
                  maxLength={4000}
                  onChange={(e) => targetChange(index, "how", e.target.value)}
                  wide
                />
                <Input
                  label={"Target " + (index + 1) + ": why does it matter?"}
                  type="textarea"
                  value={target.why}
                  maxLength={2000}
                  onChange={(e) => targetChange(index, "why", e.target.value)}
                  wide
                />
                <Input
                  label={"Target " + (index + 1) + " due date"}
                  type="date"
                  min={date}
                  max={nextDate || undefined}
                  value={target.due}
                  onChange={(e) => targetChange(index, "due", e.target.value)}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            disabled={targets.length >= 20}
            onClick={() =>
              T([
                ...targets,
                {
                  category: TARGET_CATEGORIES[0],
                  what: "",
                  how: "",
                  why: "",
                  owner: defaultOwner,
                  due: "",
                },
              ])
            }
          >
            <Plus size={15} />
            Add target
          </button>
        </Section>
        <section className="review-agreement">
          <CheckCheck size={22} />
          <div>
            <h3>Three-party agreement</h3>
            <p>{REVIEW_DECLARATION}</p>
            <p>
              Saving records this review; it does not sign for anyone. The
              learner, employer and assessor acknowledge it separately after
              reading it.
            </p>
          </div>
        </section>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="review-save-row">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => setModal(null)}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            <ClipboardCheck size={17} />
            {busy ? "Saving…" : "Save review & create targets"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function ReviewDialog({ s, user, modal, command, setModal, busy }) {
  const [learnerId, L] = useState(
      modal.learner?.id || modal.appointment?.learnerId || "",
    ),
    ref = useRef(null);
  const learner = s.learners.find((l) => l.id === learnerId);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement,
      old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button,input,select,textarea")?.focus();
    const key = (e) => {
      if (e.key === "Escape" && !busyRef.current) setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll("button,input,select,textarea"),
        ].filter((n) => !n.disabled && n.offsetParent !== null);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) setModal(null);
      }}
    >
      <section
        className="modal review-template-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-template-heading"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">APPRENTICESHIP • PROGRESS REVIEW</span>
            <h2 id="review-template-heading">
              A complete picture of progress.
            </h2>
            <p>Learning, workplace experience, support and clear next steps.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close review"
            disabled={busy}
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        {!modal.learner && !modal.appointment && (
          <div className="review-apprentice-select">
            <Input
              label="Apprentice"
              options={s.learners.map((l) => ({ value: l.id, label: l.name }))}
              value={learnerId}
              disabled={busy}
              onChange={(e) => {
                if (
                  !learnerId ||
                  window.confirm(
                    "Changing the apprentice starts a new blank review. Continue?",
                  )
                )
                  L(e.target.value);
              }}
              help="Choose the apprentice whose review you are recording."
            />
          </div>
        )}
        {learner ? (
          <ReviewForm
            key={learner.id}
            {...{ s, user, learner, modal, command, setModal, busy }}
          />
        ) : (
          <p className="body-copy">Select an apprentice to start the review.</p>
        )}
      </section>
    </div>
  );
}
export function ReviewDetails({ review: r }) {
  const t = r.template;
  if (!t) return null;
  const entry = (label, value) => (
    <div className="review-detail-entry" key={label}>
      <strong>{label}</strong>
      <p className="preserve-text">{value ?? "Not recorded"}</p>
    </div>
  );
  return (
    <div className="review-template-details">
      <div className="review-context">
        <div>
          <small>APPRENTICE & EMPLOYER AT REVIEW</small>
          <strong>{t.context.learnerName}</strong>
          <span>
            {t.context.learnerRef} · {t.context.employer}
          </span>
        </div>
        <div>
          <small>PROGRAMME AT REVIEW</small>
          <strong>
            {t.context.standardName} · Level {t.context.level}
          </strong>
          <span>
            Assessor: {t.context.assessorName} · Planned end:{" "}
            {fmt(t.context.plannedEnd)}
          </span>
        </div>
      </div>
      <section>
        <h4>Review details & hours</h4>
        <div className="review-detail-grid">
          {entry(
            "Partner / delivery organisation",
            t.partner || "Not recorded",
          )}
          {entry(
            "Due / actual / next review dates",
            `${fmt(t.dueDate)} / ${fmt(r.date)} / ${fmt(r.nextDate)}`,
          )}
          {entry(
            "Review setting / location",
            `${t.locationType}${r.location ? " · " + r.location : ""}`,
          )}
          {entry("On-the-job hours reported", t.onJobHours + "h")}
          {entry("Off-the-job hours reported", t.offJobHours + "h")}
          {entry(
            "Platform-approved OTJ hours at review",
            t.context.approvedOffJobHours + "h",
          )}
          {entry(
            "Reported programme progress / rating",
            `${t.progressPercent}% · ${t.progressRag}`,
          )}
          {entry(
            "Verified KSB coverage / planned target at review",
            `${t.context.verifiedProgress}% / ${t.context.progressTarget}%`,
          )}
          {entry(
            "English / maths progress ratings",
            `${t.englishRag} / ${t.mathsRag}`,
          )}
        </div>
      </section>
      {sections.map((section) => (
        <section key={section}>
          <h4>{section}</h4>
          {REVIEW_CHECKS.filter((c) => c.section === section).map((c) =>
            entry(
              c.label,
              `${t.checks[c.key]?.answer || "Not recorded"}${t.checks[c.key]?.details ? " — " + t.checks[c.key].details : ""}`,
            ),
          )}
          {section === "Training conditions" && (
            <>
              {t.accidentDays !== undefined &&
                entry(
                  "Accident absence / report",
                  `${t.accidentDays} days · ${t.accidentReport}`,
                )}
              {t.induction && entry("Health and safety induction", t.induction)}
              {t.alsReferral && entry("ALS referral status", t.alsReferral)}
            </>
          )}
          {REVIEW_NARRATIVES.filter((f) => f.section === section).map((f) =>
            entry(f.label, t.responses[f.key]),
          )}
          {section === "Inclusion, safeguarding & wellbeing" &&
            r.wellbeing &&
            entry("Wellbeing and agreed support", r.wellbeing)}
          {section === "Impact & participant comments" && (
            <>
              {entry("Learner comments", r.learnerVoice)}
              {entry("Employer comments", r.employerVoice)}
            </>
          )}
        </section>
      ))}
      <section>
        <h4>Programme progress & readiness</h4>
        {entry(
          "Programme progress, contribution, career aims and milestones",
          r.text,
        )}
        {r.nextObjectives &&
          entry("Next learning objectives / EPA preparation", r.nextObjectives)}
      </section>
      <section>
        <h4>SMART targets & agreed actions</h4>
        {t.targets.map((target, index) => (
          <div className="review-detail-target" key={index}>
            <strong>
              {index + 1}. {target.what}
            </strong>
            <p>
              {target.category} · Owner: {target.ownerName} · Due:{" "}
              {fmt(target.due)}
            </p>
            {entry("How", target.how)}
            {entry("Why", target.why)}
          </div>
        ))}
      </section>
      <section className="review-agreement">
        <CheckCheck size={20} />
        <p>{REVIEW_DECLARATION}</p>
      </section>
      <section>
        <h4>Participant agreement record</h4>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Name</th>
                <th>Agreement recorded (UK time)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Apprentice", "Learner"],
                ["Employer", "Employer"],
                ["Assessor", "Assessor"],
              ].map(([role, label]) => {
                const a = r.acknowledgements.find(
                  (a) =>
                    a.role === role &&
                    (role !== "Assessor" || a.by === t.context.assessorId),
                );
                return (
                  <tr key={role}>
                    <td>{label}</td>
                    <td>
                      {a?.name ||
                        (role === "Apprentice"
                          ? t.context.learnerName
                          : role === "Assessor"
                            ? t.context.assessorName
                            : "Awaiting employer")}
                    </td>
                    <td>
                      {a
                        ? new Date(a.date).toLocaleString("en-GB", {
                            timeZone: "Europe/London",
                          })
                        : "Awaiting acknowledgement"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="caption">
          Each acknowledgement records the signed-in account and timestamp.
          These are not qualified electronic signatures.
        </p>
      </section>
    </div>
  );
}
