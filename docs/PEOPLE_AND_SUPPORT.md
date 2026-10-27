# Apprentice support, staff development, success and updates

## Edit an apprentice

Open an apprentice → Edit apprentice. Programme details stay in **Programme**. **Personal & ALS** adds the home address, date of birth, telephone number, emergency contact name/relationship/numbers/optional email, additional-learning-support status and record, reasonable adjustments/support plan and a support-review date. A future date of birth is rejected. Switching tabs keeps unsaved values until you save or close the editor.

**Documents** uploads certificates, ALS assessments/diagnoses, medical information and other supporting documents. Choose a category and up to five files (5 MB each), then save the apprentice. Existing documents have download/remove controls. Removing a document hides it from current access; historical backups/snapshots can retain previous records.

Personal/support details and these documents are private to the master administrator and the apprentice's current assigned assessor. IQA, employer, apprentice and other-assessor accounts cannot read them. Files use a separate protected table and download endpoint, with attachment, private/no-store, sandbox and nosniff headers. They are stored in the persistent database and its encrypted backups. They are not copied automatically into Outlook, success posts or staff-development logs.

## Assessor 1:1s and My 1:1s

The master administrator opens **Assessor 1:1s** and records the meeting date, status, summary, performance/quality, wellbeing/workload, development/CPD, agreed next steps, confidential manager notes and next meeting date. Completed records require a summary and cannot be in the future. Previous versions are retained when a record is edited.

Assessors find **My delivery → My 1:1s** and can read their own completed and planned records. They cannot edit the meeting record or see another assessor's records. Drafts and the **Confidential manager notes** field stay master-admin-only, including in version history. The manager's form explains this sharing before saving.

A 1:1 can optionally link an apprentice in that assessor's caseload. Shared records show the linked name and provide an apprentice-profile link when the viewer still has access. Existing historical links can be retained after a caseload changes; they do not grant access to private apprentice records.

**Actions for the assessor's action plan → Add action** adds structured titles and due dates. These actions are assigned to the assessor automatically and appear in their **Action plans** once the 1:1 is shared. Draft 1:1 actions stay private. The assessor can mark actions complete or reopen them from the action plan; the 1:1 view shows the same status. Saving the 1:1 again updates existing actions rather than duplicating them. Existing actions remain in the record and can be updated/completed; unsaved new rows can be removed before saving.

These management actions are separate from learner actions. Linking an apprentice does not expose them to that apprentice, their employer or IQA, or add them to the apprentice's learning plan/OTJ total. Configured morning reminders include due shared 1:1 actions only for the owner and master admin; actions linked to fictional apprentices are excluded.

## Assessor CPD log

Assessors open **My delivery → CPD log** to add and edit professional learning. Record the title, date, activity type, hours, completed/planned/draft status, details, reflection, impact on practice and next steps. Completed entries need a reflection and cannot be in the future. Only completed entries contribute to CPD-hour totals; no mandatory annual-hours threshold is invented.

Year filters and totals show the learning history and most recent completed activity. Certificates/evidence can be attached (five new files at a time, 5 MB each). These files and entries are private to the owner and master admin; assessors cannot view or change another assessor's CPD. Master administrators can review/filter the team's CPD and record on an assessor's behalf. Entries can be deleted after an inline confirmation. Stored entries, evidence and 1:1 actions survive restarts. CPD does not count towards any apprentice's OTJ hours.

## Success and updates

The master administrator opens **Success and updates**. Choose **Learner success**, **Assessor success**, or **Update**, then choose an audience: **Assessors**, **Learners**, or **Assessors and learners**. New posts default to both groups; older posts without an audience remain assessor-only until deliberately changed.

Success stories have a person's name, achievement, title, story and optional quote. Updates need a title and message; they do not require a person's achievement. Review the preview and select **Publish to selected audience** before choosing **Publish post**, or save as a private draft.

Multiple posts can remain published. The targeted assessor/apprentice dashboards show a **Success and updates** section with the latest featured post, other posts to open, and expandable longer stories. Employer and IQA accounts are not part of these audiences. Already open dashboards refresh through the normal workspace update cycle; sign-in loads the current feed immediately.

Select an item in **Saved posts** and use **Unpublish post** to take it off dashboards while retaining the draft. Use **Delete post**, then **Confirm delete post**, to remove it from saved posts and dashboards; **Keep post** cancels deletion. Deleting/unpublishing one post leaves other posts unchanged. Published content uses only the text entered by the master administrator, not private learner or supervision details.

## Quick attendance

Calendar and learning-plan session cards provide **Mark attended** and an attendance dropdown. Authorised managers/assigned assessors can record or correct attendance directly without opening the session editor. Attendance is visible to other authorised participants, but only staff can change it. Cancelled/earlier-programme sessions are read-only; future attendance waits until the session date. Changes retain an attendance history and update the shared record. Recording attendance does not complete review paperwork, sign a review or approve OTJ hours.

## Reusable learning activities

In a learning plan, **Reusable learning activities** is a dropdown of templates for the current standard. Select one to preview its method, description, criteria and planned hours, then choose **Use selected activity**. Review the dates and wording before saving. Changing apprentice resets the selection; templates for other standards are excluded. Saving activities as reusable templates remains available on learning-plan cards.

## Review target ownership and learning plans

Target owners are no longer selected or displayed in the review form/report. New review targets belong to the apprentice automatically. The system links ownership to the apprentice record, so reviews can be completed before a learner login is created. A subsequently linked apprentice account can manage those target actions.

Completing a review atomically creates one learner action and one linked learning-plan activity for every target, using its goal, steps, due date and planned hours. Completing the action updates its linked learning activity; planned hours do not become approved OTJ hours automatically. Validation failures do not create partial actions or learning-plan entries.

### EPA results and performance

Edit apprentice → Programme records Not recorded, Distinction, Pass or Fail and the result date. The assessor workspace hero shows counts and percentages of learners with recorded results, rather than dividing by the whole caseload. Result corrections retain history. The original assessor retains credit when a learner is reassigned; completed/archived learner outcomes remain in the separate results ledger. Clearing a mistakenly entered result removes it from the percentages. A once-only migration adds varied results to existing fictional practice learners only, without changing real learners or accounts.

### Alerts

Apprentice and employer accounts have an Alerts inbox with Unread, Action needed, All and Cleared views. Shared staff decisions on evidence and OTJ logs, completed reviews, actions, learning activities, sessions, programme changes and direct messages generate recipient-scoped notifications. Existing outstanding records are included on rollout. Review targets are reached through the review notification and linked learning-plan activities. Employer notices respect their organisation access and take evidence/OTJ notices to the progress report rather than exposing portfolio files. Confidential portfolio notes, personal/ALS records, medical uploads, staff-only session notes, CPD and assessor supervision are excluded.

Read/clear state persists in SQLite per recipient, including across restarts. Clear does not complete an action or resolve returned work. Staff can separately clear/restore derived risk alerts; clearing does not change learner RAG. A materially changed warning appears again. These controls do not change morning reminder preferences or delivery schedules.

### Apprentice accounts

Accounts & caseload → Add workspace account → Apprentice automatically creates that person's own apprentice profile when no existing record is selected. No separate manual linking step is required. An existing profile with the same unique email is reused automatically. New profiles start paused with no invented programme, employer, dates or hours; complete these in Edit apprentice before activating the programme. The optional existing-profile selection allows staff to give an already enrolled apprentice a login without duplicating their portfolio. A learner can have only one apprentice login. Editing an apprentice login retains its own profile automatically and preserves its password.

### Assessor day at a glance

The assessor welcome panel includes a live agenda beside the greeting (stacked on smaller screens). It shows the next planned session or review, overdue/today review counts, submitted evidence awaiting feedback and pending OTJ logs, with links into the relevant workspace. It uses the assessor’s active caseload and current programme only; cancelled, attended and past sessions are excluded. Session times and the day boundary use Europe/London.

Gateway/EPA highlights cover the next 60 days, ordered by recorded date. Confirmed EPA/gateway dates are labelled as bookings; a predicted course end (or planned end when no prediction exists) is labelled “Course end · plan gateway” and does not create or imply a booking. Apprentices with recorded EPA results are excluded. Selecting a highlighted apprentice opens their gateway checklist. Empty states link to Calendar or Gateway & EPA without adding fictional records.

The master dashboard also shows **Overall EPA results**, with Distinction, Pass and Fail counts and percentages across all assessors. The denominator is apprentices with recorded outcomes; each apprentice counts once using their latest result, and completed/archived apprentices remain included. It calculates from the outcomes ledger rather than averaging assessor percentages. Assessor views retain their original assessor-specific attribution.

The assessor welcome figures are three clickable summary cards: Your apprentices (My caseload), Average KSB progress (Progress report), and Apprentices needing support (Interventions). The support card uses an amber highlight; cards stack on phones to keep labels readable.

Portfolio health on the master dashboard now uses actionable status rows rather than a chart. On track, Needs attention and Priority support open the apprentice directory prefiltered to Green, Amber or Red. View all opens the unfiltered directory; Average KSB progress opens Progress report, and View support priorities opens Interventions. The assessor blue welcome tile retains its agenda, summary cards and EPA results in a more compact layout, with smaller elements and balanced spacing.
