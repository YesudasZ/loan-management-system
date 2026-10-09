# Progress

One entry per merged branch, newest last. Each entry says what changed and how to test it by hand.

| #   | Branch                         | Status                  |
| --- | ------------------------------ | ----------------------- |
| 1   | `chore/repo-setup`             | in review               |
| 2   | `feat/backend-foundation-auth` | planned                 |
| 3   | `feat/frontend-foundation`     | planned                 |
| 4   | `feat/borrower-journey`        | planned                 |
| 5   | `feat/operations-modules`      | planned (E2E milestone) |
| 6   | `feat/sales-admin-overview`    | planned                 |
| 7   | `test/rbac-security-hardening` | planned                 |
| 8   | `docs/readme-polish-release`   | planned (tag `v1.0.0`)  |

---

## 1. `chore/repo-setup`

**What changed**

- Root tooling: husky git hooks (lint-staged on pre-commit, commitlint on commit-msg), Prettier, EditorConfig, Node 24 pin, exact-version installs.
- `backend/`: Express 5 + TypeScript 6 (ESM, strict) skeleton with `createApp()` (no `listen`) and a 404 JSON envelope, ESLint (type-checked), vitest + supertest smoke test, separate build config emitting `dist/`.
- `frontend/`: Next.js 16 + React 19 + Tailwind 4 + TypeScript 6 scaffold, ESLint with the CLAUDE.md rules, `formatInr` helper with vitest tests.
- GitHub: CI (lint, typecheck, test, build, npm audit per app, plus a full-history gitleaks scan), PR-title check, Dependabot, PR template. Repo set to squash-merge only, PR title as the commit message, branches deleted on merge.
- Docs: README skeleton, PLAN.md, this file, `docs/DECISIONS.md`, `docs/API.md`, `docs/ARCHITECTURE.md`. CLAUDE.md §4 now says PROGRESS.md is updated on the branch before the PR.
- The assignment PDF stays local (`LMS_Assignment.pdf`, git-ignored).

**Manual test steps**

1. `git pull` on `main`, then `npm install`, `npm install --prefix backend` and `npm install --prefix frontend`.
2. `npm run lint && npm run typecheck && npm test && npm run build` from the root: everything passes.
3. `npm start --prefix backend`, then open http://localhost:4000/anything: you get `{"success":false,"error":{"code":"NOT_FOUND",...}}`.
4. `npm run dev --prefix frontend`, then open http://localhost:3000: you see the "Loan Management System" heading.
5. Try a bad commit message, for example `git commit --allow-empty -m "update stuff"`: commitlint rejects it.
6. `npm run secrets`: gitleaks reports no leaks.
