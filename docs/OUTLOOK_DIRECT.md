# Connect an existing Microsoft 365 work calendar

This option writes one-way from Archetype into the signed-in user's **main Outlook calendar**. The existing subscription option remains available as a separate read-only calendar. This needs a Microsoft 365 work/school mailbox in Exchange Online; Outlook used with an on-premises or other-provider mailbox cannot use Microsoft Graph calendar writes.

## One-time Microsoft administrator setup

1. Open https://entra.microsoft.com and select **Identity → Applications → App registrations → New registration**. Name it **Archetype Portfolio Calendar**. For your own organisation, select **Accounts in this organisational directory only**.
2. Add a **Web** redirect URI exactly:
   `https://www.archetype-portfolio.com/api/outlook/callback`
   Use your actual APP_ORIGIN domain if it differs. Do not select SPA/public-client authentication.
3. Under **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add **User.Read** and **Calendars.ReadWrite**. The sign-in also requests **offline_access** to refresh access while the user is away. Grant organisation admin consent if your tenant requires it. Do not add application-wide calendar permissions.
4. Under **Certificates & secrets**, create a client secret. Copy its **Value**, not its Secret ID, into Render. Note its expiry so it can be replaced before it expires.
5. Under the app's **Overview**, copy the Application (client) ID and Directory (tenant) ID.

## Render → your existing service → Environment

Set these values, then Save/redeploy:

| Key | Value |
|---|---|
| `OUTLOOK_CLIENT_ID` | Application (client) ID |
| `OUTLOOK_TENANT_ID` | Directory (tenant) ID |
| `OUTLOOK_CLIENT_SECRET` | Client secret **Value** |
| `APP_ORIGIN` | Existing exact live origin, e.g. `https://www.archetype-portfolio.com` |

Keep the existing `BACKUP_ENCRYPTION_KEY` and persistent disk settings. The connection derives its token-encryption key from the existing backup key. Optionally set a separate `OUTLOOK_TOKEN_ENCRYPTION_KEY` of at least 32 random characters before users connect. Changing the encryption key later requires users to reconnect. Do not put secrets in GitHub, screenshots or chat. Missing configuration disables only the direct connection, not login, calendars or subscriptions. For a deliberately multi-organisation Microsoft app, `OUTLOOK_TENANT_ID=organizations` is supported; configure the app's supported account types accordingly.

## Each assessor or master administrator

Open **Calendar → Link to Outlook → Connect Outlook** (assessors find Calendar under **My delivery**). Sign in to Microsoft in the new window and accept the permissions. Return to the original Archetype tab; status refreshes automatically. If a popup is blocked, choose **Continue Microsoft sign-in**. The Microsoft result page explains when it is safe to close that window.

Updates run in the background approximately every minute while the service is running. **Sync now** checks and repairs the current copies immediately. Initial sync copies sessions/reviews dated today or later from the current caseload; historical appointments are not bulk imported. Already copied appointments remain associated with their original records when they pass into the past. Changes and cancellations in Archetype update/remove its matching copies. Reassigning a learner removes the previous assessor's copied entries on the next sync.

Appointments are private, prefixed `[Archetype]`, and include the title, apprentice name, time, location and meeting link. Confidential notes, review narratives, ALS/medical details and assessment feedback are excluded. No attendees or invitations are created. If someone adds attendees to a copied appointment in Outlook, updates pause with a visible message; remove those attendees before syncing. Other Outlook appointments are not modified. Use one connection method: hide/remove the old separate subscription calendar to avoid displaying duplicate sessions.

**Disconnect Outlook** stops future updates and removes the locally stored access/refresh credentials. Existing copies stay in Outlook. Reconnecting the same mailbox reuses the existing mapping and ownership markers rather than duplicating its appointments. Only one Archetype account can actively connect a given Microsoft account. For full provider-side revocation, the user or Microsoft administrator can remove the app's granted access in Microsoft 365 as well.

## Security and operations

OAuth uses one-use, ten-minute hashed state, PKCE, a separate HttpOnly SameSite=Lax browser-binding cookie, and the initiating live Archetype session. Main login cookies remain SameSite=Strict. An OAuth callback cannot switch the active Archetype tab/account. Tokens and PKCE verifiers are AES-256-GCM encrypted in private SQLite tables, never returned in workspace exports. Profile/mailbox metadata only is shown to that user. Password changes, password reset initiation by an administrator, deactivation and account security changes invalidate the connection. Backup restoration clears connections and pending authorisations while retaining nonsecret event mappings for safe reconnection.

Microsoft throttling and temporary failures keep retry status with bounded backoff; credentials failures require reconnection. The app serialises syncs per user and uses stable transaction IDs plus a private event ownership marker to recover lost create responses. External changes remain subject to Microsoft availability. Edits made in Outlook are not imported into Archetype. The connection panel shows last successful sync and provider errors without exposing credentials.

Official references: [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [authorisation-code flow and PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [create event](https://learn.microsoft.com/en-us/graph/api/user-post-events), [event update](https://learn.microsoft.com/en-us/graph/api/event-update), [extended properties](https://learn.microsoft.com/en-us/graph/api/singlevaluelegacyextendedproperty-get).
