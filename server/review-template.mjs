// Blank review prompts only. Never include completed answers or personal data from a reference document.
export const REVIEW_VERSION = "progress-review-v2";
export const REVIEW_DECLARATION =
  "The contents of this review have been agreed between the learner, employer and assessor. Each participant must acknowledge the review from their own account.";
export const REVIEW_RAG = ["On target", "Below target", "Insufficient"];
export const REVIEW_CHECKS = [
  {
    key: "otjAuthenticated",
    section: "Training & assessment",
    label: "Has off-the-job training been evidenced and authenticated?",
    detailWhen: "No",
    detailLabel: "Evidence gaps and action to authenticate the learning log",
  },
  {
    key: "otherFundedTraining",
    section: "Training & assessment",
    label:
      "Is the apprentice taking other funded training with another provider?",
    detailWhen: "Yes",
    detailLabel: "Other funded training and provider details",
  },
  {
    key: "planChanged",
    section: "Training & assessment",
    label:
      "Have there been changes to the programme, training or assessment plan?",
    detailWhen: "Yes",
    detailLabel: "Plan changes, agreement and follow-up",
  },
  {
    key: "workplaceIssues",
    section: "Training & assessment",
    label:
      "Are there issues at work or college, including safeguarding or Prevent concerns?",
    detailWhen: "Yes",
    detailLabel:
      "Agreed support, reporting and follow-up (shared summary only)",
  },
  {
    key: "absence",
    section: "Training conditions",
    label:
      "Any absence or missed work, training or appointments in the last 10 weeks?",
    detailWhen: "Yes",
    detailLabel: "Reason, impact and catch-up arrangements",
  },
  {
    key: "accident",
    section: "Training conditions",
    label: "Any accidents in the last 12 weeks?",
    detailWhen: "Yes",
    detailLabel: "Accident follow-up and reporting arrangements",
  },
  {
    key: "roleChanged",
    section: "Training conditions",
    label:
      "Any significant change of work role or supervisor in the last 12 weeks?",
    detailWhen: "Yes",
    detailLabel: "Changes, office notification and induction arrangements",
  },
  {
    key: "additionalIAG",
    section: "Training conditions",
    label:
      "Has additional information, advice and guidance been provided in the last 10 weeks?",
    detailWhen: "Yes",
    detailLabel: "Information, advice and guidance provided",
  },
  {
    key: "ppe",
    section: "Training conditions",
    label:
      "Is personal protective equipment appropriate and in good condition?",
    choices: ["Yes", "No", "Not applicable"],
    detailWhen: "No",
    detailLabel: "PPE concerns and corrective action",
  },
  {
    key: "alsCurrent",
    section: "Training conditions",
    label: "Is the apprentice currently receiving additional learning support?",
    detailWhen: "Yes",
    detailLabel: "Current learning support and review of effectiveness",
  },
  {
    key: "alsRequested",
    section: "Training conditions",
    label: "Does the apprentice feel they require additional learning support?",
    detailWhen: "Yes",
    detailLabel: "Support requested and agreed referral action",
  },
  {
    key: "previousActionsAchieved",
    section: "Recall & recap",
    label: "Have all actions from the previous review been achieved?",
    choices: ["Yes", "No", "Not applicable"],
    detailWhen: "No",
    detailLabel: "Outstanding actions carried into the new SMART targets",
  },
];
export const REVIEW_NARRATIVES = [
  {
    key: "assessmentPlanDiscussion",
    section: "Training & assessment",
    label: "Assessment plan and ongoing training needs",
    help: "Discuss the plan with the apprentice and employer, including how workplace activity and off-the-job training connect.",
  },
  {
    key: "recap",
    section: "Recall & recap",
    label: "Recall and recap",
    help: "Review previous actions and the training delivered since the last review.",
  },
  {
    key: "equalityDiversity",
    section: "Inclusion, safeguarding & wellbeing",
    label: "Equality, diversity and inclusion",
    help: "Record the discussion, understanding and application in the workplace.",
  },
  {
    key: "safeguardingPrevent",
    section: "Inclusion, safeguarding & wellbeing",
    label: "Safeguarding and Prevent",
    help: "Check understanding of reporting, escalation and professional boundaries. Record a shared summary; use your safeguarding procedure for confidential disclosures.",
  },
  {
    key: "english",
    section: "Functional skills",
    label: "English development and workplace application",
    help: "Record progress, use of English at work, and next steps; explain if exempt or not applicable.",
  },
  {
    key: "maths",
    section: "Functional skills",
    label: "Maths development and workplace application",
    help: "Record progress, use of maths at work, and next steps; explain if exempt or not applicable.",
  },
  {
    key: "knowledge",
    section: "Knowledge, skills & behaviours",
    label: "New knowledge and its application",
    help: "What has been learned and how has it been applied towards the apprenticeship?",
  },
  {
    key: "skills",
    section: "Knowledge, skills & behaviours",
    label: "New skills and their application",
    help: "What practical skills have developed, with examples of application at work?",
  },
  {
    key: "behaviours",
    section: "Knowledge, skills & behaviours",
    label: "Behaviours demonstrated at work",
    help: "What behaviours have developed and what workplace examples demonstrate them?",
  },
  {
    key: "trainingImpact",
    section: "Impact & participant comments",
    label: "Training impact on the role",
    help: "Record positive impact, concerns and changes in workplace performance.",
  },
];
export const TARGET_CATEGORIES = [
  "Programme / workplace",
  "Off-the-job learning",
  "English",
  "Maths",
  "Support",
];
