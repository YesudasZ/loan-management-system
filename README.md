# Loan Management System

A lending platform where borrowers apply for personal loans and internal teams (Sales, Sanction, Disbursement, Collection, Admin) move each loan through its lifecycle:

`APPLIED → SANCTIONED → DISBURSED → CLOSED` (or `APPLIED → REJECTED`).

> **Status:** work in progress, built branch by branch. See [PROGRESS.md](PROGRESS.md) and [PLAN.md](PLAN.md).

## Stack

| Part     | Tech                                                            | Hosting |
| -------- | --------------------------------------------------------------- | ------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript 6, Tailwind CSS 4 | Vercel  |
| Backend  | Node 24, Express 5, TypeScript 6, Mongoose 9, zod 4             | Render  |
| Database | MongoDB Atlas (salary slips in GridFS)                          | Atlas   |

## Repository layout

```
backend/    Express API (src/, tests/)
frontend/   Next.js app (src/app, src/lib, ...)
docs/       DECISIONS.md, API.md, ARCHITECTURE.md
PLAN.md     Data model, API design, state machine, branch plan
PROGRESS.md What has been merged so far and how to test it
```

## Local setup

Prerequisites: Node 24 (`nvm use`), npm 11.

```bash
npm install
```

```bash
npm install --prefix backend
```

```bash
npm install --prefix frontend
```

The root install only sets up git hooks (husky, lint-staged, commitlint) and Prettier.

### Backend

There is no local MongoDB: create a free Atlas cluster and a `lms_dev` database user first ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), steps 1–2). Then copy the example env file and fill in `MONGODB_URI` and `JWT_SECRET` (every variable is validated at startup):

```bash
cp backend/.env.example backend/.env
```

Create the demo accounts (safe to re-run; it resets them to the same state):

```bash
npm run seed --prefix backend
```

Start the API on http://localhost:4000 (check http://localhost:4000/health):

```bash
npm run dev --prefix backend
```

Tests never touch Atlas; they start an in-memory MongoDB replica set (downloaded on the first run).

### Frontend

Copy the example env file. `BACKEND_URL` points at the local API, and `JWT_SECRET` must equal the backend's:

```bash
cp frontend/.env.example frontend/.env.local
```

Start the web app on http://localhost:3000. It proxies `/api/*` to the backend, so run both:

```bash
npm run dev --prefix frontend
```

## Demo accounts

All seeded accounts use the password `Password@123`.

| Email                  | Role                                      |
| ---------------------- | ----------------------------------------- |
| `admin@lms.dev`        | ADMIN (every dashboard module)            |
| `sales@lms.dev`        | SALES                                     |
| `sanction@lms.dev`     | SANCTION                                  |
| `disbursement@lms.dev` | DISBURSEMENT                              |
| `collection@lms.dev`   | COLLECTION                                |
| `borrower@lms.dev`     | BORROWER (fresh, to walk the application) |

This is a demo system with shared, published credentials: don't enter real personal data.

## Deployment

| Piece            | URL                                                                  |
| ---------------- | -------------------------------------------------------------------- |
| API (Render)     | https://loan-management-system-wl8j.onrender.com (health: `/health`) |
| Web app (Vercel) | https://loan-management-system-beta-pearl.vercel.app                 |

Atlas + Render (API) and Vercel (web app): see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). On Render's free tier the API sleeps after about 15 minutes idle; the first request can take about a minute. The API's endpoints are listed in [docs/API.md](docs/API.md).

## Quality checks

Run these from the repository root; each runs in both apps:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run secrets
```

`npm run secrets` needs [gitleaks](https://github.com/gitleaks/gitleaks) installed locally (`brew install gitleaks`).

## Contributing

GitHub Flow: short-lived branches named `<type>/<description>`, Conventional Commits (enforced by commitlint), pull requests squash-merged into `main`. See [CLAUDE.md](CLAUDE.md) for the full rules.
