# Put Archetype live on Render

Render is the hosting provider. This repository contains a Docker image definition and a Render Blueprint (`render.yaml`) for one live web service with a persistent disk. The source is ready to deploy; a running cloud workspace or Codespace is not your public production service.

[Deploy this repository to Render](https://render.com/deploy?repo=https://github.com/ArchetypeCG/Archetype-Assessor)

## 1. Create the service

1. Sign in to Render and connect your GitHub account. Give it access to **ArchetypeCG/Archetype-Assessor**.
2. Use the deployment link above, or choose **New → Blueprint**, select the repository and use `render.yaml` on `main`.
3. Review Render's current charges before confirming. The blueprint requests a **paid Starter web service**, a **10 GB persistent disk**, and the Frankfurt region. Pricing and available data locations are controlled by Render. Select an appropriate region and contractual/data-processing terms for your organisation before storing learner data.
4. Configure a verified sending domain in Resend and obtain an API key; [follow the email setup guide](EMAIL.md). Enter `RESEND_API_KEY` and `MAIL_FROM` in Render, along with `ADMIN_EMAIL` (your first master-user login email) and a unique `ADMIN_PASSWORD` of at least 12 characters **in Render's secure environment-variable form**, never in GitHub, source files or chat.
5. Deploy. The image build runs the automated tests and builds the frontend. Render checks `/api/health` before routing traffic to the service.
6. Open the HTTPS `onrender.com` address Render provides. Sign in with your initial administrator credentials and choose a new password when prompted. The live service does not offer public demo accounts or demo learners.

The service runs as a non-root user. `NODE_ENV=production`, `DEMO_MODE=0`, secure cookies and an explicit persistent data directory are configured in the blueprint. A service configured with a public-demo database will refuse production startup. Do not mount, copy or restore the development/demo database into live delivery.

Render builds directly from GitHub; you do not need to download the source or run Node.js on your computer. Updating `main` triggers another build. A single-instance persistent-disk deployment can have brief downtime during deployment. Health checks do not prove the service has been deployed until Render reports it live and its HTTPS address has been tested.

## 2. Set up your organisation

The empty master dashboard includes a setup guide:

1. In **Accounts & caseloads**, create assessor and IQA accounts using unique temporary passwords. New accounts must set their own password on first login.
2. In **Standards & KSBs**, add the exact official criteria and versions used for delivery.
3. Add or import apprentice records, assign their assessor/IQA, employer and standard, and configure programme dates and targets.
4. Create linked apprentice and employer login accounts. Share temporary credentials using your organisation's secure channel. Account owners can change their passwords; managers can queue a one-hour recovery link to the account email if someone loses access.
5. Create learning-plan activities, upload resources and schedule detailed sessions or reviews.
6. Log in as each intended role on a second device to confirm scope and access before onboarding your learners.

Deactivate an account to revoke all its existing sessions without deleting its learners or audit trail. Managers cannot deactivate themselves. Self-service password recovery and manager-triggered reset emails work once the email provider is configured. Account invitations are still issued by sharing the initial temporary password securely.

## 3. Shared data and access from any device

Everyone uses the **same HTTPS service address** in their phone, tablet or desktop browser. Each user has their own account and role. Learner records, portfolio files, sessions, learning plans, messages, review records and assessments are stored in the server's SQLite database at `/var/data/archetype/archetype.sqlite`. They are not saved in browser localStorage.

The persistent disk survives process restarts and normal deployments. Browser views refresh every 20 seconds while visible and when the window regains focus. Refresh pauses while an edit dialog is open, so another device cannot silently change the base version of an in-progress edit. Concurrent updates are rejected with a refresh/retry message rather than silently overwriting data. Changes cannot be saved offline, and an offline indicator tells users to reconnect. This is an online web application, not an offline-sync mobile app.

Use **one service instance**. SQLite on a persistent disk is a single-instance design. Do not enable multiple replicas or mount the database on several hosts. Larger-scale multi-instance operation requires a separately planned database/object-storage migration and load testing.

If you use a custom domain, configure it in Render, then add `APP_ORIGIN=https://your-domain.example` to the service settings. The configured custom origin and Render's supplied `RENDER_EXTERNAL_URL` are both accepted for sign-in. Keep HTTPS and `COOKIE_SECURE=1` enabled.

## 4. Calendar and individual learning plans

- **Learning plan:** detailed activities, objectives, multiple KSB mappings, resources, start and target dates, planned hours, completion notes and learner reflections.
- **Calendar:** teaching sessions, progress/tripartite reviews, workplace observations, gateway meetings and other appointments, with start/end times, delivery method, room, HTTPS meeting link, full agenda, preparation, participants, resources, criteria, attendance and outcomes.
- Staff-only session notes are excluded from apprentice and employer API responses.
- Edit, complete or cancel a session while retaining its record. Record a cancellation reason. Review appointments can update the learner's next review due date.
- From a scheduled review, select **Record completed review** to save the discussion, learner/employer feedback, shared wellbeing/support notes, agreed actions and next objectives. Completing the review links the records and updates last/next review dates.
- Download **Export calendar** to import an authenticated snapshot into Outlook, Google Calendar or Apple Calendar. Exported times use correct UK daylight-saving offsets. This exports a snapshot. For automatic Outlook updates, use **Link to Outlook** to create a private subscription instead; see [Outlook calendar subscriptions](OUTLOOK_CALENDAR.md).
- Planned hours and completed learning-plan activities do not automatically count as verified KSBs or approved OTJ hours. Evidence assessment and learning-hour approval remain separate workflows.

## 5. Backups and recovery

The blueprint generates a `BACKUP_ENCRYPTION_KEY`. Preserve this key in your organisation's secure password/secret manager. It is required to decrypt backups; losing it makes those backup files unrecoverable. Do not rotate it without preserving the old key and taking/verifying a new backup.

The service creates an online SQLite backup, compresses it and encrypts it with AES-256-GCM. A backup is scheduled at startup if one is overdue, and daily thereafter while the service is running. Local encrypted backups are retained for 14 days by default. The exact last backup and any failures appear under **Settings & export → Storage, backups & live operations**. A master user can create and download an encrypted backup there. Backups include records, attachments, account password hashes and audit data. Treat them as sensitive even though encrypted.

**A backup on the same disk does not protect against loss of that disk.** Before relying on the service for live records, configure an independent S3-compatible bucket using these Render environment variables:

| Variable                      | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `S3_BACKUP_BUCKET`            | Private bucket name                                               |
| `S3_BACKUP_REGION`            | Provider's region, or `auto` for compatible providers that use it |
| `S3_BACKUP_ENDPOINT`          | Optional HTTPS endpoint for a non-AWS S3-compatible provider      |
| `S3_BACKUP_ACCESS_KEY_ID`     | Dedicated backup credential, entered securely                     |
| `S3_BACKUP_SECRET_ACCESS_KEY` | Dedicated backup secret, entered securely                         |
| `S3_BACKUP_PREFIX`            | Optional object prefix; defaults to `archetype`                   |
| `S3_BACKUP_PATH_STYLE`        | Set to `1` only if your provider requires path-style requests     |

Use a private bucket and narrowly scoped write credentials. Configure bucket retention/lifecycle rules separately; the application's retention policy only deletes local backups. No bucket is provisioned by this repository. Once configured, create a backup from Settings and verify the encrypted object appears in the bucket. The UI distinguishes a configured destination from a successfully completed upload and reports failures. Off-site transfer cannot be claimed tested without your actual bucket configuration.

### Restore without overwriting the current database

1. Stop the application or use a separate maintenance service with access to the persistent disk.
2. Download the selected encrypted backup from the bucket or Settings. Supply the matching `BACKUP_ENCRYPTION_KEY` securely to the maintenance process.
3. Restore to a **new, unused directory on the persistent disk**:

   ```sh
   node scripts/restore-backup.mjs /path/to/backup.sqlite.gz.enc /var/data/archetype-restored/archetype.sqlite
   ```

4. The tool checks SQLite integrity and an active master account, and clears old login sessions. It refuses to overwrite an existing destination. The backup encryption tag detects incorrect keys and tampering.
5. Set `DATA_DIR=/var/data/archetype-restored` on the service, deploy and test login, evidence downloads and record counts. Keep the previous data directory until recovery has been verified.

Test this procedure with a disposable restored directory before relying on backups. Do not replace a live SQLite database file in place. Internal recovery snapshots are useful for administrative mistakes, but they are held in the same database and are not disaster-recovery backups.

## 6. Operational responsibilities

The deployment configuration, application workflows and automated checks are provided. You still need to activate the Render service, enter credentials, configure off-site storage, verify the live domain and implement your organisation's access, retention and learner-data policies. Hosting and bucket subscriptions belong to your organisation.

Before admitting real learner data, complete an appropriate deployment/security and accessibility review, arrange malware scanning for learner uploads, and verify official standard/funding-rule configuration. Uploaded files are served as protected downloads, not executed or previewed, but this is not a malware scanning service. Do not describe the system as a certified Smart Assessor replacement or as compliant with a regulation solely because it has a compliance dashboard. SSO/MFA, MIS/ILR/EPA-provider integrations, SMS and qualified electronic signatures remain separate integrations.

## Local production smoke test

`npm run dev` and `npm run preview` intentionally use fictional demo data for development. To exercise the live-mode image locally, build the image, supply production environment variables from a secure env file excluded from Git, and mount a disposable persistent volume. Secure cookies are intended for HTTPS; use an HTTPS proxy for a realistic browser test. Keep test databases separate from live data.

GitHub Actions runs the tests and build on pushes and pull requests; the Docker build repeats them. Never disable TLS, npm integrity checks or tests to get a deployment through.

## 7. IQA sampling and morning email

Open **Audit & quality → Sampling plan** as an IQA or master user. Select an apprentice, scheduled date, risk, method, KSB criteria and optional accepted evidence. The monthly calendar and agenda share the same persistent plans. Use **Record finding** to link a sample to the plan. Completion requires findings covering every selected criterion. Apprentice and employer accounts cannot see sampling plans; assessors have read access to plans for their assigned learners through the quality hub.

The Render blueprint enables daily email scheduling at 08:00 Europe/London. It uses the same always-on service and persistent database; there is no separate cron-service subscription. Provider credentials and a verified sender are required before email can be sent. Delivery and configuration status appear in master-user Settings. Each user can opt out of morning reminders. [Email settings, delivery checks and recovery behaviour](EMAIL.md).

Fictional learner records remain available in the local training workspace as requested. No migration deletes or rewrites learner evidence. Public training credentials must remain separate from a live database containing real learner information. Removing the on-screen demo banners does not change the security properties of those training accounts.

## Login reports an address / cross-origin error

Open the **same Render web service → Environment → Edit** and add an **environment variable** (not a secret file):

| Key          | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| `APP_ORIGIN` | Your complete public URL, for example `https://www.example.org` |

`www.example.org` and `example.org` are separate origins. Use the address actually shown in the browser after any redirect. Do not put `APP_ORIGIN=` into the Value box, and do not enter a password here. Save, rebuild and deploy, and confirm the new deployment is Live before retrying login.

The application accepts both `APP_ORIGIN` and Render's automatically supplied `RENDER_EXTERNAL_URL`; the original Render URL remains available for login while a custom domain is being configured. Password recovery links use the canonical `APP_ORIGIN`. If both your root and `www` addresses must work directly, add the other verified URL to `ADDITIONAL_APP_ORIGINS` (comma-separated HTTPS origins for more than one). Only add addresses you own and have connected to this service; wildcards are rejected. The app does not trust arbitrary forwarded Host headers.

If the error persists, check that the domain is attached under **Settings → Custom Domains** on this same service, that the newest deployment completed successfully, and that the edited variable is present in that service's runtime environment. The error message identifies the browser origin being rejected. Avoid embedding the platform in a Wix iframe; open its dedicated HTTPS address directly.

## Admin password appears to reset after deployment

The administrator password is saved as a salted hash in the same SQLite database as the workspace. `ADMIN_PASSWORD` is used only when creating an empty database for the first time. Changing that environment variable does not reset the password in an existing database. Password changes and recovery links update the stored hash; normal application restarts do not rotate it.

If changing the password works until the next deployment, inspect **Render → this service → Disks** and check that an attached persistent disk covers the configured `DATA_DIR`. The blueprint uses a mount at `/var/data` and `DATA_DIR=/var/data/archetype`. Merely setting `DATA_DIR` does not attach a disk. Without persistent storage, a replacement container can lose accounts and records and create a new administrator from the bootstrap environment settings. The startup log `New workspace initialised; administrator credentials created.` identifies that a fresh database has been initialised.

Do not delete the database, delete/recreate a disk, change the data directory, or trigger repeated redeployments while investigating lost storage. Export/download a verified backup of any surviving records first. Attaching a new empty disk or moving `DATA_DIR` can hide the current database and initialise another one; migrating existing data must preserve the original database and encryption key. If access is lost, use **Forgot your password?** with the admin email when email delivery is configured, then sign in and obtain a backup before changing storage. Preserve any existing off-site backups.

New accounts and the first administrator must choose their own password once. Saving it signs out existing sessions; the login screen confirms the change and asks for the newly chosen password. The initial Render password is no longer the sign-in password after that change. Updating a normal account password in Settings requires matching confirmation.

All password-setting paths preserve spaces and Unicode exactly and enforce the same 12–200 character limit. Earlier versions trimmed leading/trailing spaces on account creation and password changes, although email recovery preserved them. The fix prevents that inconsistency; it does not guess or silently rewrite existing password hashes. If a password created under the earlier flow cannot be recalled, use the normal email recovery flow to choose a known new password.


## Existing Render service losing records after deploys

An administrator password reverting to the bootstrap password **together with missing records** strongly suggests that the application has been starting against an empty database. A missing persistent disk or a DATA_DIR pointing outside it can cause this. The live service configuration must be checked to confirm the cause; the presence of render.yaml in GitHub alone does not attach storage to a manually created service.

1. Pause automatic deploys while diagnosing. Before changing environment variables, attaching a new disk or redeploying, preserve any surviving records: download an encrypted backup from Settings & export and retain the matching BACKUP_ENCRYPTION_KEY securely. If login is unavailable, use normal password recovery or an owner-controlled Render Shell to obtain a consistent SQLite backup; copying only a live WAL database file can omit recent writes.
2. Under the existing Render service → Disks, verify that a persistent disk is actually attached at `/var/data`. Under Environment, verify `DATA_DIR=/var/data/archetype`. An environment variable does not create a disk. Attaching a new blank disk does not migrate the old database.
3. If migration is required, restore the saved encrypted backup into an unused location on the attached disk using the documented restore script, then configure DATA_DIR to its directory. Do not overwrite an existing database. Recovery needs a separate safe maintenance process with the disk mounted; the application deliberately refuses to start with missing persistent storage on Render.
4. Only after data is preserved and restored should you deploy and check that chosen passwords, learner records and uploads survive a restart. Changing ADMIN_PASSWORD does not change an existing account's password. It is used only when creating a fresh workspace.

The Render production startup check requires a real `/var/data` mount and DATA_DIR beneath it. It fails before creating a SQLite database when that storage is missing. This prevents silent use of another temporary database; it does not provision a disk, recover already lost data or prove that a backup exists. Already lost data requires a surviving database, Render disk snapshot or independent backup.

## Editing access and standards

Master users can select **Edit access & caseload** in Accounts & caseloads to change an account's name, email, role, apprentice/employer link and assessor/IQA learner assignments. Reassign an assessor/IQA's caseload before changing their role. Administrators cannot remove their own manager role. Access or email changes revoke existing sessions and recovery tokens; passwords are preserved. Deactivation and password recovery remain separate controls.

Managers and IQAs can select **Edit standard & KSBs** in Standards & KSBs. Edits retain the standard ID and existing learner/evidence mappings. Duplicate course versions remain blocked. Criteria mapped in current learner records cannot be removed or renamed; their wording can be corrected. Changes apply across learners assigned to the standard, so review wording carefully. Editing the pasted source requires parsing and reviewing it again before saving.

## Signing in to different accounts in browser tabs

Each new application tab now starts its own sign-in session. Open the website in each tab and sign in with the required account. Reloading a tab retains that tab's session. Signing out of one tab does not sign out other tabs or devices. Following this update, refresh existing tabs and sign in again once.

The browser keeps only a non-secret tab identifier in sessionStorage. Actual session tokens remain in separate HttpOnly, SameSite=Strict cookies (Secure in production); tokens are not stored in JavaScript storage or download URLs. Scoped API calls, files, calendar exports, backups and email settings select the tab's session. Download URLs include a non-secret selector and still require the matching cookie and normal role/learner permissions. Legacy API clients without a tab selector continue to use their existing independent sessions. Invalid or unknown selectors cannot fall back to another account's cookie.

Password changes, password resets, access changes and deactivation continue to invalidate the affected account's sessions as documented. They do not invalidate unrelated accounts. Login failure counters are separated by account and connection, preventing one user's failed attempts from blocking different accounts sharing a Render proxy or network.
