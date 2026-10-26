# Assessment, learning-plan and portfolio updates

## Feedback and evidence

Assessors/master users can attach up to five feedback files (5 MB each) when assessing submitted evidence. Accepted and Changes requested are the available decisions; Rejected is no longer offered or accepted for new decisions. Existing historic decisions remain in the audit history. Learners can download their feedback files through the same authenticated learner-scoped file access as portfolio work.

Accepted evidence can be selected with Use for EPA by the apprentice, assigned assessor or master user. It appears in the separate EPA portfolio tab while remaining part of verified KSB coverage. Export EPA portfolio produces an authenticated ZIP containing selected current-programme evidence files, feedback attachments, assessment history and readable/JSON portfolio indexes including reflective text. Private staff notes are excluded. Employer accounts cannot export or download private evidence. The export is limited to 100 MB of attachment data.

## Off-the-job progress

The portfolio and learning-plan workspace display approved hours, expected hours by the selected date, and the difference. Red indicates behind target today; green indicates on target. Future dates show hours still to log rather than claiming an overdue shortfall. Session cards show the expected hours by their scheduled date and session details offer the same date-based comparison. Reports include the programme start date and the expected-to-date comparison.

Expected hours are a planning estimate: total agreed OTJ target multiplied by the fraction of calendar time elapsed between programme start and planned training end (predicted end is used only if no planned end exists). They are clamped to zero before start and the total after end. Missing/invalid dates or an unset total give Not set. This is not a funding-hours calculator; the provider must set dates and targets appropriate to the agreed training plan. Only approved OTJ log entries count towards the actual hours. Plans, review actions, sessions and completed activities do not manufacture approved log hours.

## Learning activities and reviews

Learning activities include Discussion, Observation, Review, Learner support, Assignment, Project, Workshop, Teaching and Other methods. Save as reusable activity adds the activity wording, method, KSB mappings, resources and planned hours to a same-programme template library. Reuse opens a new editable activity for the selected apprentice, with fresh dates and no original learner reflection, attendance or completion data. Remove personal details from wording before sharing a template.

New review forms start with three targets: programme/workplace, development/support and off-the-job learning as Target 3. The shorter fields ask for a goal, steps/evidence, owner and deadline; OTJ includes additional planned hours. The old mandatory Why field is removed, while historical purposes remain readable. Every saved target creates both an owned action and a linked learning-plan activity in the same transaction. Completing/reopening the action updates its linked activity; completing a linked activity updates its action. No OTJ approval or KSB sign-off is implied by this completion. Earlier saved reviews are unchanged.

## Functional skills and confidentiality

The apprentice form includes English and maths upskill options. They appear on gateway readiness and progress reports. The assigned assessor/master user can tick English/Maths not required in the gateway checklist after checking the applicable programme rules. These decisions are stored with the confirming user/time; they do not falsely change a qualification result to Achieved. An upskill option without an achieved/exempt result or a confirmed not-required decision remains outstanding.

Confidential learner notes are available on the portfolio only to the master user and the assigned assessor. Both dedicated note records and existing staff-note text are removed from apprentice, employer and IQA API responses. Tracker notes are likewise restricted to the master/assessor. Confidential notes are not included in EPA packs or learner-facing review content. Encrypted administrator backups still contain the full authorised workspace.

## Internal similarity and AI review

New evidence uploads automatically queue a local text check in production. No learner work is sent to an external AI or plagiarism service. Set INTEGRITY_ENABLED=0 to disable checks, or =1 to enable them explicitly (including a training workspace). The queue persists across restarts and runs one worker at a time, without blocking the HTTP request. Existing evidence can be checked using Check internal similarity.

The worker reads evidence commentary and readable TXT/Markdown/CSV, DOCX main-body text and PDF text. It compares normalised seven-word phrases with up to 2,000 recently checked stored submissions, within an eight-million-character comparison budget, excluding the same evidence item. The reported percentage is the highest matching share against a stored comparison text, not a verdict of plagiarism. It does not search the internet, publications or commercial reference databases and does not automatically index all historic evidence. Shared prompts, quotations and legitimate reuse can match. Other learners' names, text and file details are never disclosed in a result.

At least 50 readable words are needed for a percentage; no comparison source produces No comparison sources rather than a fabricated score. Images, scanned/password-protected PDFs and unsupported files require manual review. PDF text checks are limited to 100 pages and combined text to the first 100,000 characters. Work runs in a memory-limited worker with a 45-second timeout. Failures show Check unavailable instead of an invented result. Extracted comparison text is stored privately in SQLite, outside the API workspace; normal encrypted backups include it.

There is deliberately **no AI-authorship probability score**. Repeated-paragraph counts are review signals only, not evidence of AI use. Assessors should use discussion, drafts and workplace evidence to establish understanding. Similarity/AI review never automatically rejects evidence, changes a KSB decision or blocks gateway readiness.

These changes preserve existing data, accounts and passwords and do not reset the workspace.
