# Archetype Assessor

A responsive apprenticeship portfolio prototype built with React and Vite.

## Development

Use Node.js 24 and npm 11.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

Create production assets with `npm run build`. Serve them with `npm run preview`.

## Available workflows

- Apprentice dashboard with illustrative progress, review dates and learning milestones.
- Create evidence, add a reflection, link it to a learning outcome, and attach a file up to 5 MB.
- Search and filter evidence; open evidence and download saved attachments.
- Move draft evidence to a local “In review” state.
- View a sample learning plan, review preparation and assessor feedback.
- Save demo messages and export portfolio data as JSON from Settings.
- Responsive desktop and mobile layouts.

## Data and limitations

This is a local prototype, not a deployed learning management system. Evidence, attachments and demo messages persist in this browser's localStorage. Browser storage is limited and can be cleared. Export important work before clearing browser data. Do not use sensitive learner data.

There is no authentication, server database, real assessor delivery or multi-user access. Dashboard progress, existing evidence, assessor feedback, notifications and appointments are sample data. A production version needs secure learner/assessor/provider roles, server storage, file scanning, permission checks, audit history, backups and a configurable apprenticeship standard before use with real apprentices.
