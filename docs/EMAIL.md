# Password recovery and daily reminders

The application sends email through Resend's HTTPS API. No mail credentials are committed to Git. This release implements the workflows; it has not sent real mail or verified your sending domain.

## Configure Render

1. Create your organisation's Resend account, add a sending domain you own, and add the DNS records Resend supplies. Wait for the domain to show as verified. Use a sending API key scoped to that domain.
2. In the Render service's **Environment** settings, enter these values securely:

   | Variable                 | Value                                                                                             |
   | ------------------------ | ------------------------------------------------------------------------------------------------- |
   | `RESEND_API_KEY`         | Your sending API key; keep it secret                                                              |
   | `MAIL_FROM`              | An address at the verified domain, for example `Archetype <notifications@your-domain.example>`    |
   | `MORNING_DIGEST_ENABLED` | `1` to enable; `0` to pause morning emails                                                        |
   | `MORNING_DIGEST_HOUR`    | `8` for 08:00 Europe/London; integer 0–23                                                         |
   | `APP_ORIGIN`             | Your HTTPS custom-domain URL, if used; otherwise Render's automatic `RENDER_EXTERNAL_URL` is used |

3. Save and deploy. In **Settings & export**, check that **Email provider configured** appears. This confirms settings are present, not that DNS or delivery has been verified.
4. Use a real account email you control, request **Forgot your password?**, and check both the inbox and Resend delivery logs. Use the link, confirm that it works once, then sign in with the new password. Test the manager's **Reset password** action with an account you control.
5. Create an overdue task for that account, enable its morning preference and check delivery after the next configured morning time. Empty summaries are skipped.

Do not paste credentials into GitHub issues, source files or chat. Rotating a provider key requires updating Render and redeploying. Resend's quotas and charges apply. Real delivery was not tested in this workspace because no provider credentials were available.

## Recovery behaviour

All roles use the same recovery flow. Reset links expire after one hour and are single-use. Links carry the secret in the URL fragment so it is not sent in the initial HTTP request or referrer. Only the token hash is held in the reset table. Pending mail payloads contain the recovery link while delivery is queued; protect the persistent disk and backups. Sent and expired reset payloads are cleared. A new request invalidates earlier links. Completing a reset revokes all existing login sessions. Deactivating an account also invalidates its reset links. A manager-triggered reset immediately signs out existing sessions and queues the link; the existing password is replaced when the link is redeemed.

The public request screen uses a generic response for known and unknown addresses and rate limits requests. When email is unconfigured, it explicitly directs the user to their administrator. Manager settings show queued, provider-accepted (`Sent`), failed, expired and cancelled counts. `Sent` means the provider accepted the request; provider delivery logs are needed to confirm final inbox delivery or a bounce. Passwords are never emailed.

## Morning summaries

The server checks the London clock every minute and sends one summary per active account per local day after the configured hour. The persistent date/account key prevents duplicate summaries after normal restarts. A restart after the morning hour catches up that day. Opted-out accounts receive no summary; an empty urgent-action list sends nothing. Users control the preference in Settings.

Summaries cover open overdue/today actions, uncompleted sessions, overdue learning activities, relevant red learner alerts, pending assessor decisions/log approvals, and due IQA sampling plans. The server applies the same learner permissions as the workspace; emails never contain portfolio attachments. Consider your organisation's policy for learner information in email.

The persistent outbox retries failures with backoff, up to eight attempts. Resend idempotency keys prevent duplicate provider requests during ordinary retry/restart windows. Reset messages expire after an hour and digests after 24 hours; stale messages are not delivered. Failed delivery is visible in master-user Settings. Provider response bodies and secret links are not logged. Continue monitoring delivery through Resend; webhook-based bounce/complaint processing is not included.

Use one application instance, as documented for SQLite. The web service must stay running for scheduled mail. For a prolonged outage, summaries are regenerated after service resumes for the current local day; past days are not replayed.
