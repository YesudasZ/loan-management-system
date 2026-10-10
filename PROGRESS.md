# Progress

One entry per merged branch, newest last. Each entry says what changed and how to test it by hand.

| #   | Branch                         | Status                 |
| --- | ------------------------------ | ---------------------- |
| 1   | `chore/repo-setup`             | merged                 |
| 2   | `feat/backend-foundation-auth` | merged                 |
| 3   | `feat/frontend-foundation`     | merged                 |
| 4   | `feat/borrower-journey`        | merged                 |
| 5   | `feat/operations-modules`      | in review (E2E)        |
| 6   | `feat/sales-admin-overview`    | planned                |
| 7   | `test/rbac-security-hardening` | planned                |
| 8   | `docs/readme-polish-release`   | planned (tag `v1.0.0`) |

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
