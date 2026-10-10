# Findings: Lens G: Live smoke check (read-only)

Format and severity scale: `audit/README.md`.

## Findings

### G-01 · Low · Pages send only a `frame-ancestors` CSP (no script/style policy)

- **Lens:** G (Live smoke check)
- **Evidence:** `curl -sI https://loan-management-system-beta-pearl.vercel.app/login` → `content-security-policy: frame-ancestors 'self'` (no `default-src`/`script-src`). Configured in `frontend/next.config.ts` (page security headers). The API (helmet) sends a full CSP.
- **Steps to reproduce:** run the curl above and look at `content-security-policy`.
- **Impact:** if an XSS bug were ever introduced, the browser would apply no script-source restriction on pages. React escaping makes such a bug unlikely; this is defence in depth.
- **Breaks:** none (CLAUDE.md §6 asks for helmet on the API, which is met).
- **Suggested fix (nice-to-have):** add a nonce-based CSP in `proxy.ts` (Next.js "Content Security Policy" guide), or at least `default-src 'self'; object-src 'none'; base-uri 'self'` in `next.config.ts` headers, after testing that Next's inline runtime still works.
- **Status:** open

### G-02 · Info · A CORS preflight from a foreign origin still sends `Access-Control-Allow-Credentials: true`

- **Lens:** G (Live smoke check)
- **Evidence:** `curl -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" https://loan-management-system-wl8j.onrender.com/api/v1/auth/login -D -` → `access-control-allow-credentials: true` and **no** `access-control-allow-origin`.
- **Steps to reproduce:** run the curl above.
- **Impact:** none. Without `Access-Control-Allow-Origin` the browser rejects the preflight. This is standard `cors` package behaviour.
- **Breaks:** none.
- **Suggested fix:** none needed. Optionally pass `credentials` only for allowed origins with the `cors` origin callback.
- **Status:** open

### G-03 · High · `borrower@lms.dev` has the COLLECTION role on production

- **Lens:** G (Live smoke check)
- **Evidence:** user-run `audit/scripts/live-smoke.sh` (2026-10-10 14:36 IST): `borrower@lms.dev` logs in (200), but `/` → `/dashboard/collection`, `GET /api/v1/borrower/progress` → 403, `GET /api/v1/borrower/loans` → 403, `GET /api/v1/loans` → 200.
- **Steps to reproduce:** log in to the live site as `borrower@lms.dev` / `Password@123`: you land on the Collection module.
- **Impact:** the README's "fresh borrower" demo account isn't a borrower any more. An evaluator following the README can't walk the borrower journey with it. This was most likely changed through the new Staff page during manual testing (the change is allowed: a borrower without loans may become staff). It's data, not a code defect.
- **Breaks:** PDF: seeded accounts for evaluation; README "Demo accounts" table.
- **Suggested fix:** as an admin, Staff → `borrower@lms.dev` → Change role → Borrower; or re-run the demo seed on production (it resets every demo account's role). Treat demo accounts as read-only during manual QA; use a throwaway account to test role changes.
- **Status:** open

### G-04 · High · The production database Render reads is stale: seeded only up to the branch-4 demo data

- **Lens:** G (Live smoke check)
- **Evidence:** same run:
  - admin `GET /api/v1/loans` → **2** items in total; sanction 2 (APPLIED); disbursement **0**; collection **0**;
  - `demo.closed@lms.dev` → login **401** (the account doesn't exist);
  - admin users list: 13 accounts.
    The branch-5 demo seed adds SANCTIONED, DISBURSED (×2), REJECTED and CLOSED loans plus `demo.sanctioned`, `demo.disbursed1/2`, `demo.rejected`, `demo.closed`. None of these exist in the database Render reads.
- **Steps to reproduce:** log in as `disbursement@lms.dev` or `collection@lms.dev`: both queues are empty. `demo.closed@lms.dev` can't log in.
- **Impact:** in the video and for evaluators, the Disbursement and Collection modules are empty. The admin overview shows almost nothing. Accounts listed in the README don't exist.
- **Breaks:** README "Demo accounts" (lists accounts that don't exist); the PDF's evaluation of each module.
- **Suggested fix:** confirm which database Render's `MONGODB_URI` names (the URI-inspection command from earlier compares host and database without printing secrets). Then run `npm run seed -- --force` (demo) against **that** database, or switch Render to `/lms_prod` after seeding it. Re-run `audit/scripts/live-smoke.sh` afterwards.
- **Status:** open

### G-05 · High · The `@test.lms.dev` test data is absent from the database Render reads

- **Lens:** G (Live smoke check)
- **Evidence:** same run: `admin1`, `sales1`, `sanction1`, `disbursement1`, `collection1`, `applied1`, `lead1` `@test.lms.dev` with `Test@1234` all → **401**.
- **Steps to reproduce:** log in as `sanction1@test.lms.dev` / `Test@1234` on the live site → "Invalid email or password".
- **Impact:** `docs/TEST_ACCOUNTS.md` and the video script ("Sanction queue shows several loans from the test data") don't match production.
- **Breaks:** the user's goal "every login sees at least 5 records" on production; docs accuracy.
- **Suggested fix:** like G-04, seed the database Render actually reads with `npm run seed -- --test-data --force` (expect `"loans":125,"payments":159`), then re-run the smoke script. G-04 and G-05 most likely share one cause: the seeds ran against a different database name (e.g. `lms_prod`) than the one in Render's URI.
- **Status:** open

## Passed checks

- **G1** `/health` → 200 `{"status":"ok","database":"connected"}`. `/login` → 200. Anonymous `/` → 307 `/login`; `/dashboard` → 307 `/login?next=%2Fdashboard`; `/apply/loans` → 307 `/login?next=%2Fapply%2Floans`. (2026-10-10, logged out)
- **G2** Page headers on `/login`: HSTS (`max-age=63072000; includeSubDomains; preload`), `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=()`, `cache-control: private, no-cache, no-store`.
- **G2** API `GET /api/v1/auth/me` (anonymous) → 401 envelope `{"success":false,"error":{"code":"UNAUTHENTICATED",…}}` with `cache-control: no-store`, `x-vercel-cache: MISS`, the helmet CSP, nosniff, HSTS and no `x-powered-by`.
- **G2** Unknown API route → 404 `{"success":false,"error":{"code":"NOT_FOUND","message":"Route not found"}}`: no stack trace or internals.
- **G3** `POST /api/v1/auth/logout` with `Origin: https://evil.example` and no session → 403 `INVALID_ORIGIN` (nothing changed).
- **G4** Logged-in checks: the orchestrator may not sign in on a non-local site, so `audit/scripts/live-smoke.sh` was prepared for the user. It checks login, the cookie flags (httpOnly, Secure, SameSite=Lax), the landing page per role, each module endpoint (with item counts), a 403 for a wrong-role API, a `/forbidden` redirect for a wrong-role page, and logout for every demo role. It also logs in to one test account per role (to diagnose the earlier test-data issue). Read-only: it prints only statuses, flag names and counts. Syntax-checked and dry-run against a closed port. **User ran it 2026-10-10 14:36 IST:** all 5 demo staff roles pass every check (login 200; cookie `httponly samesite=lax secure`; landing page per role; module endpoints 200; wrong-role API → 403; wrong-role page → `/forbidden`). Failures are data problems G-03, G-04 and G-05.
