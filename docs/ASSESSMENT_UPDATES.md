# Assessment, learning-plan and portfolio updates

## Feedback and evidence

Assessors/master users can attach up to five feedback files (5 MB each) when assessing submitted evidence. Accepted and Changes requested are the available decisions; Rejected is no longer offered or accepted for new decisions. Existing historic decisions remain in the audit history. Learners can download their feedback files through the same authenticated learner-scoped file access as portfolio work.

Current-programme evidence can be selected with the EPA folder checkbox by the apprentice, assigned assessor or master user, including work awaiting assessment. Selected pieces remain visible in the main portfolio and also appear in the EPA portfolio tab; selection persists through edits and can be unticked. Draft or submitted pieces are labelled as awaiting acceptance before export. Selection does not assess work or change KSB coverage. Export EPA portfolio includes only accepted selected evidence and produces an authenticated ZIP containing selected current-programme evidence files, feedback attachments, assessment history and readable/JSON portfolio indexes including reflective text. Private staff notes are excluded. Employer accounts cannot export or download private evidence. The export is limited to 100 MB of attachment data.

## Off-the-job progress

The portfolio and learning-plan workspace display approved hours, expected hours by the selected date, and the difference. Red indicates behind target today; green indicates on target. Future dates show hours still to log rather than claiming an overdue shortfall. Session cards show the expected hours by their scheduled date and session details offer the same date-based comparison. Reports include the programme start date and the expected-to-date comparison.

Expected hours are a planning estimate: total agreed OTJ target multiplied by the fraction of calendar time elapsed between programme start and planned training end (predicted end is used only if no planned end exists). They are clamped to zero before start and the total after end. Missing/invalid dates or an unset total give Not set. This is not a funding-hours calculator; the provider must set dates and targets appropriate to the agreed training plan. Only approved OTJ log entries count towards the actual hours. Plans, review actions, sessions and completed activities do not manufacture approved log hours.

## Learning activities and reviews

Learning activities include Discussion, Observation, Review, Learner support, Assignment, Project, Workshop, Teaching and Other methods. Save as reusable activity adds the activity wording, method, KSB mappings, resources and planned hours to a same-programme template library. Reuse opens a new editable activity for the selected apprentice, with fresh dates and no original learner reflection, attendance or completion data. Remove personal details from wording before sharing a template.

New review forms start with three targets: programme/workplace, development/support and off-the-job learning as Target 3. The shorter fields ask for a goal, steps/evidence, owner and deadline; OTJ includes additional planned hours. The old mandatory Why field is removed, while historical purposes remain readable. Every saved target creates both an owned action and a linked learning-plan activity in the same transaction. Completing/reopening the action updates its linked activity; completing a linked activity updates its action. No OTJ approval or KSB sign-off is implied by this completion. Earlier saved reviews are unchanged.

## Functional skills and confidentiality

The apprentice form includes English and maths upskill options. They appear on gateway readiness and progress reports. The assigned assessor/master user can tick English/Maths not required in the gateway checklist after checking the applicable programme rules. These decisions are stored with the confirming user/time; they do not falsely change a qualification result to Achieved. An upskill option without an achieved/exempt result or a confirmed not-required decision remains outstanding.

Confidential learner notes are available on the portfolio only to the master user and the assigned assessor. Both dedicated note records and existing staff-note text are removed from apprentice, employer and IQA API responses. Tracker notes are likewise restricted to the master/assessor. Confidential notes are not included in EPA packs or learner-facing review content. Encrypted administrator backups still contain the full authorised workspace.

## Originality checks: stored work, internet sources and AI writing review

New evidence uploads queue originality checks in production. Existing evidence can be checked with **Run originality checks**. Reports contain separate stored-work, internet-source and AI-writing sections. These checks do not automatically change assessment decisions, grades, KSB coverage or gateway readiness.

### Stored work

Readable TXT/Markdown/CSV, DOCX main-body text and PDF text are compared using normalised seven-word phrases with up to 2,000 recently checked stored submissions, within an eight-million-character comparison budget. The same evidence item is excluded. Results show the matching share and number of documents compared. Extracted comparison text remains in private SQLite tables and is included in encrypted administrator backups.

### Internet source matching

Production checks also search up to four short, distributed passages using quoted exact-phrase queries. The report shows the provider, number of completed searches, matched passages, source URLs and matching search-result excerpts. Matching is confirmed against the returned excerpt before a source is listed. The reported percentage counts the sampled passages that matched, rather than estimating a percentage of the whole assignment. The application does not fetch or execute source-page content.

Queries send short passages from the evidence to the selected search provider, not the complete file or learner-account metadata. Direct email addresses, web URLs and long numeric identifiers are removed before passage selection. Authorised administrators should configure internet checking according to the organisation's arrangements for learner work.

| Render environment key | Value / purpose |
| --- | --- |
| INTEGRITY_ENABLED | 1 enables the complete pipeline; 0 disables it. Enabled by default in production. |
| INTERNET_CHECK_ENABLED | 1 enables internet checks; 0 disables external searches. Enabled by default in production, off by default in a training workspace. |
| INTERNET_SEARCH_PROVIDER | bing (default public RSS search) or brave (Brave Search API). |
| BRAVE_SEARCH_API_KEY | A Brave Search API key, stored only in Render Environment when using brave. |

Bing's public RSS service requires no application key. Availability depends on the provider accepting the server's requests. Brave supports a configured API subscription. Failed, blocked, malformed or timed-out searches show Search unavailable or Partly checked; the system never substitutes a zero-match result for a failed search. Invalid or missing provider configuration has its own status. Search calls have bounded response sizes and request timeouts. Search-provider credentials are never included in reports or logs.

### AI-writing review

The built-in review analyses readable text for explicit AI-related expressions, repeated stock transitions, very uniform sentence lengths and repeated paragraphs. Reports list the observed patterns, a follow-up recommendation and questions about the learner's explanation, drafts, workplace examples or source notes. The method is labelled Rule-based writing-pattern review. It produces review advice and observations, not an authorship probability. Short submissions display More text needed. The interface uses concise results/statuses in place of the previous generic boilerplate.

### Processing and supported content

The queue persists across restarts and runs one memory-limited worker at a time, with a 45-second job timeout. Stored-work matching needs at least 50 readable words; internet and writing-pattern sampling need 80. PDF checks cover at most 100 pages and combined extracted text is limited to 100,000 characters. Unsupported files, unreadable scans and truncated text have explicit processing statuses. AI-writing analysis runs locally; external requests are search queries to the selected search provider.

These changes preserve existing data, accounts and passwords and do not reset the workspace.

## Standard resource libraries and evidence reassessment

Resources → Resource library lists every standard automatically, including newly created standards with no resources yet. Select a standard and choose Add resource to preselect that standard. Shared resources have their own library. Renaming a standard preserves its library because resources use its stable ID. Assessment staff can maintain course resources; learners and employers retain access to resources for their assigned standards and shared materials.

Open an evidence item to use Edit evidence & mapping. Master administrators and assigned assessors can edit current-programme evidence at any assessment stage. Apprentices can continue editing drafts and returned work. Saving an edit creates a version-history entry, retains uploaded files and assessment decisions, and returns the item to Draft or Submitted. Accepted KSB coverage is removed until the revised evidence is accepted again.

Submitted, accepted and returned work can be assessed or reassessed by an authorised assessor or master administrator. Each decision appends to Assessment history and captures the evidence content, mappings and file references assessed. Existing historical records are preserved; earlier-standard evidence remains read-only.

## Apprentice profile photos

Click an apprentice’s photo or initials in the apprentice list or profile to open the photo editor, then choose a photo and select Save profile photo. The overview has no permanent upload panel. Master administrators, assigned assessors and apprentices on their own record can upload, replace or remove a photo. Choose JPG, PNG or WebP up to 5 MB. The browser previews the selection, centres a square crop and saves a resized JPEG without the original image metadata.

Uploaded images are stored in the existing persistent SQLite files table and included in encrypted database backups. Their image endpoint requires authentication and the same learner access checks as the apprentice record, with private/no-store caching. Photos display on profiles, apprentice lists and dashboard learner rows; initials remain the fallback. Account login details and learning records are unchanged.

All six existing fictional profiles (Alex Rowan, Taylor Vale, Morgan Ellis, Casey Linden, Jordan Ash and Riley Brook) use distinct AI-generated sample portraits when no uploaded photo is present. Each is labelled in the photo controls. Uploaded photos take precedence, and removal does not make a sample portrait reappear. No real apprentice receives a generated portrait.
