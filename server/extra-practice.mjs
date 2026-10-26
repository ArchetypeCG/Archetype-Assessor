import { id, today } from "./model.mjs";
import { expectedOtjHours } from "./otj-target.mjs";
export const EXTRA_PRACTICE_VERSION =
  "twenty-additional-fictional-apprentices-2026-10-26-v1";
const addDays = (day, count) =>
  new Date(Date.parse(day + "T12:00:00Z") + count * 86400000)
    .toISOString()
    .slice(0, 10);
const names = [
  "Harper Wren",
  "Elliot Finch",
  "Sienna Blake",
  "Nathan Reed",
  "Amara Stone",
  "Lucas Hart",
  "Zara Quinn",
  "Dylan Frost",
  "Maya Rivers",
  "Toby Lane",
  "Leila Hayes",
  "Oscar Birch",
  "Nina Wells",
  "Felix Meadow",
  "Isabel Crane",
  "Reuben Fox",
  "Esme Dale",
  "Adam Westbrook",
  "Clara Moss",
  "Samir Oak",
];
const scenarios = [
  "New starter",
  "Building confidence",
  "Ahead of OTJ target",
  "Evidence awaiting assessment",
  "Feedback and resubmission",
  "Behind learning target",
  "Overdue review",
  "OTJ catch-up needed",
  "Pending OTJ approvals",
  "Maths upskill",
  "English upskill",
  "Functional skills exempt",
  "Employer checks overdue",
  "Review actions outstanding",
  "Paused programme",
  "Withdrawn programme",
  "EPA preparation",
  "Near gateway",
  "Gateway checks ready",
  "Completed programme",
];
export function installExtraPractice(s, { day = today(), makeId = id } = {}) {
  if ((s.migrations || []).includes(EXTRA_PRACTICE_VERSION)) return null;
  const manager = s.users.find((u) => u.active && u.role === "Manager");
  const standards = s.standards.filter((st) => st.criteria?.length);
  if (!manager || !standards.length) return null; // Retry once the workspace is configured.
  for (const key of [
    "learners",
    "evidence",
    "otj",
    "reviews",
    "tasks",
    "learningPlans",
    "appointments",
    "samplingPlans",
    "audit",
    "migrations",
  ])
    s[key] ||= [];
  const assessors = s.users.filter((u) => u.active && u.role === "Assessor"),
    iqas = s.users.filter((u) => u.active && u.role === "IQA");
  for (let i = 0; i < 20; i++) {
    const standard = standards[i % standards.length],
      assessor = assessors[i % Math.max(1, assessors.length)],
      iqa = iqas[i % Math.max(1, iqas.length)],
      by = assessor?.id || manager.id;
    const elapsed = [
      20, 45, 75, 110, 145, 180, 215, 250, 285, 320, 355, 390, 425, 455, 490,
      520, 550, 580, 610, 650,
    ][i];
    const duration = i >= 17 ? 630 : 420 + (i % 5) * 45;
    const fraction =
      i >= 18
        ? 1
        : [
            0.02, 0.1, 0.18, 0.24, 0.29, 0.15, 0.33, 0.4, 0.46, 0.52, 0.58,
            0.63, 0.68, 0.72, 0.45, 0.27, 0.86, 0.95,
          ][i];
    let ref = `PRACTICE-${String(i + 1).padStart(3, "0")}`;
    if (s.learners.some((l) => l.ref === ref)) ref += "-" + makeId();
    const learner = {
      id: makeId(),
      ref,
      name: names[i] + " (fictional)",
      email: "",
      employer:
        [
          "Oakfield Services",
          "Harbour Digital",
          "Meadow Health Partnership",
          "Cedar Operations",
          "Northbank Community Trust",
        ][i % 5] + " (fictional)",
      standardId: standard.id,
      level: standard.level,
      assessorId: assessor?.id || "",
      iqaId: iqa?.id || "",
      status:
        i === 14
          ? "Paused"
          : i === 15
            ? "Withdrawn"
            : i === 19
              ? "Completed"
              : "Active",
      target:
        i >= 18
          ? 100
          : Math.min(
              95,
              Math.round(fraction * 100) +
                (i === 5 ? 25 : i % 3 === 0 ? 8 : -3),
            ),
      otjTarget: 278 + i * 6,
      startDate: addDays(day, -elapsed),
      plannedEnd: addDays(day, duration - elapsed),
      predictedEnd: addDays(
        day,
        duration - elapsed + (i === 7 || i === 13 ? 28 : 0),
      ),
      lastReview: addDays(day, -Math.min(elapsed - 1, 14 + i)),
      nextReview: addDays(day, i === 6 ? -12 : 10 + i),
      eliDue: addDays(day, i === 12 ? -7 : 90 + i),
      riskDue: addDays(day, i === 12 ? -3 : 110 + i),
      employerDue: addDays(day, 100 + i),
      english: i === 10 ? "Pending" : i === 11 ? "Exempt" : "Achieved",
      maths: i === 9 ? "Pending" : i === 11 ? "Exempt" : "Achieved",
      englishUpskill: i === 10,
      mathsUpskill: i === 9,
      gatewayStatus: i === 19 ? "Ready" : "Not ready",
      gatewayDate: i === 19 ? addDays(day, -25) : "",
      epaDate:
        i === 19 ? addDays(day, -5) : i >= 16 ? addDays(day, 45 + i) : "",
      fictional: true,
      practiceBatch: EXTRA_PRACTICE_VERSION,
      practiceScenario: scenarios[i],
      notes: `Fictional practice learner: ${scenarios[i]}. Created at your request for testing; all activities, decisions and results are invented. No login account or email address is created.`,
    };
    s.learners.push(learner);
    const base = {
      learnerId: learner.id,
      standardId: standard.id,
      by,
      fictional: true,
    };
    const codes = standard.criteria.map((c) => c.code),
      covered = codes.slice(0, Math.round(codes.length * fraction));
    const accepted = [];
    for (let j = 0; j < covered.length; j += 6) {
      const date = addDays(
        day,
        -Math.min(elapsed - 1, 7 + Math.floor(j / 6) * 4),
      );
      const e = {
        ...base,
        id: makeId(),
        title: `Fictional ${["workplace project", "observation", "professional discussion", "reflective account"][Math.floor(j / 6) % 4]} ${Math.floor(j / 6) + 1}`,
        type: [
          "Project",
          "Observation",
          "Professional discussion",
          "Reflective account",
        ][Math.floor(j / 6) % 4],
        date,
        description: `Fictional ${scenarios[i].toLowerCase()} example for ${standard.name}: plan a workplace task, apply the mapped learning and reflect on the result. This is invented practice evidence.`,
        criteria: covered.slice(j, j + 6),
        status: "Accepted",
        feedback:
          "Fictional assessment decision: mapped criteria accepted to demonstrate verified progress.",
        files: [],
        epaSelected: i >= 16,
        updated: date + "T12:00:00.000Z",
        decisions: [],
      };
      e.decisions.push({
        by,
        date: e.updated,
        status: e.status,
        feedback: e.feedback,
        files: [],
      });
      s.evidence.push(e);
      accepted.push(e);
    }
    if (i < 18)
      s.evidence.push({
        ...base,
        id: makeId(),
        title: `Fictional next submission · ${scenarios[i]}`,
        type: "Work product",
        date: addDays(day, -2),
        description:
          "Fictional practice submission: explain how you applied the selected criteria in a workplace task and identify your next improvement.",
        criteria: codes.slice(covered.length, covered.length + 2).length
          ? codes.slice(covered.length, covered.length + 2)
          : codes.slice(0, 1),
        status: i === 4 ? "Changes requested" : i === 0 ? "Draft" : "Submitted",
        feedback:
          i === 4
            ? "Please add a specific workplace example and explain the outcome. Fictional feedback for resubmission practice."
            : "",
        files: [],
        epaSelected: i === 17,
        updated: day + "T09:00:00.000Z",
        decisions:
          i === 4
            ? [
                {
                  by,
                  date: addDays(day, -1) + "T10:00:00.000Z",
                  status: "Changes requested",
                  feedback: "Add a specific workplace example.",
                  files: [],
                },
              ]
            : [],
      });
    const expected = expectedOtjHours(learner, day),
      total =
        i >= 18
          ? learner.otjTarget
          : Math.round(
              expected *
                [
                  0.55, 0.95, 1.25, 1.05, 0.8, 0.6, 0.9, 0.35, 0.5, 1.1, 0.9,
                  1.15, 0.7, 0.85, 0.6, 0.4, 1.03, 0.98,
                ][i] *
                4,
            ) / 4;
    const count = Math.max(1, Math.ceil(total / 12));
    let remaining = total;
    for (let j = 0; j < count && remaining > 0; j++) {
      const hours = Math.min(12, remaining);
      s.otj.push({
        ...base,
        id: makeId(),
        date: addDays(
          learner.startDate,
          Math.max(1, Math.floor(((elapsed - 1) * (j + 1)) / count)),
        ),
        hours,
        activity: [
          "Fictional coached workplace learning",
          "Fictional taught workshop",
          "Fictional guided research",
          "Fictional skills practice",
        ][j % 4],
        reflection:
          "Fictional learning reflection: explored the topic, practised a new approach and identified how to apply it at work.",
        criteria: codes.slice(j % codes.length, (j % codes.length) + 1),
        status: "Approved",
        reviewedBy: by,
      });
      remaining = Math.round((remaining - hours) * 100) / 100;
    }
    if (i < 18)
      s.otj.push({
        ...base,
        id: makeId(),
        date: addDays(day, -1),
        hours: 1 + (i % 8) * 0.5,
        activity: "Fictional learning awaiting verification",
        reflection: "Fictional reflection for approval practice.",
        criteria: codes.slice(0, 1),
        status: i === 7 ? "Returned" : "Pending",
        feedback: i === 7 ? "Please describe what you learned." : "",
      });
    const task = {
      ...base,
      id: makeId(),
      title: `Fictional action: ${i === 7 ? "update the OTJ log" : i === 9 ? "complete maths practice" : i === 10 ? "complete English practice" : "prepare the next workplace example"}`,
      owner: by,
      due: addDays(day, i === 13 ? -4 : 7 + i),
      status: i === 19 ? "Complete" : "Open",
      ...(i === 19
        ? { completedAt: addDays(day, -5) + "T12:00:00.000Z", completedBy: by }
        : {}),
    };
    s.tasks.push(task);
    s.learningPlans.push({
      ...base,
      id: makeId(),
      title: `Fictional learning plan · ${scenarios[i]}`,
      method: [
        "Discussion",
        "Observation",
        "Review",
        "Learner support",
        "Assignment",
        "Project",
        "Workshop",
        "Teaching",
      ][i % 8],
      description: `Fictional ${scenarios[i].toLowerCase()} activity: use a workplace example to practise the selected criteria, receive feedback and record learning.`,
      objectives:
        "Apply the mapped learning, explain the result and agree the next step.",
      criteria: codes.slice(0, 2),
      resources: [],
      startDate: addDays(day, -7),
      due: addDays(day, i === 19 ? -2 : 14 + i),
      plannedHours: 2 + (i % 5),
      status: i === 19 ? "Completed" : i % 3 === 0 ? "Planned" : "In progress",
      completionNotes: i === 19 ? "Fictional activity completed." : "",
      learnerReflection: "",
      sessionId: "",
    });
    s.reviews.push({
      ...base,
      id: makeId(),
      type: "Progress review",
      date: learner.lastReview,
      nextDate: learner.nextReview,
      text: `Fictional review: discussed ${scenarios[i].toLowerCase()}, evidence, off-the-job learning, wellbeing and support.`,
      actions: task.title,
      acknowledgements: [],
    });
    const participants = [
      ...new Set([manager.id, assessor?.id].filter(Boolean)),
    ];
    for (const review of [true, false])
      s.appointments.push({
        ...base,
        id: makeId(),
        title: review
          ? `Fictional progress review · ${scenarios[i]}`
          : "Fictional coached learning session",
        type: review ? "Progress review" : "Learning session",
        date: review ? learner.nextReview : addDays(day, 2 + i),
        time: ["09:00", "10:00", "11:00", "13:00", "14:00"][i % 5],
        endTime: ["10:00", "11:00", "12:00", "14:00", "15:00"][i % 5],
        timezone: "Europe/London",
        delivery: i % 2 ? "Online" : "In person",
        location:
          i % 2 ? "Online meeting to be arranged" : "Fictional training centre",
        meetingUrl: "",
        description:
          "Fictional session: discuss progress, review the selected criteria and agree practical next steps.",
        objectives:
          "Review evidence and OTJ progress; agree the next learning priorities.",
        preparation: "Bring a workplace example and your updated OTJ log.",
        criteria: codes.slice(0, 2),
        resources: [],
        participants,
        attendance: "Not recorded",
        status: i === 19 ? "Cancelled" : "Planned",
        cancellationReason: i === 19 ? "Fictional programme completed." : "",
        notes: "",
        outcomeNotes: "",
        staffNotes: "",
      });
    if (iqa && accepted.length && i % 4 === 0)
      s.samplingPlans.push({
        id: makeId(),
        learnerId: learner.id,
        standardId: standard.id,
        title: `Fictional sample · ${scenarios[i]}`,
        date: addDays(day, 5 + i),
        criteria: accepted[0].criteria,
        evidenceIds: [accepted[0].id],
        method: i === 12 ? "Risk-based" : "Interim",
        risk: i === 12 ? "High" : "Low",
        notes:
          "Fictional sampling plan for testing evidence selection and IQA workflow.",
        ownerId: iqa.id,
        status: "Planned",
        createdAt: day + "T12:00:00.000Z",
        fictional: true,
      });
  }
  s.migrations.push(EXTRA_PRACTICE_VERSION);
  s.revision++;
  s.audit.unshift({
    id: makeId(),
    by: "system",
    actor: "Requested practice expansion",
    role: "System",
    action: "workspace.practice.add20",
    learnerId: null,
    date: day + "T12:00:00.000Z",
    addedFictional: 20,
  });
  return { addedFictional: 20 };
}
