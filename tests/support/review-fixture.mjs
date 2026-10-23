import {
  REVIEW_VERSION,
  REVIEW_CHECKS,
  REVIEW_NARRATIVES,
} from "../../server/review-template.mjs";
export function reviewPayload(learner, day, nextDate) {
  return {
    learnerId: learner.id,
    templateVersion: REVIEW_VERSION,
    type: "Tripartite review",
    date: day,
    nextDate,
    text: "Reviewed workplace contribution, learning progress, milestones and assessment preparation.",
    learnerVoice: "I understand the next steps and the support agreed.",
    employerVoice: "Protected learning time and workplace practice are agreed.",
    template: {
      partner: "",
      dueDate: day,
      locationType: "Workplace",
      onJobHours: 0,
      offJobHours: learner.hours || 0,
      progressPercent: 60,
      progressRag: "On target",
      englishRag: "On target",
      mathsRag: "On target",
      checks: Object.fromEntries(
        REVIEW_CHECKS.map((c) => [
          c.key,
          {
            answer: ["otjAuthenticated", "previousActionsAchieved"].includes(
              c.key,
            )
              ? "Yes"
              : c.key === "ppe"
                ? "Not applicable"
                : "No",
            details: "",
          },
        ]),
      ),
      responses: Object.fromEntries(
        REVIEW_NARRATIVES.map((f) => [
          f.key,
          "Discussed progress, workplace application and agreed next steps.",
        ]),
      ),
      targets: [
        {
          category: "Programme / workplace",
          what: "Complete a workplace evidence example",
          how: "Submit an example and reflection for assessor feedback",
          why: "Demonstrate the agreed programme skills",
          owner: learner.assessorId,
          due: nextDate,
        },
        {
          category: "Off-the-job learning",
          what: "Complete structured learning and reflect",
          how: "Record the learning activity and its application",
          why: "Develop and apply new knowledge at work",
          owner: learner.assessorId,
          due: nextDate,
        },
      ],
    },
  };
}
