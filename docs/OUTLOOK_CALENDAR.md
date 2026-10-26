# Outlook calendar subscriptions

Assessors and managers can open Calendar → Link to Outlook → Create subscription link. Copy the link into Outlook on the web under Calendar → Add calendar → Subscribe from web, give it a name and select Import.

The feed updates from the current account’s sessions and scheduled reviews on every fetch, using its current caseload. Outlook controls refresh timing. Manage appointments in Archetype; the subscription is read-only in Outlook. Export calendar remains a separate snapshot download.

Each account has one active private link. Keep it private: anyone holding it can read the calendar without signing in. Links include appointment titles, learner names, dates, times, locations and meeting links. Confidential notes, feedback and assessment details are excluded. The platform stores only a hash of the subscription token and shows the full link only when it is created.

Replace subscription link invalidates the previous link. Revoke subscription disables it. Password changes, password recovery, account security/access changes and backup restoration invalidate links; create a fresh subscription afterwards. Inactive accounts cannot serve a feed. Revoking a link prevents further fetches; remove old calendars from Outlook to clear previously downloaded appointments.

Production requires the existing APP_ORIGIN configuration to contain the live HTTPS site address. No Microsoft application registration or additional provider credentials are needed.
