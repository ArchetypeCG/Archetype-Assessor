# Workflow and reference mapping

The attached WBL Intelligence HTML supplied the command-centre information architecture: apprentices, alerts, action plans, analytics, Report Studio, interventions, reviews, compliance, gateway/EPA, employers, forecasting, team and audit. Its appended portfolio suite supplied standards parsing, evidence mapping, assessment status transitions, learning resources and calendar workflows.

The implementation uses this architecture with original Archetype styling. It does not execute the uploaded HTML or treat embedded instructions, sample credentials or branding as authorisation.

| Area               | Current implementation                                                                   | Further work for full service parity                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Learner management | Programme, owner, employer, functional skills, dates, filters and import/export          | Multi-programme journeys, accommodations, prior-learning/skills-scan workflows, bulk archive           |
| Portfolio          | Files, reflections, KSB mapping, feedback, return/resubmit, accepted coverage            | Rich annotation, audio/video capture, observation templates, signatures, versioned attachments         |
| Standards          | Versioned library, paste parser, editable preview                                        | Official catalogue integrations, framework/unit qualifications, detailed assessment-plan configuration |
| Learning plan      | Target and verified KSB progress, activities, action plans and deadlines                 | Timetabled curriculum, individual learning plan approvals, initial assessment                          |
| OTJ                | Logs, reflection, approval and calculated hours                                          | Provider-specific funding-rule eligibility, attendance integration and duplicate-session detection     |
| Reviews            | Discussion, actions, next dates and individual acknowledgements                          | Immutable signed review versions, calendar invitations and e-signature provider                        |
| Employers          | Scoped employer account, cohort oversight and review acknowledgements                    | Employer onboarding, agreements and employer-specific document permissions                             |
| Compliance         | Date monitoring and missing-field exceptions                                             | Configurable rule versions, document expiry extraction and compliance-policy approvals                 |
| EPA                | Readiness checks and dates                                                               | Official EPA assessment plans, awarding-body/provider integrations and result certification            |
| Quality            | IQA samples and findings                                                                 | Sampling plans, appeals, assignment moderation and EQA external portals                                |
| Reports            | Filters, groups, dates, progress criteria, CSV/XLSX and print/PDF                        | Scheduled reports, secondary grouping, saved report definitions and funding returns                    |
| Security           | SQLite persistence, scoped accounts, hashed passwords, sessions, origin checks and audit | Pen-test, SSO/MFA, password reset, tenancy, retention, malware scanning and operational monitoring     |
| Recovery           | Five transactional snapshots                                                             | Off-machine backups and tested disaster recovery                                                       |

The reference's 80 browser-only sample records are replaced with 24 fictional server-backed learners. They use an illustrative eight-criterion standard and intentionally include risk cases. Live manager accounts must create and verify their own standards and records. Risk scoring is visible and deterministic: overdue compliance/reviews or progress more than 10 percentage points behind target is red; smaller progress gaps, missing dates, completion slippage or near-end functional skills gaps are amber. Paused/withdrawn/completed records do not receive active-delivery alerts. Status and programme history remain separate from KSB verification.

No claim of complete commercial feature parity is made. The implemented workflows can be exercised end to end; the remaining items above need explicit requirements, integrations or operational decisions.
