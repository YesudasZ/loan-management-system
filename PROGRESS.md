# Progress

One entry per merged branch, newest last. Each entry says what changed and how to test it by hand.

| #   | Branch                         | Status                  |
| --- | ------------------------------ | ----------------------- |
| 1   | `chore/repo-setup`             | merged                  |
| 2   | `feat/backend-foundation-auth` | in review               |
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

## 2. `feat/backend-foundation-auth`

**What changed**

- **Platform:** zod-validated env (crashes at startup with every problem listed), Atlas connection with `sanitizeFilter` and `strictQuery: 'throw'`, models initialised (indexes built) before listening, graceful shutdown on SIGTERM.
- **Hardening:** helmet, CORS allowlist, Origin check on state-changing requests (403 `INVALID_ORIGIN`), 100 kb JSON limit, `Cache-Control: no-store`, `trust proxy` from `TRUST_PROXY_HOPS`, pino logs with cookies and passwords redacted.
- **Errors:** `AppError` plus one error handler. Every error uses the `{ success: false, error: { code, message, details? } }` envelope, and unexpected errors never leak details.
- **`GET /health`:** pings the database (2 s cap); 503 when unreachable.
- **Auth:** `POST /api/v1/auth/signup | login | logout`, `GET /api/v1/auth/me`. bcrypt (cost 10), JWT (HS256, 1 day) in an httpOnly SameSite=Lax cookie (Secure in production), a generic login error with equal timing, sign-up always creates a BORROWER (`role` in the body is rejected), and three rate limits.
- **RBAC:** `authenticate` (reloads the user every request) and `requireRole(...)` with no implicit ADMIN bypass.
- **Seed:** `npm run seed` creates the 6 role accounts (`Password@123`), is idempotent, and refuses production without `--force`.
- **Deploy:** `render.yaml` (free plan, Singapore, deploys `main` after CI passes) and `docs/DEPLOYMENT.md` with the Atlas and Render steps.
- **Tests:** 43 (env, JWT, envelopes, Origin, 413, 500 leak, health 200/503, signup/login/logout/me, cookie flags, NoSQL injection, mass assignment, 429, requireRole incl. ADMIN → 403 on borrower routes).

**Manual test steps** (after checkpoint A's Atlas setup)

1. `npm install --prefix backend`, then `cp backend/.env.example backend/.env` and fill in the `lms_dev` URI and a `JWT_SECRET`.
2. `npm run seed --prefix backend`, then `npm run dev --prefix backend`.
3. `curl localhost:4000/health` → `{"success":true,"data":{"status":"ok","database":"connected"}}`.
4. Login and session (the `-c`/`-b` jar keeps the cookie):
   - `curl -s -c jar -H 'Content-Type: application/json' -d '{"email":"sanction@lms.dev","password":"Password@123"}' localhost:4000/api/v1/auth/login` → 200 with the user.
   - `curl -s -b jar localhost:4000/api/v1/auth/me` → the same user.
   - Wrong password → 401 `Invalid email or password`.
5. `curl -s -X POST -H 'Origin: https://evil.example' localhost:4000/api/v1/auth/logout` → 403 `INVALID_ORIGIN`.
6. Signup with `"role":"ADMIN"` in the body → 400.
7. Checkpoint A on Render: follow docs/DEPLOYMENT.md, then `curl https://<service>.onrender.com/health`.
