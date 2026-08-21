# WorkflowHQ

WorkflowHQ is a focused project and task workspace for planning work, moving tasks through a Kanban flow, and keeping recent progress visible.

## Live Demo

Public deployment will be added after the local production preview is approved.

## Overview

The application combines a React TypeScript interface with an Express REST API and PostgreSQL. Users get a private workspace with projects, task search and filtering, workflow statistics, and a lightweight activity history.

## Product Preview

![WorkflowHQ task board](screenshots/dashboard.png)

<details>
<summary>More screens</summary>

![WorkflowHQ projects](screenshots/projects.png)

![WorkflowHQ task editor](screenshots/task-modal.png)

</details>

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Axios, CSS |
| Backend | Node.js, Express, Zod, JWT, bcrypt |
| Database | PostgreSQL, raw SQL migrations |
| Delivery | Docker Compose, Nginx, GitHub Actions |

## Key Features

- Short-lived access tokens with rotating refresh tokens in `HttpOnly` cookies
- User-owned projects and tasks with authorization enforced in every query
- Kanban board with drag-and-drop and accessible status controls
- Bounded pagination, search, project/priority filters, and sorting
- Dashboard counts for status, priority, and overdue work
- Focused activity history for important task and project changes
- Responsive loading, empty, success, and error states
- Integration tests for authentication, authorization, validation, CRUD, and queries

## Architecture

```mermaid
flowchart LR
  UI["React + TypeScript\nVite frontend"] -->|"HTTPS + REST"| API["Node.js + Express\nvalidation, auth, business logic"]
  API -->|"parameterised SQL"| DB[(PostgreSQL)]
  API -.->|"HttpOnly refresh cookie"| UI
  CI["GitHub Actions"] -->|"lint, test, type-check, build"| UI
  CI --> API
```

## Running Locally

The simplest path starts the frontend, API, and PostgreSQL together:

```bash
docker compose up --build
```

Open `http://localhost:4173`. The API health route is `http://localhost:5000/api/health`.

For development without Docker, use Node.js 22.13+ and PostgreSQL 16+:

```bash
# backend
cd backend
copy .env.example .env
npm ci
npm run migrate
npm run dev

# frontend, in a second terminal
cd frontend
copy .env.example .env
npm ci
npm run dev
```

The frontend development server runs at `http://localhost:5173`.

## Testing

```bash
cd backend && npm test
cd frontend && npm run typecheck && npm test && npm run build
```

Backend tests use an isolated PostgreSQL-compatible database and exercise the HTTP API. The frontend tests cover protected routing and core task interactions.

## Deployment

Both applications are containerised. Production requires a managed PostgreSQL database, HTTPS, a long random `JWT_SECRET`, the deployed frontend origin in `CORS_ORIGIN`, and `Secure` cross-site cookies when the frontend and API use different sites. Database TLS is controlled explicitly with `DATABASE_SSL`, and certificate verification remains enabled by default.

## Engineering Decisions

- Raw SQL keeps ownership rules and indexing decisions visible and interview-friendly.
- Refresh tokens are hashed in PostgreSQL and rotated instead of being exposed to JavaScript.
- Native drag-and-drop is paired with a status selector so task movement stays reliable on touch and keyboard workflows.
- A 100-item maximum page size prevents unbounded task responses.
- One CI workflow verifies both applications and runs migrations against PostgreSQL.

## Future Improvements

- Deploy the approved build and add verified live URLs and screenshots.
- Add password reset and session-management controls.
- Consider AI task breakdown only after the deployed core flow is stable.
