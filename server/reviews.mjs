import {
  REVIEW_VERSION,
  REVIEW_CHECKS,
  REVIEW_NARRATIVES,
  REVIEW_RAG,
  TARGET_CATEGORIES,
} from "./review-template.mjs";
import { derive } from "./model.mjs";
export function normalizeReview(
  p,
  { s, l, u, text, choice, number, date, fail, canSee },
) {
  if (p.templateVersion === undefined)
    fail("Use the complete progress review template to record a new review.");
  if (p.templateVersion !== REVIEW_VERSION)
    fail("Unsupported review template version.");
  const source = p.template;
  if (!source || typeof source !== "object" || Array.isArray(source))
    fail("Complete the progress review sections.");
  const numeric = (value, label, min, max) => {
    if (typeof value !== "number" && typeof value !== "string")
      fail(`${label} is required.`);
    return number(value, label, min, max);
  };
  const result = { version: REVIEW_VERSION, checks: {}, responses: {} };
  result.partner =
    typeof source.partner === "string"
      ? source.partner.trim().slice(0, 200)
      : "";
  result.dueDate = date(source.dueDate, "scheduled review due date", true);
  result.locationType = choice(
    source.locationType,
    ["Workplace", "College", "Remote", "Other"],
    "review location type",
  );
  result.onJobHours = numeric(
    source.onJobHours,
    "total on-the-job hours",
    0,
    100000,
  );
  result.offJobHours = numeric(
    source.offJobHours,
    "total reported off-the-job hours",
    0,
    100000,
  );
  result.progressPercent = numeric(
    source.progressPercent,
    "reported programme progress",
    0,
    100,
  );
  result.progressRag = choice(
    source.progressRag,
    REVIEW_RAG,
    "programme progress rating",
  );
  result.englishRag = choice(
    source.englishRag,
    [...REVIEW_RAG, "Not applicable"],
    "English progress rating",
  );
  result.mathsRag = choice(
    source.mathsRag,
    [...REVIEW_RAG, "Not applicable"],
    "Maths progress rating",
  );
  for (const check of REVIEW_CHECKS) {
    const value = source.checks?.[check.key];
    const answer = choice(
      value?.answer,
      check.choices || ["Yes", "No"],
      check.label,
    );
    result.checks[check.key] = {
      answer,
      details:
        answer === check.detailWhen
          ? text(value?.details, check.detailLabel, 10000)
          : "",
    };
  }
  for (const field of REVIEW_NARRATIVES)
    result.responses[field.key] = text(
      source.responses?.[field.key],
      field.label,
      10000,
    );
  if (result.checks.accident.answer === "Yes") {
    result.accidentDays = numeric(
      source.accidentDays,
      "days absent following accident",
      0,
      365,
    );
    result.accidentReport = choice(
      source.accidentReport,
      ["Completed", "Pending", "Not required"],
      "accident reporting status",
    );
  }
  if (result.checks.roleChanged.answer === "Yes")
    result.induction = choice(
      source.induction,
      ["Completed", "Pending", "Not required"],
      "new placement health and safety induction",
    );
  if (result.checks.alsRequested.answer === "Yes")
    result.alsReferral = choice(
      source.alsReferral,
      ["Requested", "In progress", "Arranged at review"],
      "learning support referral",
    );
  if (
    !Array.isArray(source.targets) ||
    source.targets.length < 2 ||
    source.targets.length > 20
  )
    fail(
      "Record 2–20 SMART targets, including programme and off-the-job learning targets.",
    );
  result.targets = source.targets.map((target) => {
    const owner = s.users.find(
      (account) =>
        account.id === target.owner && account.active && canSee(account, l),
    );
    if (!owner)
      fail(
        "Each SMART target needs an active owner with access to this apprentice.",
      );
    const due = date(target.due, "SMART target due date", true);
    if (due <= p.date || due > p.nextDate)
      fail(
        "SMART target dates must fall after this review and on or before the next review.",
      );
    return {
      category: choice(target.category, TARGET_CATEGORIES, "target category"),
      what: text(target.what, "target: what will be achieved", 2000),
      how: text(
        target.how,
        "target: how achievement will be demonstrated",
        4000,
      ),
      why:
        typeof target.why === "string" ? target.why.trim().slice(0, 2000) : "",
      hours:
        target.hours === undefined || target.hours === ""
          ? 0
          : number(target.hours, "Planned OTJ hours", 0, 1000),
      owner: owner.id,
      ownerName: owner.name,
      due,
    };
  });
  for (const category of TARGET_CATEGORIES.slice(0, 2))
    if (!result.targets.some((t) => t.category === category))
      fail(`Include a ${category.toLowerCase()} SMART target.`);
  text(p.learnerVoice, "Learner comments (or reason unavailable)", 10000);
  text(p.employerVoice, "Employer comments (or reason unavailable)", 10000);
  const derived = derive(l, s);
  result.context = {
    learnerName: l.name,
    learnerRef: l.ref,
    employer: l.employer,
    standardId: l.standardId,
    standardName: s.standards.find((st) => st.id === l.standardId)?.name || "",
    level: l.level,
    assessorName:
      s.users.find((account) => account.id === l.assessorId)?.name || u.name,
    assessorId: l.assessorId,
    plannedEnd: l.plannedEnd || "",
    verifiedProgress: derived.progress,
    approvedOffJobHours: derived.hours,
    progressTarget: l.target,
    recordedBy: u.name,
  };
  return result;
}
