import { randomUUID } from "node:crypto";
export const id = () => randomUUID();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function offset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
export const roles = ["Manager", "Assessor", "IQA", "Apprentice", "Employer"];
export function derive(l, s, now = today()) {
  const standard = s.standards.find((x) => x.id === l.standardId),
    criteria = standard?.criteria ?? [];
  const accepted = s.evidence.filter(
    (x) => x.learnerId === l.id && x.status === "Accepted",
  );
  const achieved = new Set(accepted.flatMap((e) => e.criteria));
  const progress = criteria.length
    ? Math.round(
        (criteria.filter((c) => achieved.has(c.code)).length /
          criteria.length) *
          100,
      )
    : 0;
  const hours = s.otj
    .filter((x) => x.learnerId === l.id && x.status === "Approved")
    .reduce((n, x) => n + x.hours, 0);
  const exceptions = [];
  if (l.status === "Active") {
    if (l.nextReview && l.nextReview < now)
      exceptions.push({
        severity: "Red",
        text: "Progress review overdue",
        date: l.nextReview,
        type: "review",
      });
    for (const [field, label] of [
      ["eliDue", "Employer liability insurance"],
      ["riskDue", "Risk assessment"],
      ["employerDue", "Employer assessment"],
    ])
      if (l[field] && l[field] < now)
        exceptions.push({
          severity: "Red",
          text: label + " overdue",
          date: l[field],
          type: "compliance",
        });
    if (!l.nextReview || !l.eliDue || !l.riskDue || !l.employerDue)
      exceptions.push({
        severity: "Amber",
        text: "Required review or compliance dates missing",
        type: "data",
      });
    if (progress < l.target - 10)
      exceptions.push({
        severity: "Red",
        text: "More than 10% behind learning target",
        type: "progress",
      });
    else if (progress < l.target)
      exceptions.push({
        severity: "Amber",
        text: "Behind learning target",
        type: "progress",
      });
    if (l.plannedEnd && l.predictedEnd > l.plannedEnd)
      exceptions.push({
        severity: "Amber",
        text: "Predicted completion beyond planned end",
        type: "end",
      });
    if (
      l.plannedEnd &&
      l.plannedEnd <= offset(60) &&
      (l.english === "Pending" || l.maths === "Pending")
    )
      exceptions.push({
        severity: "Amber",
        text: "Functional skills outstanding near planned end",
        type: "skills",
      });
  }
  const rag = exceptions.some((e) => e.severity === "Red")
    ? "Red"
    : exceptions.length
      ? "Amber"
      : "Green";
  const gatewayChecks = [
    ["KSB coverage", criteria.length > 0 && progress === 100],
    ["Off-the-job target", hours >= l.otjTarget && l.otjTarget > 0],
    ["English", l.english === "Achieved" || l.english === "Exempt"],
    ["Maths", l.maths === "Achieved" || l.maths === "Exempt"],
    [
      "Review and compliance",
      !!l.nextReview &&
        !!l.eliDue &&
        !!l.riskDue &&
        !!l.employerDue &&
        !exceptions.some((e) => ["review", "compliance"].includes(e.type)),
    ],
  ];
  return {
    ...l,
    progress,
    hours,
    variance: progress - l.target,
    rag,
    exceptions,
    gatewayChecks,
    coverage: criteria.map((c) => ({
      ...c,
      achieved: achieved.has(c.code),
      count: accepted.filter((e) => e.criteria.includes(c.code)).length,
    })),
  };
}
export function seed() {
  const standards = [
    {
      id: id(),
      name: "Business Administrator",
      reference: "Example BA · training template",
      level: 3,
      version: "Illustrative — replace with verified standard",
      criteria: [
        [
          "K1",
          "Knowledge",
          "Understand the purpose, structure and culture of the organisation.",
        ],
        [
          "K2",
          "Knowledge",
          "Understand relevant policies and regulatory requirements.",
        ],
        [
          "K3",
          "Knowledge",
          "Explain how stakeholders influence business activity.",
        ],
        [
          "S1",
          "Skill",
          "Communicate effectively with colleagues and stakeholders.",
        ],
        [
          "S2",
          "Skill",
          "Use digital systems to produce accurate business documents.",
        ],
        ["S3", "Skill", "Plan and manage work to meet agreed deadlines."],
        [
          "B1",
          "Behaviour",
          "Demonstrate professionalism and personal accountability.",
        ],
        ["B2", "Behaviour", "Reflect on performance and respond to feedback."],
      ].map(([code, type, text]) => ({ code, type, text })),
    },
  ];
  const users = [
    ["manager", "Victoria Bryant", "Manager"],
    ["assessor", "Lee Horsley", "Assessor"],
    ["iqa", "Alex Morgan", "IQA"],
    ["apprentice", "Jamie Davies", "Apprentice"],
    ["employer", "Sam Taylor", "Employer"],
  ].map(([key, name, role]) => ({
    id: key,
    name,
    role,
    email: `${key}@archetype.demo`,
    active: true,
  }));
  const names = [
    "Jamie Davies",
    "Amelia Brooks",
    "Oliver Reed",
    "Isla Bennett",
    "Noah Clarke",
    "Ava Mitchell",
    "Leo Walker",
    "Mia Turner",
    "Theo Cooper",
    "Grace Parker",
    "Oscar Lewis",
    "Freya Hall",
    "Archie Young",
    "Ella Scott",
    "Henry Adams",
    "Sophie Green",
    "Jack Baker",
    "Lily Carter",
    "Alfie Wright",
    "Evie Roberts",
    "Arthur Hill",
    "Poppy Evans",
    "Charlie Wood",
    "Alice King",
  ];
  const learners = names.map((name, i) => ({
    id: id(),
    ref: `ARC-${String(i + 1).padStart(4, "0")}`,
    name,
    email: `learner${i + 1}@example.test`,
    employer: [
      "Northstar Digital",
      "Brighton Community Trust",
      "Harbour & Co",
      "South Coast Services",
    ][i % 4],
    standardId: standards[0].id,
    assessorId: "assessor",
    iqaId: "iqa",
    status: i === 22 ? "Paused" : i === 23 ? "Completed" : "Active",
    level: 3,
    target: [65, 45, 80, 50, 30, 75][i % 6],
    otjTarget: 278,
    startDate: offset(-300 - i * 4),
    plannedEnd: offset(100 + i * 7),
    predictedEnd: offset(120 + i * 5),
    lastReview: offset(-40 - i),
    nextReview: offset(i % 5 === 0 ? -12 : 14 + i),
    eliDue: offset(i % 7 === 0 ? -9 : 120),
    riskDue: offset(i % 6 === 0 ? -5 : 90),
    employerDue: offset(90),
    english: i % 4 === 0 ? "Pending" : "Achieved",
    maths: i % 5 === 0 ? "Pending" : "Achieved",
    gatewayDate: "",
    epaDate: "",
    notes: "Fictional demonstration learner.",
    gatewayStatus: "Not ready",
  }));
  users.find((x) => x.id === "apprentice").learnerId = learners[0].id;
  users.find((x) => x.id === "employer").employer = "Northstar Digital";
  const evidence = [],
    otj = [],
    reviews = [],
    tasks = [];
  learners.forEach((l, i) => {
    for (let j = 0; j < 8; j++) {
      if (j > (i % 7) + 1) break;
      evidence.push({
        id: id(),
        learnerId: l.id,
        title: [
          "Understanding our organisation",
          "Working with policy",
          "Stakeholder communication",
          "Customer service reflection",
          "Document production",
          "Planning my workload",
          "Professional practice",
          "Monthly learning reflection",
        ][j],
        type: "Reflective account",
        date: offset(-20 + j),
        description:
          "Example evidence for demonstration. Replace with authentic learner work.",
        criteria: [standards[0].criteria[j].code],
        status: j === (i % 7) + 1 ? "Submitted" : "Accepted",
        feedback:
          j === (i % 7) + 1
            ? ""
            : "Good reflection with clear workplace context. Example assessment.",
        files: [],
        by: "assessor",
        updated: new Date().toISOString(),
        decisions: [],
      });
    }
    otj.push({
      id: id(),
      learnerId: l.id,
      date: offset(-7),
      hours: 80 + i * 4,
      activity: "Illustrative accumulated learning hours",
      reflection: "Sample historical learning record.",
      status: "Approved",
      by: "assessor",
    });
    reviews.push({
      id: id(),
      learnerId: l.id,
      type: "Progress review",
      date: l.lastReview,
      nextDate: l.nextReview,
      text: "Discussed progress, workplace opportunities and wellbeing.",
      actions: "Capture further evidence against outstanding criteria.",
      by: "assessor",
      acknowledgements: [],
    });
    if (i % 3 === 0)
      tasks.push({
        id: id(),
        learnerId: l.id,
        title: "Arrange outstanding review and evidence check",
        owner: "assessor",
        due: offset(i % 2 === 0 ? -3 : 7),
        status: "Open",
        by: "manager",
      });
  });
  return {
    revision: 0,
    users,
    learners,
    standards,
    evidence,
    otj,
    reviews,
    tasks,
    resources: [],
    appointments: [],
    messages: [],
    quality: [],
    audit: [],
    snapshots: [],
  };
}
