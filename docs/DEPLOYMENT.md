# Put Archetype live on Render

Render is the hosting provider. This repository contains a Docker image definition and a Render Blueprint (`render.yaml`) for one live web service with a persistent disk. The source is ready to deploy; a running cloud workspace or Codespace is not your public production service.

[Deploy this repository to Render](https://render.com/deploy?repo=https://github.com/ArchetypeCG/Archetype-Assessor)

## 1. Create the service

1. Sign in to Render and connect your GitHub account. Give it access to **ArchetypeCG/Archetype-Assessor**.
2. Use the deployment link above, or choose **New → Blueprint**, select the repository and use `render.yaml` on `main`.
3. Review Render's current charges before confirming. The blueprint requests a **paid Starter web service**, a **10 GB persistent disk**, and the Frankfurt region. Pricing and available data locations are controlled by Render. Select an appropriate region and contractual/data-processing terms for your organisation before storing learner data.
4. Enter `ADMIN_EMAIL` (your first master-user login email) and a unique `ADMIN_PASSWORD` of at least 12 characters **in Render's secure environment-variable form**, never in GitHub, source files or chat.
5. Deploy. The image build runs the automated tests and builds the frontend. Render checks `/api/health` before routing traffic to the service.
6. Open the HTTPS `onrender.com` address Render provides. Sign in with your initial administrator credentials and choose a new password when prompted. The live service does not offer public demo accounts or demo learners.

The service runs as a non-root user. `NODE_ENV=production`, `DEMO_MODE=0`, secure cookies and an explicit persistent data directory are configured in the blueprint. A service configured with a public-demo database will refuse production startup. Do not mount, copy or restore the development/demo database into live delivery.

Render builds directly from GitHub; you do not need to download the source or run Node.js on your computer. Updating `main` triggers another build. A single-instance persistent-disk deployment can have brief downtime during deployment. Health checks do not prove the service has been deployed until Render reports it live and its HTTPS address has been tested.

## 2. Set up your organisation

The empty master dashboard includes a setup guide:

1. In **Accounts & caseloads**, create assessor and IQA accounts using unique temporary passwords. New accounts must set their own password on first login.
2. In **Standards & KSBs**, add the exact official criteria and versions used for delivery.
3. Add or import apprentice records, assign their assessor/IQA, employer and standard, and configure programme dates and targets.
4. Create linked apprentice and employer login accounts. Share temporary credentials using your organisation's secure channel. Account owners can change their passwords; managers can issue replacement temporary passwords if someone loses access.
5. Create learning-plan activities, upload resources and schedule detailed sessions or reviews.
6. Log in as each intended role on a second device to confirm scope and access before onboarding your learners.

Deactivate an account to revoke all its existing sessions without deleting its learners or audit trail. Managers cannot deactivate themselves. Self-service reset emails and invitations are not configured; access recovery is explicitly managed by a master user.

## 3. Shared data and access from any device

Everyone uses the **same HTTPS service address** in their phone, tablet or desktop browser. Each user has their own account and role. Learner records, portfolio files, sessions, learning plans, messages, review records and assessments are stored in the server's SQLite database at `/var/data/archetype/archetype.sqlite`. They are not saved in browser localStorage.

The persistent disk survives process restarts and normal deployments. Browser views refresh every 20 seconds while visible and when the window regains focus. Refresh pauses while an edit dialog is open, so another device cannot silently change the base version of an in-progress edit. Concurrent updates are rejected with a refresh/retry message rather than silently overwriting data. Changes cannot be saved offline, and an offline indicator tells users to reconnect. This is an online web application, not an offline-sync mobile app.

Use **one service instance**. SQLite on a persistent disk is a single-instance design. Do not enable multiple replicas or mount the database on several hosts. Larger-scale multi-instance operation requires a separately planned database/object-storage migration and load testing.

If you use a custom domain, configure it in Render, then add `APP_ORIGIN=https://your-domain.example` to the service settings. Otherwise Render's supplied `RENDER_EXTERNAL_URL` is used for request-origin validation. Keep HTTPS and `COOKIE_SECURE=1` enabled.

## 4. Calendar and individual learning plans

- **Learning plan:** detailed activities, objectives, multiple KSB mappings, resources, start and target dates, planned hours, completion notes and learner reflections.
- **Calendar:** teaching sessions, progress/tripartite reviews, workplace observations, gateway meetings and other appointments, with start/end times, delivery method, room, HTTPS meeting link, full agenda, preparation, participants, resources, criteria, attendance and outcomes.
- Staff-only session notes are excluded from apprentice and employer API responses.
- Edit, complete or cancel a session while retaining its record. Record a cancellation reason. Review appointments can update the learner's next review due date.
- From a scheduled review, select **Record completed review** to save the discussion, learner/employer feedback, shared wellbeing/support notes, agreed actions and next objectives. Completing the review links the records and updates last/next review dates.
- Download **Export calendar** to import an authenticated snapshot into Outlook, Google Calendar or Apple Calendar. Exported times use correct UK daylight-saving offsets. This is an ICS download, not a public subscription feed or email invitation service.
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

Before admitting real learner data, complete an appropriate deployment/security and accessibility review, arrange malware scanning for learner uploads, and verify official standard/funding-rule configuration. Uploaded files are served as protected downloads, not executed or previewed, but this is not a malware scanning service. Do not describe the system as a certified Smart Assessor replacement or as compliant with a regulation solely because it has a compliance dashboard. SSO/MFA, MIS/ILR/EPA-provider integrations, automated email/SMS and qualified electronic signatures remain separate integrations.

## Local production smoke test

`npm run dev` and `npm run preview` intentionally use fictional demo data for development. To exercise the live-mode image locally, build the image, supply production environment variables from a secure env file excluded from Git, and mount a disposable persistent volume. Secure cookies are intended for HTTPS; use an HTTPS proxy for a realistic browser test. Keep test databases separate from live data.

GitHub Actions runs the tests and build on pushes and pull requests; the Docker build repeats them. Never disable TLS, npm integrity checks or tests to get a deployment through.
