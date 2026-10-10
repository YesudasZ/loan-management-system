# Progress

One entry per merged branch, newest last. Each entry says what changed and how to test it by hand.

| #   | Branch                                       | Status                                   |
| --- | -------------------------------------------- | ---------------------------------------- |
| 1   | `chore/repo-setup`                           | merged                                   |
| 2   | `feat/backend-foundation-auth`               | merged                                   |
| 3   | `feat/frontend-foundation`                   | merged                                   |
| 4   | `feat/borrower-journey`                      | merged                                   |
| 5   | `feat/operations-modules`                    | merged (E2E)                             |
| 6   | `feat/sales-admin-overview`                  | merged                                   |
| 7   | `test/rbac-security-hardening`               | merged                                   |
| 8   | `docs/readme-polish-release`                 | merged (tagged `v1.0.0`)                 |
| 9   | `feat/seed-test-data`                        | merged                                   |
| 10  | `feat/admin-staff-management`                | merged                                   |
| 11  | `style/theme-login-responsive-audit`         | merged                                   |
| 12  | `chore/pre-submission-audit`                 | merged (report: `audit/AUDIT_REPORT.md`) |
| 13  | Audit fixes (`fix/audit-*`, one branch each) | in progress                              |

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

**Checkpoint A passed (2026-10-10).** The API is live at https://loan-management-system-wl8j.onrender.com: `/health` → 200 with the database connected, a foreign-Origin POST → 403, a bad login → 401.

## 3. `feat/frontend-foundation`

**What changed**

- **Same-origin API:** `next.config.ts` rewrites `/api/*` to `BACKEND_URL`. `BACKEND_URL` and `JWT_SECRET` are validated at build. Page-only security headers (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, `nosniff`, Referrer-Policy, Permissions-Policy).
- **Route guard (`src/proxy.ts`):** verifies the session JWT and applies `resolveRouteAccess`:
  - anonymous → `/login?next=…`
  - borrowers can't reach `/dashboard`
  - executives only reach their module (another module → the 403 page)
  - ADMIN reaches every module but not `/apply`
  - logged-in users skip `/login`
    An invalid cookie is deleted. `getSafeNextPath` blocks open redirects.
- **API client:** typed `apiRequest` that unwraps the envelope, throws `ApiError`, redirects only on `UNAUTHENTICATED` / `FORBIDDEN`, and retries GETs while Render wakes up (with a banner).
- **Pages:** login and signup (client validation mirroring the backend, field errors, generic login error), the 403 page, a borrower shell for `/apply`, and a dashboard shell with a role-filtered sidebar (a drawer on mobile) plus placeholder pages for Overview, Sales, Sanction, Disbursement and Collection. Toasts via sonner; logout.
- **Backend:** request logs include `clientIp` to measure `TRUST_PROXY_HOPS`.
- `@types/node` is pinned back to 24.x after Dependabot's bump to 26 (the runtime is Node 24).
- **Tests:** 29 frontend unit tests (route access for every role and path, safe `next` paths, INR format). Backend: 43 tests unchanged.
- **Verified locally end to end** (built app + API + MongoDB): role redirects for sanction, admin and borrower, cookie flags, `no-store`, Origin rejection through the proxy, tampered-cookie cleanup, and a browser login → logout with no console errors.

**Manual test steps** (locally, with your backend running on :4000)

1. `npm install --prefix frontend`, then `cp frontend/.env.example frontend/.env.local` and set `JWT_SECRET` to the same value as `backend/.env`.
2. `npm run dev --prefix frontend` and open http://localhost:3000. It redirects to `/login`.
3. Log in as `admin@lms.dev` / `Password@123`. You land on Overview, with all modules in the sidebar.
4. Log out, then log in as `sanction@lms.dev`. You land on Sanction. Open `/dashboard/collection` and `/apply`: both show the 403 page.
5. Log in as `borrower@lms.dev`. You land on `/apply`. `/dashboard` shows the 403 page.
6. Visit `/login?next=//evil.com` and log in. You stay on the app (your home page).
7. Sign up a new account. You land on `/apply` as a borrower.
8. Checkpoint B on Vercel: follow docs/DEPLOYMENT.md "Checkpoint B".

**Checkpoint B passed (2026-10-10).** The web app is live at https://loan-management-system-beta-pearl.vercel.app (API: https://loan-management-system-wl8j.onrender.com).

- A first sign-up failed with 403 `INVALID_ORIGIN` until Render was redeployed with the new `CORS_ORIGINS`.
- Verified through Vercel: own-origin POST → 200, foreign-origin POST → 403, `/auth/me` → 401 with `no-store` (`x-vercel-cache: MISS`), anonymous `/dashboard` → redirect to login. You confirmed the role logins and redirects.
- **Open item:** `TRUST_PROXY_HOPS` is still `1`. Measure it from the Render log line of a login through Vercel (docs/DEPLOYMENT.md, checkpoint B step 5) before the rate limits are relied on.

## 4. `feat/borrower-journey`

**What changed**

- **BRE** (`utils/bre.ts`, mirrored in `frontend/src/lib/bre.ts`): age 23–50 from the exact date of birth (IST calendar date; 29 Feb handled), salary ≥ ₹25,000, PAN `^[A-Z]{5}[0-9]{4}[A-Z]$` after trim and uppercase, not unemployed. It returns **every** failure, in a fixed order.
- **Profile:** `PUT /api/v1/borrower/profile` saves the profile and runs the BRE (200 eligible / 422 `BRE_FAILED` with all failures, profile still saved). `GET /api/v1/borrower/progress` resumes the wizard from the right step.
- **Salary slip:** `POST/GET /api/v1/borrower/salary-slip`. PDF/JPG/PNG up to 5 MB, with extension, declared type and magic bytes all checked. Stored in GridFS under a generated name; owner-only download with safe headers.
- **Apply:** `POST /api/v1/borrower/loans` takes only `{ principal, tenureDays }`. The server calculates SI = round(P × 12 × T / 36500) and the total, re-runs the BRE, snapshots the applicant and slip, and creates an APPLIED loan. One active loan per borrower is enforced by a pre-check and a partial unique index (race-safe).
- **Loan state machine** (`utils/loan-state-machine.ts`) with every transition tested. The operations modules use it in branch 5.
- **Frontend wizard:**
  - Personal details, with a live eligibility preview; the server's 422 lists the failures.
  - Salary slip upload.
  - Loan sliders: keyboard-accessible, `aria-valuetext`, a debounced screen-reader announcement, and a live calculation panel.
  - Status page: amounts, outstanding, timeline, rejection reason, "Apply again".
  - The step bar resumes at the right step, and editing is locked while a loan is active.
- **Seed:** demo leads (new, BRE-failed, no slip, ready) and two APPLIED loans with generated PDF slips, all created through the real services.
- **Tests:** backend 138 (BRE and loan-math shared vectors, state machine, dates, profile/BRE, uploads incl. spoofed files and 413, apply incl. client totals → 400, the concurrent-apply race, the apply-time BRE re-check, borrower-only RBAC). Frontend 76 (the same BRE and loan-math vectors, wizard redirects, formatting).
- **Verified locally in the browser:**
  - signup → age 21 shows the server 422 → fixed → eligible → slip uploaded → ₹1,50,000 for 90 days (₹4,438.36 interest) → APPLIED status page
  - resume and locking redirects
  - the 375 px layout

**Manual test steps**

Locally, after `npm run seed --prefix backend` with both apps running:

1. Sign up a new borrower. You land on **Personal details**.
2. Enter a date of birth that makes you 21, a salary of 45000, PAN `ABCDE1234F`, Salaried. The preview flags age. Click continue: a red box lists "You must be at least 23 years old (you are 21)".
3. Change the date of birth to 1995, then continue. You see a toast and step 2.
4. Upload a PDF, JPG or PNG under 5 MB. "View slip" opens it. Try renaming a .txt to .pdf: it's rejected.
5. Continue. The sliders default to ₹1,00,000 / 90 days → interest ₹2,958.90, total ₹1,02,958.90. Try the arrow keys on the sliders.
6. Apply. The status page shows APPLIED with the timeline.
7. Open `/apply/profile`: you're sent back to the status page (locked while the loan is active).
8. Log in as `lead.brefail@lms.dev`: you land on Personal details with the saved failures shown.

**Deploy checks after the merge** (Vercel builds `main`; Render redeploys after CI):

1. Re-run the production seed (`MONGODB_URI='<prod>' NODE_ENV=production npm run seed -- --force` from `backend/`) so the new demo borrowers exist.
2. Upload-size check through Vercel, from any folder (`V` = the Vercel URL):

   ```bash
   V=https://loan-management-system-beta-pearl.vercel.app
   python3 -c "open('slip-4.9mb.pdf','wb').write(b'%PDF-1.4\n' + b'0' * 4_900_000)"
   python3 -c "open('slip-5.1mb.pdf','wb').write(b'%PDF-1.4\n' + b'0' * 5_300_000)"
   curl -s -c jar -H 'Content-Type: application/json' -H "Origin: $V" -d '{"email":"lead.noslip@lms.dev","password":"Password@123"}' $V/api/v1/auth/login
   curl -s -b jar -H "Origin: $V" -F 'file=@slip-4.9mb.pdf;type=application/pdf' $V/api/v1/borrower/salary-slip
   curl -s -b jar -H "Origin: $V" -F 'file=@slip-5.1mb.pdf;type=application/pdf' $V/api/v1/borrower/salary-slip
   ```

   Expected: the 4.9 MB upload → `{"success":true,...}`; the 5.1 MB upload → our JSON `FILE_TOO_LARGE`. If either returns a Vercel error page instead, send it to me (fallback plan in PLAN.md).

## 5. `feat/operations-modules` (end-to-end milestone)

**What changed**

- **Sanction:**
  - APPLIED queue → review page: applicant (masked PAN), BRE result, loan terms, inline salary slip viewer (PDF `<iframe>` / image), history.
  - **Approve**, or **Reject** with a required reason (shown to the borrower).
- **Disbursement:** SANCTIONED queue with **Mark disbursed** behind a confirm dialog; stores `disbursedAt` and `disbursedBy`.
- **Collection:**
  - DISBURSED queue with outstanding balances → loan page with a payment form (UTR, amount in ₹, date, "Fill outstanding amount") and payment history.
  - Each payment runs in a **MongoDB transaction**; the loan **auto-closes** when the balance reaches zero.
- **API:** `GET /loans` (role-scoped, paginated), `GET /loans/:id`, `POST /loans/:id/approve|reject|disburse`, `GET /loans/:id/salary-slip`, `GET|POST /loans/:id/payments`. Action roles come from the state machine.
- **Seed:** loans in every status (2 APPLIED, 1 SANCTIONED, 1 REJECTED, 2 DISBURSED incl. one partial payment, 1 CLOSED), created through the real services as the seeded staff.
- **Tests:** backend **180**, including:
  - queue scoping, 404 outside the module, 409 on a double approve, a concurrent-approval race
  - reject needs a reason; disburse needs no body
  - slip visibility per role
  - payments: partial, auto-close, duplicate UTR (any case) with no partial write, overpay / future / before-disbursal → 422, not disbursed → 409
  - **two simultaneous payments can't overpay**
  - RBAC for every new endpoint
- **End-to-end in the browser (local, seeded replica set):**
  1. `sanction@` reviewed Arjun (PDF slip rendered in Chrome) and approved → toast and back to the queue.
  2. `sanction@` opening `/dashboard/collection` saw the 403 page.
  3. `disbursement@` marked it disbursed.
  4. `collection@` recorded ₹50,000 → outstanding ₹52,958.90.
  5. The same UTR in lowercase → "already been recorded".
  6. "Fill outstanding amount" → the loan auto-closed → toast and back to the queue.
  7. `demo.applied1@` saw **CLOSED** with the full timeline.

**Manual test steps** (local or deployed, after re-seeding)

1. `sanction@lms.dev` → Sanction → **Review** Arjun Applied: check the applicant, BRE, slip viewer → **Approve**.
2. `disbursement@lms.dev` → **Mark disbursed** → confirm.
3. `collection@lms.dev` → **Record payment** for Arjun:
   - ₹50,000 with UTR `UTR0001` → outstanding drops.
   - `utr0001` again → duplicate error.
   - New UTR + **Fill outstanding amount** → "Loan fully repaid and closed".
4. Log in as `demo.applied1@lms.dev` → status page shows CLOSED with the timeline.
5. Try Reject on Anita Applied: an empty reason is refused, and a real reason shows on `demo.applied2@`'s status page.
6. As `sanction@`, open `/dashboard/collection` → 403 page. As `admin@`, all modules are in the sidebar.

**After the merge:**

- Re-run the production seed (it now also creates the SANCTIONED, DISBURSED, REJECTED and CLOSED demo loans).
- Run the deployed E2E (the steps above on the Vercel URL).
- Run the 4.9 MB upload check from §4 if not done yet.

## 6. `feat/sales-admin-overview`

**What changed**

- **Sales** (`/dashboard/sales`, `GET /api/v1/leads`): registered borrowers who haven't applied yet, newest first and paginated. Each has a stage badge (Details pending / Not eligible / Slip pending / Ready to apply), and BRE failures are shown as notes.
- **Admin overview** (`/dashboard`, `GET /api/v1/dashboard/summary`): count cards for leads and every loan status (zero-filled; the active ones link to their module), plus an **all-loans table with a status filter**.
- **Tests:** backend 191 (one per lead stage, borrowers with any loan excluded, staff excluded, pagination order, zero-filled counts, RBAC: leads SALES+ADMIN, summary ADMIN only).
- Checked in the browser against seeded data: counts 5 leads / 2 applied / 1 sanctioned / 2 disbursed / 1 closed / 1 rejected; the filter works; the Sales stages are correct.

**Manual test steps**

1. `admin@lms.dev` → **Overview**: the cards match the seeded data. Pick "Rejected" in the filter → only Rohit Rejected. Click the "Applied" card → Sanction queue.
2. `sales@lms.dev` → lands on **Sales**: Radha (Ready to apply), Nikhil (Slip pending), Bharat (Not eligible, with reasons), Neha and Bala (Details pending). The sidebar shows only Sales; `/dashboard` sends you back to Sales.
3. Sign up a new borrower in another browser → they appear at the top of the Sales list as "Details pending".

## 7. `test/rbac-security-hardening`

**What changed**

- **RBAC matrix** (`backend/tests/integration/rbac-matrix.test.ts`): **16 protected endpoints × 7 identities = 112 cells**. Anonymous → 401, a role not allowed → 403, an allowed role → the real success status (each allowed cell builds fresh data in the right state).
- **Security suite** (`security.test.ts`):
  - IDOR: one borrower can't reach another's progress, slip, loan, slip-by-loan or payments, and edits only touch their own records.
  - Executives get 404 outside their module.
  - Query-operator injection (`?status[$ne]=`, `?page[$gt]=`) and body operator injection → 400.
  - Mass assignment (`userId`, `breResult`, `status`, `recordedBy`) → 400.
  - CORS allow / deny.
- **Unit tests:** the session cookie is `Secure` in production (module reloaded with `NODE_ENV=production`), and log redaction leaves no cookie, auth header or password in the output.
- **`docs/SECURITY.md`:** a final review against CLAUDE.md §6, each rule mapped to its implementation and the test that proves it, plus the known limitations.
- Backend tests: **326** (was 191). No production code changed apart from exporting the log redaction list for its test.

**Manual test steps**

1. `npm test --prefix backend`: 326 passing, including the 112-cell matrix.
2. Read `docs/SECURITY.md`; every rule should point at a file and a test.
3. Optional spot check on the deployed app: as `sanction@`, call `GET /api/v1/loans?status=DISBURSED` → 403; as a borrower, open `/dashboard` → 403 page.

## 8. `docs/readme-polish-release`

**What changed**

- **README rewritten for evaluators:**
  - live URLs and every demo account
  - features per portal and module, and the tech stack
  - architecture, loan-lifecycle and data-model diagrams (Mermaid), plus collections and indexes
  - business rules (BRE, loan math with a worked example, payments) and the API summary
  - security summary, project structure, local setup, tests, deployment, engineering process and known limitations
- **`docs/ARCHITECTURE.md`:** the request pipeline, layer responsibilities, modules, where each key rule lives, the frontend structure and the testing approach.
- **`docs/DEPLOYMENT.md`:** redeploy notes and a release checklist (rotate the DB password, a prod URI naming `lms_prod`, re-seed, upload check, `TRUST_PROXY_HOPS`, deployed E2E).
- **UI polish:**
  - Queues show as cards on phones, with the action button visible; the table returns from `sm` up.
  - A 404 page links to the user's home page.
  - A "Skip to content" link appears on keyboard focus (every layout's `<main>` is its target).
- No backend changes. Backend 326 tests, frontend 76 tests.

**Manual test steps**

1. Read the README on GitHub: the Mermaid diagrams render, and every link (docs, PROGRESS, CLAUDE) opens.
2. Open any queue (for example `sanction@` → Sanction) at phone width (375 px): cards with a **Review** button, no sideways scrolling.
3. Open `/does-not-exist` → the 404 page → "Go to my home page" takes you to your role's home.
4. Reload any page and press <kbd>Tab</kbd> once: "Skip to content" appears top-left. <kbd>Enter</kbd> jumps focus to the main content.

**After the merge:** I tag `v1.0.0` and create the GitHub release.

### Submission checklist (for you)

- [ ] Rotate the Atlas password (it was shared in chat) and make the prod `MONGODB_URI` end in `/lms_prod?…`, on Render and locally (docs/DEPLOYMENT.md, release checklist).
- [ ] Re-seed production, then do the deployed E2E run and re-seed again.
- [ ] Upload check through Vercel: 4.9 MB passes, 5.1 MB → `FILE_TOO_LARGE` (§4).
- [ ] Measure and set `TRUST_PROXY_HOPS` (DEPLOYMENT.md checkpoint B step 5).
- [ ] Record a 3–5 minute demo video:
  1. A borrower fails the BRE, fixes it, uploads a slip and applies.
  2. Sanction approves; disbursement disburses.
  3. Collection records a partial payment, sees a duplicate UTR rejected, then the final payment auto-closes the loan.
  4. The borrower sees CLOSED.
- [ ] Upload the video as unlisted, and put the link in the README ("Demo video") and the `v1.0.0` release notes.
- [ ] Submit the repository URL, the live URL and the demo credentials (README "Demo accounts").

## 9. `feat/seed-test-data`

Goal: every login (all 6 roles) sees at least 5 records right after logging in.

**What changed**

- **My loans (borrowers):**
  - `GET /api/v1/borrower/loans` (paginated, newest first) and `GET /api/v1/borrower/loans/:loanId`. Both are BORROWER-only and always scoped to the logged-in borrower; another borrower's loan id → 404.
  - `/apply/loans` lists every loan (amount + tenure, total, paid, outstanding, status, date), with cards on phones. Each loan opens a read-only detail page with its timeline.
  - It's linked from a new header tab and from the status page ("See all my loans").
- **Paid / outstanding before disbursal:** both are now hidden ("—") until a loan is disbursed, on the status page too. Before, a rejected loan showed its full total as "outstanding".
- **Test data** (`npm run seed -- --test-data`, removable with `--remove-test-data`):
  - 25 staff (`admin1–5`, `sales1–5`, `sanction1–5`, `disbursement1–5`, `collection1–5`)
  - 25 borrowers (`applied1–5`, `sanctioned1–5`, `disbursed1–5`, `closed1–5`, `rejected1–5`), each with exactly 5 loans: 4 finished past loans and 1 current
  - 10 Sales leads at every stage
  - All on `@test.lms.dev` with password `Test@1234`: 125 loans and 159 payments over the last 90 days
- **How the test loans are built:** each loan runs through the real rules (apply schema, BRE, `calculateLoanQuote`, `LOAN_ACTIONS` / `getNextStatus`, `validatePayment`), so totals, history, payments and balances always agree. The plain seed is unchanged and never touches `@lms.dev`.
- **Refactors:** the demo seed moved to `seed-demo.ts` (importable by tests). The payment roles and the auto-close note are now shared constants.
- **Tests:**
  - backend **424** (was 326): borrower loans (IDOR, RBAC, pagination); the RBAC matrix now 18 endpoints × 7 = **126 cells**; the test-data seed (consistency of every loan, counts per status, staff spread, idempotent re-seed, removal leaves the demo data identical); and **a login as each of the 60 test accounts**, checking what that role sees
  - frontend **77**
- **Docs:** `docs/TEST_ACCOUNTS.md` (credentials, every borrower's 5 loans, what each role sees, an RBAC checklist, a suggested flow), API table, README, DEPLOYMENT (production commands), SECURITY, DECISIONS 67–71.
- **Checked in the browser** (local, in-memory DB):
  - `disbursed3@` status page → My loans (5 loans) → a rejected loan's detail
  - the 375 px card layout
  - `sanction1@` queue with the 5 test applications

**Manual test steps**

Locally, with your backend on your `lms_dev` database:

1. `npm run seed --prefix backend -- --test-data`. The log ends with `"loans":125,"payments":159,"msg":"Test data added"`. Run it again: same counts.
2. Log in as `closed1@test.lms.dev` / `Test@1234`. The status page shows CLOSED → **My loans** shows 5 loans → open a REJECTED one: the reason is shown, with no "Apply again" and no outstanding.
3. Log in as `sanction1@`, `disbursement1@` and `collection1@`. Each queue has at least 5 test loans; the sanction review shows the PDF slip, and the collection loans show payment history.
4. `admin1@`: Overview counts are at least 5 for every status. `sales1@`: 10 test leads with mixed stages.
5. Follow the RBAC checklist and the suggested flow in `docs/TEST_ACCOUNTS.md`.
6. `npm run seed --prefix backend -- --remove-test-data`: the `@test.lms.dev` accounts are gone, and the `@lms.dev` demo logins still work with their data.

**After the merge (production):** run the commands in DEPLOYMENT.md, "Test data in production". Then record the demo video together (you type the signup, logins and PAN; I drive the rest).

## 10. `feat/admin-staff-management`

Goal: ADMIN can manage who has which role, from the dashboard.

**What changed**

- **API (ADMIN only):**
  - `GET /api/v1/admin/users?role&search&page&limit`: users newest first; `search` matches the name or email ignoring case, as plain text.
  - `POST /api/v1/admin/users`: creates a staff account with the sign-up rules. The role must be a staff role; a duplicate email → 409.
  - `PATCH /api/v1/admin/users/:userId/role`
  - No response ever includes the password hash.
- **Safety rules** (each tested):
  - An admin can't change their own role (409 `CANNOT_CHANGE_OWN_ROLE`).
  - The last admin can't be demoted (409 `LAST_ADMIN`). It's re-checked after the write and undone if no admin is left, so two admins demoting each other at once can't both win.
  - A borrower with any loan can't become staff (409 `BORROWER_HAS_LOANS`).
  - The update is conditional on the role that was checked (409 `ROLE_CHANGED` on a concurrent change).
- **Audit:** `roleHistory` on the user (`{ from, to, by, at }`), written in the same update as the change; admin-created accounts get a first entry. DECISIONS 72 explains why this beats logging.
- **Staff page** (`/dashboard/staff`; in the sidebar and allowed by the route guard for ADMIN only, other roles get the 403 page):
  - users with role badges, a search box and a role filter, with cards on phones
  - **Add staff member** (name, email, temporary password, role)
  - **Change role** (a dialog with a role dropdown and a confirm button), which explains that the user must log out and back in to see their new dashboard
  - your own row has no change button
  - 409s show inline; successes show a toast
- **Tests:**
  - backend **477** (was 424): `admin-users.test.ts` (32: list/search/filter/pagination, regex-safe search, create + log in with the temporary password, every safety rule, concurrent mutual demotion, Origin check, 403/401 for every non-admin) and the RBAC matrix, now 21 endpoints × 7 = **147 cells**
  - frontend **78**: Staff is ADMIN-only in the route guard
- **Checked in the browser** (local, demo seed):
  - Staff list, role filter, search
  - add a staff member (the duplicate email shows inline), change their role (toast)
  - a borrower with a loan → staff refused inline
  - the 375 px layout
  - the new staff member logs in to their module and gets 403 on Staff
- **Docs:** API (endpoints, `AdminUser`, error codes), README, SECURITY (four new rows, two known limitations), DECISIONS 72–76, TEST_ACCOUNTS (how to test).

**Manual test steps** (live site, after the merge and the Render/Vercel deploys)

1. Log in as `admin@lms.dev` / `Password@123` → **Staff** appears in the sidebar → the list shows everyone with role badges. Try the search and the role filter.
2. **Add staff member**: a name, a new email you control (e.g. `qa.sanction1@example.com`), a temporary password such as `Welcome123`, role **Sanction** → toast, and the user is in the list. Try `sales@lms.dev` as the email: inline "already exists".
3. Log out and log in as the new account → you land on **Sanction**; `/dashboard/staff` shows the 403 page.
4. As the admin, **Change role** on that account → **Collection** → toast. Log in as them again → you land on **Collection**.
5. Change role on `demo.closed@lms.dev` (a borrower with a loan) → any staff role → inline "This borrower has loans…".
6. Your own row has no Change role button.
7. As `sanction@lms.dev`, open `/dashboard/staff` → the 403 page.
8. Clean up afterwards: change the QA account back to **Borrower** (it isn't removed by `--remove-test-data`).

## 11. `style/theme-login-responsive-audit`

UI only: no business logic, API, RBAC or seed changes. Still one login page for every role, and no new public pages.

**What changed**

- **Split-screen login and sign-up:**
  - From 1024px: a navy brand panel with the loan terms (₹50,000–₹5,00,000, 30–365 days, 12% p.a. simple interest), who can apply, and how it works in 4 steps. The form is on the right.
  - Phones and tablets: the form first, the facts below it.
  - The login says "Staff and borrowers use the same login."
  - Every value comes from `lib/loan-terms.ts`, which is built from the constants and pinned by a test. It replaces four hand-written copies elsewhere.
- **Theme:**
  - Tailwind 4 tokens (primary blue-700, primary-dark blue-950, accent emerald-600, warning, danger, background, foreground) used through the UI kit.
  - Status badges: APPLIED blue, SANCTIONED indigo, DISBURSED amber, CLOSED emerald, REJECTED red, always with their text label.
  - Every text, button and badge pair meets WCAG AA (table in `docs/UI.md`).
- **Responsive audit** at 360/390/768/1024/1440px, covering every page, dialog and the backend-down state. Main fixes (checklist in `docs/UI.md`):
  - long names and emails no longer widen the page (the overview was 450px wide at 360px)
  - Collection at 768px no longer overflows
  - 44px tap targets on phones
  - 16px inputs, so iOS doesn't zoom
  - larger slider thumbs on a 44px track
  - the header no longer wraps
  - dashboard lists show as cards until 1024px
- **Crash-proofing:**
  - error boundaries for the root, `/apply`, `/dashboard`, plus `global-error`, each with "Try again" and a home link
  - with the backend stopped, pages show the waking banner, then "server is starting up" with Try again
  - double-click protection (`useSingleFlight`) on Apply, Approve, Reject, Mark disbursed and Record payment: three clicks in one frame sent one request
- **Docs:** README future work (separate staff portal/domain, SSO, 2FA for staff, IP allowlisting), `docs/UI.md`, DECISIONS 77–83, and before/after screenshots in `docs/screenshots/`.
- **Tests:** frontend **82** (was 78): the loan-terms text and the single-flight guard. Backend 477, unchanged.

**Manual test steps**

Live site, after the merge (Vercel deploys the frontend; nothing changes on Render). On desktop:

1. Open the site logged out → `/login` shows the navy panel on the left (terms, who can apply, how it works) and the form on the right, with "Staff and borrowers use the same login." `/` still redirects to `/login`.
2. Log in as `admin@lms.dev` → the Overview badges are coloured (APPLIED blue, SANCTIONED indigo, DISBURSED amber, CLOSED emerald, REJECTED red). Open each module.
3. As `sanction@lms.dev`, open an application and double-click **Approve** quickly → one toast, back to the queue, approved once.

On your phone:

4. Open the site → the form first, the loan facts below; no sideways scrolling.
5. Log in as `borrower@lms.dev` (or a lead such as `lead.ready@lms.dev`):
   - Tapping a field doesn't zoom the page.
   - On the loan step the slider thumbs are easy to drag and the totals update.
6. Log in as `admin@lms.dev` → **Menu** opens the drawer with large links; the lists are cards; open Collection → a loan → the payment form fits. Try Sanction → Reject… → the dialog fits with the keyboard open.
7. Open `/apply` as staff or `/dashboard` as a borrower → the 403 page with a large "Go to my home page" button.

## 12. `chore/pre-submission-audit`

A full pre-submission audit across 7 lenses (requirements, API/RBAC, security, functional, frontend, code/docs, live smoke test), with independent verification. Report and fix plan: `audit/AUDIT_REPORT.md`. Evidence: `audit/findings/`, `audit/scripts/`. Docs only.

## 13. Audit fixes

One `fix/audit-*` branch per approved group, each with regression tests and the full Definition of Done.

- **`fix/audit-open-redirect` (B-08, High):**
  - **Problem:** `getSafeNextPath` checked the raw `?next=` but returned the URL parser's normalised path, so `/login?next=/.//evil.com` redirected to `https://evil.com` after login.
  - **Fix:** the navigated path is now checked too, and encoded `%2f`/`%5c` are refused.
  - **Tests:** 16 new cases in `route-access.test.ts` (15 payloads × 3 roles, plus harmless dot segments still resolving internally); 11 fail without the fix.
  - **Manual test** (live, after Vercel deploys): log out, open `/login?next=/.//example.com`, log in → you land on your home page, not example.com.
- **`fix/audit-admin-self-role` (B-05, Low):**
  - **Problem:** an admin could change their own role by sending their user id in upper-case hex; the guard compared strings.
  - **Fix:** every id is normalised to lower case at validation (`objectIdSchema`), and the guard compares ObjectIds.
  - **Tests:** the own id in upper case → 409 `CANNOT_CHANGE_OWN_ROLE` (fails without the fix); an upper-case id for another user still works.
