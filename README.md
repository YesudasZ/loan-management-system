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

The root install only sets up git hooks (husky, lint-staged, commitlint) and Prettier. Run each app from its own folder:

```bash
npm run dev --prefix backend
```

```bash
npm run dev --prefix frontend
```

Environment variables are documented in `backend/.env.example` and `frontend/.env.example`. Detailed setup, seeding and deployment steps arrive in later branches.

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
