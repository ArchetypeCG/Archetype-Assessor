# Uploaded KSB schedules and fictional practice learners

The three user-supplied gap-analysis PDFs were converted into a KSB catalogue. Only criterion codes, wording and generic section headings were extracted. Learner identities, assessor details, achievement percentages, evidence counts, dates of study and signatures were excluded. The PDFs themselves are not published with the application.

| Programme | Knowledge | Skills | Behaviours | Total |
| --- | ---: | ---: | ---: | ---: |
| Business Administrator, level 3 | 16 | 32 | 12 | 60 |
| Digital Applications Technician, level 3 | 19 | 12 | 3 | 34 |
| Digital Support Technician V1.1, level 3 | 38 | 24 | 5 | 67 |

These are the schedules supplied by the user, not a claim that the wording is the latest independently verified official standard. Course identifiers such as 196, 9703-12 and 439 are labelled uploaded references; they are not represented as official ST references. Applications is the narrower schedule supplied in its own PDF; the full Digital Support schedule is separately selectable. This does not create multiple versions of either named course. Split criterion codes are retained, normalised to uppercase to match the platform's existing KSB parser. Context from headings is included for fragments such as K11A (Currency).

On the next successful production start, a transactional, one-time installation adds missing standards and six fictional practice learners, two per schedule. Each learner has mapped example evidence (accepted and submitted), approved and pending OTJ entries, a learning activity, a future action and a detailed future review appointment. Their progress is calculated using the normal evidence rules. Fictional learners and their records are visibly labelled, and no real uploaded learner data is reused.

Existing records and passwords are preserved. If a course already exists under the same name/reference, the installation retains its ID and existing criterion wording, adding only missing codes. Any later manual edits are left intact. A persisted migration marker prevents duplication or recreation after restarts or deletion. No login accounts, shared passwords or credentials are created. Practice learners are assigned to the first active assessor/IQA if available; otherwise they are unassigned and remain visible to the master user, who can create staff accounts and assign caseloads. Do not treat the example evidence as authentic learner achievement.

Fictional learners are excluded from morning email reminders so example actions cannot generate real urgent-task emails. Editing a fictional learner preserves this flag. Actual learner reminders continue to use the existing rules. The development training workspace is unchanged; the requested starter installation applies to the live production database.

Source: `server/catalog/uploaded-standards.json`. Installer: `server/uploaded-starter.mjs`. No manual database reset, seed command or DEMO_MODE change is needed. Deploy the updated main branch with the existing persistent disk and DATA_DIR configuration intact.
