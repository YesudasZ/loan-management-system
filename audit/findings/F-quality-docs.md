# Findings: Lens F: Code quality, repo, docs

Format and severity scale: `audit/README.md`.

## Findings

### F-01 · Low · `CollectionModule.tsx` is 247 lines (four components in one file); two other files sit just over 200

- **Lens:** F (Code quality)
- **Evidence:** `git ls-files backend/src frontend/src | grep -E '\.(ts|tsx)$' | grep -v '\.test\.ts$' | xargs wc -l | sort -rn` (tests and fixtures excluded):
  - `frontend/src/components/dashboard/CollectionModule.tsx` **247**: `CollectionQueue` (:27), `PaymentForm` (:48-154), `PaymentHistory` (:157-201), `CollectionLoanView` (:203-247).
  - `frontend/src/components/borrower/LoanCalculator.tsx` **206**: `Slider` (:47), `SummaryRow` (:73), `LoanCalculator` (:94). Marginal.
  - `backend/src/scripts/test-data/loan-history.ts` **201**: a seed-script builder, not runtime code. Doesn't matter.
  - Everything else is ≤ 196 (`StaffModule.tsx` 196, `test-data-seed.ts` 193, `SanctionModule.tsx` 190, `api-client.ts` 186, `seed-borrowers.ts` 182).
- **Steps to reproduce:** run the command above.
- **Impact:** readability only. `CollectionModule.tsx` is the only file that's clearly over; the payment form and the history table are self-contained and easy to move out.
- **Breaks:** CLAUDE.md §2 "Ideally a file stays under ~200 lines; split it if it grows beyond that" (soft rule).
- **Suggested fix:** move `PaymentForm` and `PaymentHistory` to `components/dashboard/PaymentForm.tsx` and `PaymentHistory.tsx` (≈ 150 lines out). Leave `LoanCalculator.tsx` and `loan-history.ts` as they are.
- **Status:** open

### F-02 · Low · A few small rules and paths are written twice although a helper or constant already exists

- **Lens:** F (Code quality)
- **Evidence:**
  - BRE input from a stored profile: `backend/src/modules/dashboard/dashboard.service.ts:68-74` builds `{ dateOfBirth: utcMidnightToCalendarDate(...), monthlySalary, pan, employmentMode }` inline, which is exactly `toBreInput()` in `backend/src/modules/borrower/borrower.dto.ts:51-58` (it only takes a full `BorrowerProfileDocument`, so the lead row can't use it).
  - Page paths: `route-access.ts:13-34` and `wizard.ts:3-8` define every module and wizard path, but `ProfileForm.tsx:103` (`'/apply/salary-slip'`), `LoanCalculator.tsx:131` (`'/apply/status'`), `SignupForm.tsx:39` (`'/apply'`), `AdminOverview.tsx:15-17` (the three module paths), `CollectionModule.tsx:25` and `SanctionModule.tsx:23` (`QUEUE_PATH`) repeat them as literals. `DashboardShell.tsx:26` has its own prefix test (`pathname.startsWith(path)`) next to the shared `isUnder()` in `route-access.ts:57`.
  - Display text: `LoanCalculator.tsx:185` writes "÷ 365" next to `{ANNUAL_INTEREST_RATE_PERCENT}%` (the `DAYS_IN_YEAR` constant exists, `lib/constants.ts:57`); "5 MB" is literal text in `SalarySlipForm.tsx:19,105` and `ApplicationSteps.tsx:56` although `MAX_UPLOAD_BYTES` is used for the check. `lib/loan-terms.ts:15-16` says such text is built from the constants "so the pages can never show different numbers", and these places don't follow it.
- **Steps to reproduce:** `grep -rnE "'/(dashboard|apply)[a-z/-]*'" frontend/src`; compare `dashboard.service.ts:68-74` with `borrower.dto.ts:51-58`.
- **Impact:** none today (all copies agree). Renaming a route or changing a limit would need edits in several places, and a missed one shows wrong text or a broken link.
- **Breaks:** CLAUDE.md §2 "No magic numbers" (the display text) and the "abstract on the third time" guideline (module paths appear 3 times).
- **Suggested fix:** widen `toBreInput` to `Pick<BorrowerProfile, 'dateOfBirth' | 'monthlySalary' | 'pan' | 'employmentMode'>` and call it from `toLeadDto`; use `getStepPath('SALARY_SLIP' | 'STATUS')`, `getHomePath('BORROWER')` and the `DASHBOARD_MODULES` paths instead of literals; use `isUnder` in `DashboardShell`; render "5 MB" and "365" from the constants.
- **Status:** open

### F-03 · Low · Test gaps: the safe-redirect tests miss dot-segment paths (B-08), and the route-guard token check and the demo seed have no tests

- **Lens:** F (Tests)
- **Evidence:** the suites pass (backend 26 files / 477 tests, frontend 7 files / 82 tests) and cover every area CLAUDE.md §7 names. The important cases without a test:
  1. `frontend/src/lib/route-access.test.ts:120-128` tests `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:`, a bare host, NUL and `''`, but no dot-segment or encoded form (`/.//evil.com`, `/..//evil.com`, `/%2e//evil.com`). That is exactly the open redirect in **B-08** (High), which these tests let through.
  2. `frontend/src/lib/session-token.ts:10-23` (`getRoleFromSessionToken`, used by `proxy.ts` on every page) has no test: missing/short secret → null, expired token, a token signed with another algorithm or secret, an unknown role. It fails closed by design, but nothing pins that.
  3. The demo seed (`backend/src/scripts/seed-demo.ts`, `seed-borrowers.ts`, `seed-loan-outcomes.ts`) has no test (`grep -rlnE "seed-demo|seed-borrowers|seed-loan-outcomes" backend/tests` → only the test-data seed tests). The test-data seed is tested thoroughly (`test-data-seed.test.ts`, `test-data-logins.test.ts`); the demo seed that the README's accounts depend on is not (it resets roles, which matters for **G-03**, and its UTR cleanup is **D-03**).
  4. Smaller: no test records a payment on a CLOSED loan (only SANCTIONED → 409, `payments.test.ts:126`) or a negative amount (`payments.test.ts:117-124` has zero, fractional, symbols, extra field); no auto-close test with ADMIN as the actor. `maskPan` (`utils/pan.ts`) is tested inside `tests/unit/payment-rules.test.ts:56-63` instead of its own file.
- **Steps to reproduce:** `npm test` from the root; read the files above.
- **Impact:** regressions in the login redirect, the page guard or the evaluator's demo data wouldn't be caught by CI. Item 1 already happened (B-08).
- **Breaks:** CLAUDE.md §7 "Every bug fix includes a test that would have caught the bug" (applies to the B-08 fix); otherwise none (the mandatory areas are covered).
- **Suggested fix:** add the three B-08 payloads (and `/%2F/evil.com`) to the `getSafeNextPath` `it.each` with the fix; add `session-token.test.ts` (sign tokens with `jose` in the test); add an integration test that runs the demo seed twice against the in-memory DB and checks every README account logs in with its documented role and state; add the CLOSED-loan payment case; move the `maskPan` tests to `tests/unit/pan.test.ts`.
- **Status:** open

### F-04 · Info · `npm run typecheck` fails on a machine without `frontend/.env.local`: `next typegen` loads `next.config.ts`, which validates the env

- **Lens:** F (Tests / tooling)
- **Evidence:** from the root with no frontend env: `npm run typecheck` → backend `tsc` passes, then `next typegen` fails with `ZodError … BACKEND_URL must be the API base URL … JWT_SECRET: expected string, received undefined` (`next.config.compiled.js:17`). With `BACKEND_URL=http://localhost:4000 JWT_SECRET=<throwaway 40 chars> npm run typecheck` → `✓ Types generated successfully`, exit 0. CI sets both (`.github/workflows/ci.yml` frontend `env:`), and README setup step 3 creates `frontend/.env.local`, so it only bites someone who runs the checks straight after cloning. `npm test` and `npm run lint` need no env.
- **Steps to reproduce:** in a shell without those variables and without `frontend/.env.local`, run `npm run typecheck` from the root.
- **Impact:** a confusing ZodError for an evaluator who runs the quality checks before configuring the frontend.
- **Breaks:** none.
- **Suggested fix:** one line under README "Tests and quality checks": "`typecheck` and `build` read `frontend/.env.local` (setup step 3); tests and lint need no env."
- **Status:** open

### F-05 · Low · The `v1.0.0` tag and GitHub release are three merged PRs behind `main`

- **Lens:** F (Repo hygiene)
- **Evidence:** `git rev-list -n1 v1.0.0` → `0795638 docs(docs): final readme, docs refresh and ui polish for v1.0.0 (#10)`. `git log --oneline v1.0.0..main` → `8fbebf3 feat(seed): … test data … (#11)`, `e62e109 feat(rbac): add admin staff management … (#12)`, `1bc86bc style(frontend): theme, split login, responsive audit, error handling (#13)`. `gh release list` → `v1.0.0 … Latest … 2026-10-10T05:49:38Z`; its notes describe the app as of #10 (no Staff management, no test data). `PROGRESS.md:14` still says branch 8 is "merged (tagged `v1.0.0`)" as if that were the final state.
- **Steps to reproduce:** run the commands above.
- **Impact:** an evaluator who opens the "Latest" release (or checks out the tag) gets a version without staff management, the test data and the responsive/error-handling work; the release notes undersell what's submitted.
- **Breaks:** CLAUDE.md §4 "Tag the final submission `v1.0.0` with a GitHub release note".
- **Suggested fix:** after the audit fixes merge, tag the final `main` (`v1.1.0`, or move `v1.0.0` if nobody has used it) and update the release notes (staff management, test data, UI work, the video link).
- **Status:** open

### F-06 · Low · Untracked, tool-generated `frontend/AGENTS.md` sits in the working tree

- **Lens:** F (Repo hygiene)
- **Evidence:** `git status --short` → `?? frontend/AGENTS.md` (679 bytes, 2026-10-10 11:49). It's the `<!-- BEGIN:nextjs-agent-rules -->` block that `next dev` writes when it detects an AI coding agent (`node_modules/next/dist/server/lib/generate-agent-files.js`; `start-server.js:406` logs "Set `agentRules: false` in next.config to disable"). Neither `.gitignore` nor `frontend/next.config.ts` handles it (`git check-ignore -v frontend/AGENTS.md` → not ignored). The file's text asks agents to commit it.
- **Steps to reproduce:** run `npm run dev --prefix frontend` from an agent session, then `git status`.
- **Impact:** it reappears after every agent-run `next dev`; a `git add -A` would commit vendor instructions aimed at agents into the submission, next to the project's own CLAUDE.md.
- **Breaks:** CLAUDE.md §2 spirit (no stray/dead files); none formally.
- **Suggested fix:** disable it rather than ignore it: add `agentRules: false` to `frontend/next.config.ts` (a supported option in Next 16.4, `config-schema.js:545`; with it `next dev` removes the block and the empty file), and delete the current file. Ignoring it in `.gitignore` would also work but leaves the generator running.
- **Status:** open

### F-07 · Info · Local repo has 7 stale branches and 13 stale remote-tracking refs; one squash title uses `style` for a PR that adds behaviour

- **Lens:** F (Repo hygiene)
- **Evidence:** `git ls-remote --heads origin` → only `refs/heads/main` (merged branches were deleted on GitHub, as CLAUDE.md §4 asks). Locally `git branch -a` still lists `chore/repo-setup`, `feat/backend-foundation-auth`, `feat/borrower-journey`, `feat/frontend-foundation`, `feat/operations-modules`, `feat/sales-admin-overview`, `test/rbac-security-hardening` (all MERGED per `gh pr list --state all`) and 13 `remotes/origin/*` refs including both Dependabot branches. Separately, `1bc86bc style(frontend): theme, split login, responsive audit, error handling (#13)` squashes a `feat(frontend): add error boundaries and double-click protection` commit; `style` normally means no change in behaviour. The two Dependabot squash titles start with a capital "Bump" (exempt from the title check by DECISIONS #6).
- **Steps to reproduce:** `git branch -a -vv`; `git ls-remote --heads origin`.
- **Impact:** none for the evaluator (a fresh clone has only `main`); local clutter only.
- **Breaks:** none.
- **Suggested fix:** `git fetch --prune` and `git branch -D` the merged local branches. For future squashes, use the most significant type in the PR title (`feat`).
- **Status:** open

### F-08 · Low · README is stale in five places: frontend test count, module and docs lists, PR count, required checks

- **Lens:** F (Docs accuracy)
- **Evidence (doc → code):**
  1. `README.md:285` "**Frontend: 78 tests**" → `npm test` gives **82** (7 files; `PROGRESS.md:394` already says 82). The list after it also leaves out the loan-terms and single-flight tests (`frontend/src/lib/loan-terms.test.ts`, `single-flight.test.ts`). The backend count (477) is right.
  2. `README.md:189` `modules/ auth, borrower, loans, payments, uploads, dashboard, health` → `backend/src/modules/` also has **`admin/`** (staff management, `admin.routes.ts`).
  3. `README.md:203` `docs/ API, ARCHITECTURE, DECISIONS, DEPLOYMENT, SECURITY` → `docs/` also has **`TEST_ACCOUNTS.md`** and **`UI.md`** (and `screenshots/`).
  4. `README.md:308` "built in **8 PRs**" → `gh pr list --state all` shows 11 feature PRs (#1, #4-#13) plus 2 Dependabot PRs; `PROGRESS.md:5-17` lists 11 branches.
  5. `README.md:286` "… and a Conventional-Commit PR title check. `main` is protected and requires these checks" → branch protection requires only `Backend`, `Frontend` and `Secret scan` (`gh api repos/:owner/:repo/branches/main/protection`), deliberately not the PR-title check (`docs/DECISIONS.md:39`, #24).
- **Steps to reproduce:** compare the lines above with `npm test`, `ls backend/src/modules docs`, `gh pr list --state all`.
- **Impact:** the evaluator reads the README first; a wrong test count or a missing module in the structure is the kind of thing that undermines the rest of the docs.
- **Breaks:** CLAUDE.md §8 "README / `.env.example` / API table updated if behavior or config changed".
- **Suggested fix:** 82 frontend tests (add "loan terms, double-click guard"); add `admin` to the module list and `TEST_ACCOUNTS, UI` to the docs list; "built in 11 PRs"; "requires the lint/typecheck/test/build and secret-scan checks (the PR-title check runs but isn't required)". Re-check the counts as the last step before submission, since the audit fixes will add tests.
- **Status:** open

### F-09 · Low · docs/ contradict the code in several places (ARCHITECTURE, DECISIONS #31, DEPLOYMENT, UI, SECURITY) and PROGRESS shows branch 11 as "in review"

- **Lens:** F (Docs accuracy)
- **Evidence (doc → code):**
  1. `docs/ARCHITECTURE.md:44-52` module table has no **`admin`** module (`backend/src/modules/admin/`, 3 endpoints), and `:70` lists the dashboard components without **`StaffModule`** (`frontend/src/components/dashboard/StaffModule.tsx`).
  2. `docs/ARCHITECTURE.md:21-22` puts `verifyOrigin` (step 2) before `express.json` and the cookie parser (step 3); `backend/src/app.ts:56-58` mounts them in the opposite order. (The behaviour is already **B-03**; this is the second doc that states the wrong order.)
  3. `docs/DECISIONS.md:46` (#31) "`validate()` shadows `req.query` with an own property holding the parsed value" → `backend/src/middleware/validate.ts:4-7,22-35` accepts only `body` and `params`; list queries are parsed in the controllers (`loans.controller.ts:19-33`), as #61 (`DECISIONS.md:85`) and the validate.ts JSDoc say. #31 describes code that no longer exists (related to **B-02**).
  4. `docs/DEPLOYMENT.md:40` "`npm run seed` (creates the 6 role accounts)" → the demo seed upserts **17** accounts (5 staff + 12 borrowers; `seed-demo.ts:17-28`, `seed-borrowers.ts:50-124`, run result `{"accounts":17,"demoBorrowers":12}`).
  5. `docs/DEPLOYMENT.md:126` "You land on **Overview** with all **four** modules in the sidebar" → ADMIN gets Overview + **five** modules (Sales, Sanction, Disbursement, Collection, Staff; `route-access.ts:13-29`, `DashboardShell.tsx:18-22`).
  6. `docs/UI.md:59` "Lists are cards below 640px and tables above it" → only My loans switches at 640px (`MyLoansList.tsx:59,95` `sm:`); the loan queues and Staff are cards until **1024px** (`LoanQueue.tsx:50,81`, `StaffModule.tsx:79,96` `lg:`), as `DECISIONS.md:117` (#81) and `UI.md:98` say; the Sales table never becomes cards (`UI.md:94`).
  7. `docs/SECURITY.md:35` "matrix denied cells use a **random** id" → a fixed id (`rbac-matrix.test.ts:41` `ANY_ID = '64b7f0c2a1b2c3d4e5f60718'`); `SECURITY.md:32` ("an arbitrary id") is the accurate wording. `SECURITY.md:7` still titles the review "final review, branch 7" although it includes the branch-10 staff rows.
  8. `PROGRESS.md:17` branch 11 `style/theme-login-responsive-audit` → "in review"; PR #13 was merged (`1bc86bc`, CI on main green 2026-10-10T08:42Z).
- **Already reported elsewhere (not repeated here):** `README.md:236`, `docs/DEPLOYMENT.md:187` and `DECISIONS.md:49` (#34) say the demo seed never touches other users, contradicted by **D-03**; `docs/SECURITY.md:73` says `getSafeNextPath` blocks open redirects, contradicted by **B-08**; `DECISIONS.md:45` (#30) "startup-made dummy hash" is **C-03**; `docs/API.md:11` "queries … unknown fields → 400" is **B-02**; the broken API.md table is **B-01**; `PROGRESS.md:14` and the v1.0.0 release are **F-05**.
- **Steps to reproduce:** open each doc line and the code reference next to it.
- **Impact:** small, but these are the documents an evaluator uses to understand the design; two of them describe a pipeline order and a validate() feature the code doesn't have.
- **Breaks:** CLAUDE.md §8 (docs updated when behaviour changes), §9 (decisions recorded accurately).
- **Suggested fix:** add `admin` and `StaffModule` to ARCHITECTURE; correct the pipeline order there (or move `verifyOrigin` first in `app.ts` as B-03 suggests, then the doc becomes right); rewrite DECISIONS #31 to "query strings are parsed in the controllers (see #61)" or delete it; DEPLOYMENT: "creates the 17 demo accounts" and "Overview plus all five modules"; UI.md: "My loans: cards below 640px; queues and Staff: cards below 1024px; Sales: a scrolling table"; SECURITY: "a fixed, arbitrary id" and drop "branch 7" from the heading; PROGRESS: mark branch 11 merged and add the audit branch.
- **Verification (P1):** Confirmed (2 claims checked) — claim 3: `docs/DECISIONS.md:46` (#31) says "`validate()` shadows [`req.query`] with an own property", but `backend/src/middleware/validate.ts:4-7` has only `body?` and `params?`, and its JSDoc (`:19-20`) says query strings are parsed in the controllers, as #61 (`DECISIONS.md:85`) says; #31 is stale. Claim 4: `docs/DEPLOYMENT.md:40` says `npm run seed` "creates the 6 role accounts"; running the real `seedDemoData()` in-process (`audit/scripts/v-g03.ts`) returns `{"accounts":17,"demoBorrowers":12}` with 17 users. Docs-only: Low is right.
- **Status:** open

## Passed checks

- **F1** `any`: `grep -rnwE "any" backend/src backend/tests frontend/src` finds only prose in comments and `expect.any(String)` in tests; no `: any`, `as any`, `<any>` or `any[]`. Both ESLint configs enforce it (`backend/eslint.config.js:20-22`, `frontend/eslint.config.mjs:10-12`: `no-explicit-any`, `no-non-null-assertion`, `no-console` all `error`); both tsconfigs have `strict` + `noUncheckedIndexedAccess`.
- **F1** `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`: none. Three `eslint-disable-next-line` comments, each with a reason: `SalarySlipViewer.tsx:28` (`<img>` of an authenticated API file), `api-client.ts:163,166` (`location.assign` of a relative path, explained above it).
- **F1** Non-null assertions: `grep -rnE "\w!\.|\w!\)|\w!\[|\w!;|\w!,|\)!\.|\]!\." backend/src backend/tests frontend/src` → no matches. Type casts are limited to `<select>` values narrowed to their option union (`ProfileForm.tsx:164`, `ChangeRoleDialog.tsx:53`, `AddStaffDialog.tsx:90`, `StaffModule.tsx:172`, `AdminOverview.tsx:80`), `Object.keys/fromEntries` typings (`ProfileForm.tsx:36`, `dashboard.service.ts:150`), the API client's response body (`api-client.ts:181`, the envelope is zod-checked; the payload type is trusted) and test fixtures. Acceptable.
- **F1** `console.*`: none in `backend/src`, `backend/tests` or `frontend/src` (the backend logs through pino, `config/logger.ts`).
- **F1** TODO/FIXME/XXX/HACK: none (the only hits are the `'todo'` step state in `WizardStepPage.tsx:15,23`).
- **F1** Commented-out code: all 159 `//` comment lines reviewed by grepping for code-like characters; every one is a "why" comment or the usage block in `seed.ts:9-13`. No `/* … */` code blocks.
- **F1** Magic numbers: numeric literals in `backend/src` outside `constants.ts` and the seed scripts are HTTP status codes, named local constants (`env.ts:3-4`, `duplicate-key.ts:3`, `loan-math.ts:3`) and the ObjectId regex length. Clean.
- **F2** Layering: no controller imports a model (`grep -nE "^import" backend/src/modules/*/*.controller.ts`: only express types, `getAuthUser`, `sendSuccess`, schemas, `AppError` and the module's service). Models are imported only by services, DTOs (type-only), `server.ts`/`models/index.ts` and the seed scripts. No service imports `express` or touches `req`/`res` (`grep -nE "from 'express'|\breq\b|\bres\b" backend/src/modules/*/*.service.ts` → nothing). `authenticate` reads the user through `auth.service.findAuthUserById`, not the model. The one shortcut is `health.controller.ts:2` calling `config/db.isDatabaseReachable()` (connection state, not a model): acceptable for a health probe.
- **F2** Deliberate mirrors only: `frontend/src/lib/bre.ts`, `loan-math.ts`, `constants.ts` (PAN/UTR regexes, limits) and `auth-schemas.ts` mirror the backend and say so; the vectors in `backend/tests/fixtures/*.json` are shared by both test suites. Outstanding balance is computed once (`loans.dto.ts:34` `getOutstanding`; the seed's own copy in `test-data/loan-history.ts:125` is script code). Action roles come from the state machine (`loans.routes.ts:56,63,70` use `LOAN_ACTIONS.*.allowedRoles`), payment roles from `PAYMENT_RECORDER_ROLES`. The two user-name lookups (`loan-operations.service.ts:28` `loadPeople`, `payments.service.ts:140-144`) are a second copy, allowed by "abstract on the third time".
- **F2** Naming: every backend file is kebab-case (`git ls-files backend/src backend/tests | xargs -n1 basename | grep -vE '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9-]+)*\.(ts|json)$'` → nothing); every `frontend/src/components` file is PascalCase `.tsx`; `lib/`, `types/` are kebab-case and hooks are `useX.ts`. Exported constants are UPPER_SNAKE (the only camelCase ones are the zod shape `paginationQueryFields` and Next's required `config` export in `proxy.ts:27`). Status, role, error-code and lead-stage values are UPPER_SNAKE strings. Collections are plural lowercase: `users`, `loans`, `payments`, `borrower_profiles`, GridFS bucket `salary_slips` (`models/*.model.ts` `collection:` options). Every API route is under `/api/v1` (`app.ts:61-67`) with kebab-case segments (`salary-slip`); `/health` is unversioned on purpose (`health.routes.ts:4`, needed by Render). `/borrower/*` is a singular "current borrower" namespace with no ids in the path (planned in PLAN.md §5, recorded in DECISIONS.md #70): acceptable.
- **F3** `npm test` (root, 2026-10-10): backend **26 files, 477 tests passed** (15.2 s, in-memory replica set); frontend **7 files, 82 tests passed**. Total 559, 0 failed.
- **F3** No skipped or focused tests: `grep -rnE "\b(it|test|describe)\.(skip|only|todo|fails|skipIf|runIf)\b|\bx(it|describe)\(|\bf(it|describe)\(" backend/tests frontend/src` → no matches.
- **F3** Coverage of the mandatory areas (CLAUDE.md §7): BRE 18 shared vectors incl. 23rd birthday today/tomorrow, 50y364d, 51 today, 29 Feb in a non-leap year, future DOB, ₹24,999.99/₹25,000, lowercase PAN with spaces, all four failing (`tests/fixtures/bre-vectors.json`, run by both apps), plus messages and time-zone independence (`TZ=America/New_York`); loan math 5 shared vectors (min/max, worked example, rounding both ways) + whole-paise check; state machine every action × every status (`loan-state-machine.test.ts:19-41`) and the role table; payment rules (`payment-rules.test.ts`) and the payment flow incl. exact payoff auto-close, duplicate UTR with rollback, overpay, dates, concurrency (`payments.test.ts`); RBAC matrix 21 endpoints × 7 identities = 147 cells (`rbac-matrix.test.ts:356-358`), IDOR suite (`security.test.ts:32-85`), staff-management rules (`admin-users.test.ts`).
- **F3** `npm run lint` (root): fails only on other auditors' temporary files (`backend/audit-tmp-a/a-req.ts`, `backend/audit-tmp-e/memdb.mjs`: "not found by the project service"). On the repo itself: `cd backend && npx eslint . --max-warnings 0 --ignore-pattern 'audit-tmp-*/**'` → exit 0; `npm run lint --prefix frontend` → exit 0.
- **F3** `npm run typecheck` (root) with throwaway `BACKEND_URL`/`JWT_SECRET`: backend `tsc --noEmit` and frontend `next typegen && tsc --noEmit` both exit 0 (see F-04 for the env requirement).
- **F4** Conventional Commits on `main`: all 14 commits match `<type>(<scope>): <lowercase summary>` (`git log --oneline main`), except the deliberate `chore: initial commit` and the two Dependabot titles (F-07). Enforced locally (`.husky/commit-msg` → commitlint with the CLAUDE.md types/scopes, `commitlint.config.js`) and on PRs (`.github/workflows/pr-title.yml`). The longest squash headers are 72 characters plus GitHub's ` (#4)` suffix.
- **F4** `.gitignore` covers `.env` and `.env.*` (except `.env.example`), `node_modules/`, `dist/`, `coverage/`, `.next/`, `out/`, `*.tsbuildinfo`, `next-env.d.ts`, `LMS_Assignment.pdf`, `.vercel/`, `*.log`, `.DS_Store`: `git check-ignore -v` confirms `backend/.env`, `frontend/.env.local`, `LMS_Assignment.pdf`, `backend/dist`, `frontend/.next`, `frontend/next-env.d.ts`, `frontend/tsconfig.tsbuildinfo`, `backend/coverage/x`. `git ls-files` has no `.env` other than the two `.env.example` files and no PDF.
- **F4** Lockfiles: `package-lock.json`, `backend/package-lock.json`, `frontend/package-lock.json` are all tracked; CI uses `npm ci` with them.
- **F4** CI: `gh run list --branch main --limit 3` → `success` for #13 (2026-10-10T08:42Z), #12 and #11. The PR-title check passed on #13.
- **F4** Stray files: besides `frontend/AGENTS.md` (F-06), the only untracked items are other auditors' `backend/audit-tmp-a/` and `audit/scripts/a-req.ts` (ignored as instructed). `frontend/public/` is an empty, untracked directory (harmless).
- **F5** README demo accounts (`README.md:19-35`) match the seed exactly: 5 staff in `seed-demo.ts:17-23` and 12 borrowers in `seed-borrowers.ts:50-124` with the documented states. Seeding a fresh in-memory replica set with the real `seedDemoData()` (scratch script, throwaway env) gave `{"accounts":17,"demoBorrowers":12}`: `demo.applied1/2` APPLIED, `demo.sanctioned` SANCTIONED, `demo.disbursed1` DISBURSED with 0 payments, `demo.disbursed2` DISBURSED with 1, `demo.rejected` REJECTED with a reason, `demo.closed` CLOSED with 2 payments; `lead.brefail` fails AGE + EMPLOYMENT (21, unemployed); the five leads have the stages the README gives. (The live data differs: **G-03/G-04**.)
- **F5** README API table (`README.md:156-174`) matches the 25 registered routes (`backend/src/modules/*/*.routes.ts`, roles included); setup commands and seed flags match `backend/package.json` scripts and `seed.ts:9-34` (`--test-data`, `--remove-test-data`, `--force`, mutually exclusive); tech stack versions match the package.json files; data-model indexes match `models/*.model.ts`; live URLs match `docs/DEPLOYMENT.md:74,162` (reachability is Lens G's); the `docs/TEST_ACCOUNTS.md` link resolves; backend test count 477 and "21 protected endpoints × 7 identities" are correct (`rbac-matrix.test.ts:356-358`).
- **F5** `docs/TEST_ACCOUNTS.md` matches `backend/src/scripts/test-data/*` exactly: the real `seedTestData()` on an in-memory replica set gave `{"users":60,"profiles":33,"salarySlips":27,"loans":125,"payments":159}` (the counts in `DEPLOYMENT.md:212` and README); a scratch comparator parsed all **125** borrower-loan rows (status, amount, tenure, total, paid, outstanding, payment count, days ago, names) and found **no differences**; the 25 staff names, 10 leads (name, stage, failed rules), the per-role counts (5/5/5/75/35 + 10 leads), the collection payment mix (0, 1, 1, 2, 3) and the walkthrough figures (applied1 ₹2,00,000/60 d, sanctioned1 ₹2,00,000/240 d, disbursed1 outstanding ₹2,03,945.21) all match. The staff-management messages it quotes match `admin.service.ts` and `StaffModule.tsx:41`.
- **F5** `docs/DEPLOYMENT.md` seed commands are valid for the CLI (`npm run seed -- --force`, `-- --test-data --force`, `-- --remove-test-data --force`); command-line `MONGODB_URI` wins over `.env` because Node's `--env-file-if-exists` never overrides existing variables; `/health` response shape (`:41`) matches `sendSuccess`; the Vercel build-time env check (`:103`) matches `next.config.ts:6-11`.
- **F5** `docs/API.md` vs code (beyond B-01/B-02): every error code thrown in `backend/src` appears in the error table (`API.md:17-31`); `LoanSummary`, `LoanDetail`, `Payment`, `AdminUser`, `BorrowerLoan` and `BorrowerProfile` shapes (`API.md:68-78`) match the DTO interfaces (`loans.dto.ts`, `payments.dto.ts`, `admin.dto.ts`, `borrower.dto.ts`).
- **F5** `docs/SECURITY.md` claims checked against code: bcrypt cost 10, HS256 pinned, cookie flags, three rate limits, strict schemas, `sanitizeFilter` + `strictQuery: 'throw'`, `isObjectIdOrHexString` on JWT subjects (`auth.service.ts:76`), multer `files: 1, fields: 0` (`upload.ts:11`), GridFS `<uuid>.<ext>` names (`salary-slip-storage.ts:28`), `CORS_ORIGINS` normalised with `new URL().origin` (`env.ts:16`), requests without `Origin` skip the check (`verify-origin.ts:16`); every cited test exists (`jwt.test.ts:16,21,30`, `admin-users.test.ts:129`, `security.test.ts:88-131`). The RBAC matrix count (21 × 7 = 147) matches `rbac-matrix.test.ts`. Exceptions: F-09 items 7 and B-08.
- **F5** `docs/DECISIONS.md` spot-checked against code (#10-#14, #17-#18, #24, #29, #32, #36, #41-#42, #49, #52-#54, #60-#66, #81): consistent, except #31 (F-09), #30 (C-03) and #34 (D-03).
