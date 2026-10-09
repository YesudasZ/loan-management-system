# CLAUDE.md — Project Rules (READ AND FOLLOW EVERY SESSION)

These rules are mandatory for every task in this repo. Before starting any work, re-read this file. Before finishing any branch, run the checklists at the bottom. If a rule conflicts with a quick shortcut, follow the rule. If something here is unclear or seems wrong, ask me instead of ignoring it.

## 1. Project
Loan Management System (LMS). Monorepo:
- `/frontend` — Next.js (App Router) + TypeScript + Tailwind → deployed on Vercel
- `/backend` — Express + TypeScript + Mongoose → deployed on Render
- Database — MongoDB Atlas (no local MongoDB, ever)
Full spec: `LMS_Assignment.pdf` (kept locally, git-ignored; never committed). Plan: `PLAN.md`. Progress log: `PROGRESS.md`.

## 2. Code philosophy (simple > clever)
- Write code a junior developer can read and understand in one pass. Prefer clear and boring over clever.
- Small functions with one job each. Ideally a file stays under ~200 lines; split it if it grows beyond that.
- Descriptive names: `calculateSimpleInterest`, not `calcSI`. Booleans start with `is/has/can`.
- No premature abstraction. Don't build generic frameworks, factories or base classes "for later". Duplicate twice; abstract on the third time.
- Comments explain **why**, not what. Add a short JSDoc on exported functions with business logic (BRE, loan math, state machine).
- No magic numbers. Business constants (interest rate, limits, file size) live in one `constants.ts` per app.
- Strict TypeScript. No `any`, no `@ts-ignore`, no non-null `!` unless justified in a comment.
- Validate at the boundaries (requests, env, uploads) with zod. Inside the app, trust your types.
- Layering on the backend: `routes → controller (HTTP only) → service (business logic) → model`. Controllers never touch Mongoose directly; services never touch `req`/`res`.
- Errors: throw typed `AppError(statusCode, code, message)` from services; one central error handler formats responses. No try/catch noise in every controller (use an async wrapper).
- Don't leave console.log debugging, commented-out code or TODOs without an issue reference.

## 3. Naming conventions
- Folders and non-component files: `kebab-case` (`loan-state-machine.ts`).
- React components: `PascalCase.tsx`. Hooks: `useSomething.ts`.
- Variables/functions: `camelCase`. Types/interfaces: `PascalCase` (no `I` prefix). Constants: `UPPER_SNAKE_CASE`.
- Enums/status values: `UPPER_SNAKE_CASE` strings (`APPLIED`, `SANCTIONED`).
- Mongo collections: plural lowercase (`users`, `loans`, `payments`). Fields: `camelCase`.
- REST routes: plural nouns, kebab-case, no verbs in paths except explicit actions (`POST /api/v1/loans/:id/approve`). Version all routes under `/api/v1`.
- Env vars: `UPPER_SNAKE_CASE`, documented in `.env.example`.

## 4. Git workflow (GitHub Flow + Pull Requests)
**Why GitHub Flow:** this is a solo project with one deployable branch. GitHub Flow (`main` + short-lived feature branches + PRs) is simple, standard and gives a clean, reviewable history. Git Flow's `develop`/`release` branches would add overhead with no benefit here.

Rules:
- `main` is always deployable. **Never commit directly to `main`.** (The only exception was the empty `chore: initial commit` that created `main`.)
- Every unit of work gets its own branch created from up-to-date `main`.
- Branch names: `<type>/<short-kebab-description>`, for example `feat/borrower-bre-check`, `fix/duplicate-utr-error`, `chore/ci-setup`, `docs/readme-deployment`, `test/loan-math`, `refactor/auth-middleware`.
  - Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `style`.
- One branch = one logical feature. Keep branches small and focused.
- Before opening a PR: rebase on `main`, run the Definition-of-Done checklist (section 8), and make sure CI is green.
- Open a PR with the `gh` CLI (if available) using the PR template. **Squash-merge** into `main`, then delete the branch.
- Update `PROGRESS.md` as the last commit on the branch, before opening the PR (never on `main`). After each merge, tell me what to test manually.
- Tag the final submission `v1.0.0` with a GitHub release note.

## 5. Commit messages (Conventional Commits)
Format: `<type>(<scope>): <imperative summary, lowercase, no period, ≤72 chars>`
- Scopes: `backend`, `frontend`, `auth`, `bre`, `loan`, `payment`, `rbac`, `upload`, `seed`, `ci`, `docs`, `deps`.
- Examples:
  - `feat(bre): add server-side eligibility rules with all-failures response`
  - `fix(payment): reject amount greater than outstanding balance`
  - `test(loan): cover simple interest rounding edge cases`
  - `chore(ci): add lint, typecheck and test workflow`
- Add a body explaining **why** when the change isn't obvious. Mark breaking changes with `BREAKING CHANGE:`.
- Make small, atomic commits: each commit builds and does one thing. Never write "wip", "fix stuff" or "update".
- Enforced with commitlint + husky.

## 6. Security rules (non-negotiable)
**Secrets**
- Never commit `.env`, keys, connection strings or tokens. Only `.env.example` with placeholders.
- Validate all env vars with zod at startup; crash fast if one is missing.
- Run a secret scan (gitleaks or equivalent) before every PR.

**Auth**
- Hash passwords with bcrypt, cost ≥ 10. Never return password hashes. Use `select: false` on the field.
- Store the JWT in an httpOnly, Secure (in production), SameSite=Lax cookie. Set a short expiry (e.g. 1 day). The secret is ≥ 32 random characters from env.
- Login errors are generic ("Invalid email or password"). Never reveal whether the email exists.
- Rate-limit `/auth/*` (express-rate-limit).
- Public sign-up always creates a BORROWER. Never accept `role` from a client body.

**Authorization**
- Enforce RBAC on the **backend** for every route (`authenticate` + `requireRole`). Frontend checks are UX only.
- **Prevent IDOR:** borrowers can only read or modify their own profile, loan and salary slip. Always scope queries by `req.user.id` for borrowers. Executives can only act on loans in the status their module owns.
- Return 401 when not logged in and 403 when the role is wrong. Never leak whether a resource exists to unauthorized users.

**Input & data**
- Use zod `.strict()` schemas on every body, query and param, which rejects unknown fields (prevents mass assignment).
- Prevent NoSQL injection: enable `mongoose.set('sanitizeFilter', true)` and never pass raw `req.body`/`req.query` objects into queries.
- Validate ObjectIds before querying.
- JSON body limit is 100kb. Upload limit is 5 MB.
- File uploads: check the extension AND the MIME type AND the magic bytes (`file-type` package). Allow only PDF/JPG/PNG. Store files in GridFS with a generated filename (never the user's filename). Serve them only through an authorized endpoint.
- Money is stored as integer paise. Never trust client-calculated totals; recalculate on the server.

**HTTP hardening**
- `helmet`, a CORS allowlist from env, `trust proxy` set for Render.
- Check the `Origin` header on state-changing requests as a CSRF safety net.
- The production error handler never sends stack traces or internal messages.
- Logs never contain passwords, tokens or full PANs (mask them as `ABCDE****F`).

**Dependencies**
- Use well-known, maintained packages only. Run `npm audit --audit-level=high` before each PR; fix or justify findings in the PR description.
- Commit lockfiles. Dependabot is enabled.

## 7. Testing
- Unit tests (vitest) for all pure business logic: BRE, loan math, state machine, payment validation.
- Integration tests (supertest + mongodb-memory-server) for auth, RBAC (every role against every module: right role → 200, wrong role → 403, no token → 401), and the payment/auto-close flow.
- Every bug fix includes a test that would have caught the bug.
- Tests must not hit Atlas. Use mongodb-memory-server.

## 8. Definition of Done (run before EVERY PR — report the results to me)
- [ ] `npm run lint` passes with no warnings
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes; new logic has tests
- [ ] `npm run build` succeeds for the affected app(s)
- [ ] `npm audit --audit-level=high` is clean (or the exceptions are justified)
- [ ] Secret scan is clean; no `.env` staged
- [ ] Security self-review against section 6 done: auth, RBAC, IDOR, validation, error leaks
- [ ] No `any`, console.log, commented-out code or dead code
- [ ] README / `.env.example` / API table updated if behavior or config changed
- [ ] `PROGRESS.md` updated
- [ ] Commits follow Conventional Commits; branch named correctly
- [ ] Manual test steps written for me

## 9. Communication
- Before each branch: state the branch name, the goal and the files you plan to touch.
- After each branch: summarize what changed, the Definition-of-Done results, and the manual test steps.
- When you make a design decision, record it in `docs/DECISIONS.md` (one short entry: decision + reason).
- If you're unsure about a requirement, ask. Don't guess silently.
