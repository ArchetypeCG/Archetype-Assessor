import { readFileSync } from "node:fs";
import { id, today } from "./model.mjs";

export const uploadedStandards = JSON.parse(
  readFileSync(
    new URL("./catalog/uploaded-standards.json", import.meta.url),
    "utf8",
  ),
);
export const UPLOADED_STARTER_VERSION =
  "uploaded-standards-and-fictional-learners-2026-10-v1";
const courseKey = (value) =>
  String(value)
    .toLowerCase()
    .replace(/\blevel\s*3\b/g, "")
    .replace(/[^a-z0-9]/g, "");
const dayAfter = (day, days) =>
  new Date(Date.parse(day + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);

// One-time, additive installation. No credential writes and no resetting existing records.
export function installUploadedStarter(
  s,
  { day = today(), makeId = id, includeLearners = false } = {},
) {
  s.migrations ||= [];
  if (s.migrations.includes(UPLOADED_STARTER_VERSION)) return null;
  for (const key of [
    "standards",
    "learners",
    "evidence",
    "otj",
    "tasks",
    "learningPlans",
    "appointments",
    "audit",
  ])
    s[key] ||= [];
  const owner = s.users.find((u) => u.active && u.role === "Manager");
  if (!owner)
    throw Error(
      "An active administrator is required to install the uploaded standards.",
    );
  const assessor = s.users.find((u) => u.active && u.role === "Assessor");
  const iqa = s.users.find((u) => u.active && u.role === "IQA");
  const by = assessor?.id || owner.id;
  const result = {
    addedStandards: 0,
    addedCriteria: 0,
    addedLearners: 0,
    retainedCriteria: 0,
  };
  const names = [
    "Alex Rowan",
    "Taylor Vale",
    "Morgan Ellis",
    "Casey Linden",
    "Jordan Ash",
    "Riley Brook",
  ];
  for (const [index, source] of uploadedStandards.entries()) {
    let standard = s.standards.find(
      (st) =>
        st.id === source.id ||
        st.reference === source.reference ||
        courseKey(st.name) === courseKey(source.name),
    );
    if (!standard) {
      standard = structuredClone(source);
      standard.id = makeId();
      s.standards.push(standard);
      result.addedStandards++;
      result.addedCriteria += standard.criteria.length;
    } else {
      // Preserve any user-authored wording and evidence mappings on matching codes.
      for (const criterion of source.criteria) {
        if (
          standard.criteria.some((c) => c.code.toUpperCase() === criterion.code)
        )
          result.retainedCriteria++;
        else {
          standard.criteria.push(structuredClone(criterion));
          result.addedCriteria++;
        }
      }
      standard.uploadedSource = source.source;
    }
    for (let n = 0; includeLearners && n < 2; n++) {
      let ref = `EXAMPLE-${index + 1}-${n + 1}`;
      // A pre-existing user reference belongs to them, even if it has the same spelling.
      if (s.learners.some((l) => l.ref === ref)) ref += "-" + makeId();
      const learner = {
        id: makeId(),
        ref,
        name: names[index * 2 + n] + " (fictional)",
        email: "",
        employer: "Example Learning Company (fictional)",
        standardId: standard.id,
        level: standard.level,
        assessorId: assessor?.id || "",
        iqaId: iqa?.id || "",
        status: "Active",
        target: n ? 50 : 25,
        otjTarget: 278,
        startDate: dayAfter(day, -120),
        plannedEnd: dayAfter(day, 300),
        predictedEnd: dayAfter(day, 300),
        lastReview: "",
        nextReview: dayAfter(day, 14),
        eliDue: dayAfter(day, 120),
        riskDue: dayAfter(day, 120),
        employerDue: dayAfter(day, 120),
        english: "Achieved",
        maths: n ? "Pending" : "Achieved",
        gatewayDate: "",
        epaDate: "",
        gatewayStatus: "Not ready",
        fictional: true,
        notes:
          "Fictional practice learner, created at your request. No personal details, results or evidence from uploaded gap analyses have been copied. You can edit or reassign this learner. No login account or outgoing email is created for this example.",
      };
      s.learners.push(learner);
      result.addedLearners++;
      const codes = source.criteria.slice(0, n ? 8 : 4).map((c) => c.code);
      for (const [e, code] of codes.entries()) {
        const submitted = e === codes.length - 1;
        s.evidence.push({
          id: makeId(),
          learnerId: learner.id,
          standardId: standard.id,
          title: `Fictional workplace reflection ${e + 1} · ${code}`,
          type: "Reflective account",
          date: dayAfter(day, -14 + e),
          description:
            "Fictional example: I practised this criterion through a workplace activity, reflected on what I learned and identified how to improve. This is illustrative text, not authentic assessment evidence.",
          criteria: [code],
          status: submitted ? "Submitted" : "Accepted",
          feedback: submitted
            ? ""
            : "Fictional assessment example. The criterion is marked accepted solely to illustrate how verified progress is calculated.",
          files: [],
          by,
          updated: day + "T12:00:00.000Z",
          decisions: [],
          fictional: true,
        });
      }
      for (const pending of [false, true])
        s.otj.push({
          id: makeId(),
          learnerId: learner.id,
          standardId: standard.id,
          date: dayAfter(day, pending ? -2 : -10),
          hours: pending ? 3 : n ? 42 : 18,
          activity: pending
            ? "Fictional coached learning session"
            : "Fictional learning workshop",
          reflection:
            "Fictional practice entry showing learning reflection and the approval workflow.",
          status: pending ? "Pending" : "Approved",
          by,
          fictional: true,
        });
      s.tasks.push({
        id: makeId(),
        learnerId: learner.id,
        standardId: standard.id,
        title: "Fictional action: review the submitted workplace reflection",
        owner: by,
        due: dayAfter(day, 7),
        status: "Open",
        by,
        fictional: true,
      });
      s.learningPlans.push({
        id: makeId(),
        learnerId: learner.id,
        standardId: standard.id,
        title: "Fictional learning activity: apply learning in the workplace",
        description:
          "Practise the mapped criteria in a realistic work scenario, record a reflection and discuss it at the next review. This activity is fictional.",
        objectives:
          "Explain the mapped knowledge, demonstrate a work example and identify a next step.",
        criteria: codes.slice(0, 2),
        resources: [],
        startDate: day,
        due: dayAfter(day, 14),
        plannedHours: 3,
        status: "In progress",
        by,
        completionNotes: "",
        learnerReflection: "",
        fictional: true,
      });
      s.appointments.push({
        id: makeId(),
        learnerId: learner.id,
        standardId: standard.id,
        title: "Fictional progress review",
        type: "Progress review",
        date: dayAfter(day, 14),
        time: "10:00",
        endTime: "11:00",
        timezone: "Europe/London",
        delivery: "Online",
        location: "To be arranged",
        meetingUrl: "",
        description:
          "Fictional practice review: discuss progress, workplace learning, off-the-job hours, wellbeing and support, then agree SMART actions.",
        objectives:
          "Review mapped evidence and agree the next learning priorities.",
        preparation: "Bring a work example and an updated learning log.",
        criteria: codes.slice(0, 2),
        resources: [],
        participants: [
          ...new Set([owner.id, assessor?.id, iqa?.id].filter(Boolean)),
        ],
        attendance: "Not recorded",
        status: "Planned",
        notes: "",
        outcomeNotes: "",
        staffNotes: "",
        by,
        fictional: true,
      });
    }
  }
  s.migrations.push(UPLOADED_STARTER_VERSION);
  s.revision++;
  s.audit.unshift({
    id: makeId(),
    by: "system",
    actor: "Requested standards import",
    role: "System",
    action: "standards.uploaded-starter.install",
    learnerId: null,
    date: day + "T12:00:00.000Z",
    ...result,
  });
  return result;
}
