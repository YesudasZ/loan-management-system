# Findings: Lens A: Requirements compliance

Format and severity scale: `audit/README.md`.

## Findings

### A-01 · High · The demo video (a required submission item) is not recorded or linked yet

- **Lens:** A (Requirements compliance)
- **Evidence:** `README.md:11` `| **Demo video** | _link added at submission_ |`; `PROGRESS.md:273-278` "Record a 3–5 minute demo video" and "Upload the video as unlisted, and put the link in the README … and the `v1.0.0` release notes" are both unchecked; `grep -rni "youtube\|drive.google" README.md docs/ PROGRESS.md` → no link anywhere. Deadline: 2026-10-11 16:00 IST.
- **Steps to reproduce:** open `README.md` → the "Demo video" row has no link.
- **Impact:** One of the three things the PDF says to submit is missing; the E2E flow (35 % of the grade) is judged mainly from this video. The planned script (`PROGRESS.md:273-277`: BRE fail → fix → slip → apply → approve → disburse → partial payment + duplicate UTR → payoff auto-closes → borrower sees CLOSED) covers everything the PDF asks for, but it depends on the production data fixes G-03/G-04/G-05 first, or the Disbursement/Collection queues and `borrower@lms.dev` won't behave as scripted.
- **Breaks:** PDF §6.2 "Working Video (3–5 min) … Upload to YouTube (unlisted) or Google Drive."
- **Suggested fix:** After fixing G-03/G-04/G-05 and re-seeding production, record the 3–5 min run following `PROGRESS.md:273-277` (include one BRE failure with all four reasons visible), upload it unlisted to YouTube or Google Drive, check it plays in a logged-out browser, and put the link in `README.md:11` and the release notes.
- **Status:** open

### A-02 · Low · Duplicate of F-05: the `v1.0.0` tag and release are three merged PRs behind `main`

- **Lens:** A (Requirements compliance)
- **Evidence:** found independently while Lens F ran in parallel; F-05 has the full evidence. Lens A adds only that a fresh anonymous clone of the public repo (A13) carries the same tag (`v1.0.0` → `0795638`, `main` → `1bc86bc`), and that `PROGRESS.md:278` plans to put the video link (A-01) in "the `v1.0.0` release notes", so the release note should be written on the final tag.
- **Steps to reproduce:** see F-05.
- **Impact:** see F-05.
- **Breaks:** CLAUDE.md §4 "Tag the final submission `v1.0.0` with a GitHub release note."
- **Suggested fix:** see F-05; write the release note (live URL, credentials, video link) on the final tag.
- **Status:** duplicate of F-05 (track there)

### A-03 · Low · README "Local setup" doesn't say the database must be a replica set; on a plain local `mongod` every payment fails with 500

- **Lens:** A (Requirements compliance)
- **Evidence:** `README.md:208` only says "There is no local MongoDB: the app uses a free Atlas cluster"; `backend/src/config/env.ts:28-30` accepts any `mongodb://` URI, so an evaluator who swaps in a local MongoDB passes validation, signs in, applies, approves and disburses, but `payments.service.ts:63` uses a transaction. In-process with a standalone `MongoMemoryServer` (`backend/audit-tmp-a/a-standalone.ts`, kept as `audit/scripts/a-standalone.ts`): signup → profile → slip → apply → approve → disburse all OK, then `POST /api/v1/loans/:id/payments` → `500 {"code":"INTERNAL_ERROR","message":"Something went wrong. Please try again later."}`, log `MongoServerError: Transaction numbers are only allowed on a replica set member or mongos`.
- **Steps to reproduce:** run the API against a standalone `mongod` (or the script above) and record any payment.
- **Impact:** Following the README exactly (Atlas, always a replica set) works (A13). An evaluator who avoids creating an Atlas account and points `MONGODB_URI` at a local MongoDB, a common shortcut, gets an opaque 500 at the last step of the core flow (collection / auto-close) and may judge the flow broken.
- **Breaks:** PDF §6.1 "README with setup instructions" (completeness); CLAUDE.md §8 "README … updated if behavior or config changed".
- **Suggested fix:** In "Local setup", state that `MONGODB_URI` must point to a replica set (Atlas, or `mongod --replSet rs0` + `rs.initiate()`, or Docker `mongo:8 --replSet rs0`) because payments use transactions; optionally add a no-Atlas quick start (an `npm run db:memory` script that starts `MongoMemoryReplSet`, which is already a dev dependency).
- **Status:** open

### A-04 · Info · A fresh-clone setup prints alarming but harmless output that the README doesn't mention

- **Lens:** A (Requirements compliance)
- **Evidence:** A13 run (npm 11.16.0, Node 24.18.0): `npm install --prefix frontend` ends with "5 high severity vulnerabilities … run `npm audit fix --force`" (the dev-only `braces` chain, C-12); both installs print `npm warn allow-scripts … bcrypt, esbuild, mongodb-memory-server, fsevents, unrs-resolver have install scripts not yet covered by allowScripts` (everything still works: the seed hashes passwords with bcrypt, tsx/esbuild runs, the memory server starts); `npm run dev --prefix frontend` logs "Generated AGENTS.md for AI agents" and leaves an untracked `frontend/AGENTS.md` in the clone (the same stray file as in this repo: F-06).
- **Steps to reproduce:** follow README "Local setup" in a fresh clone.
- **Impact:** None functionally. An evaluator may run `npm audit fix --force` (downgrades `eslint-config-next` to 14) or think the install failed; `git status` is dirty after the first `npm run dev`.
- **Breaks:** none.
- **Suggested fix:** One line under step 1: "npm reports 5 high advisories in the frontend: dev-only lint tooling, not shipped (docs/SECURITY.md); don't run `npm audit fix --force`." For `AGENTS.md` see F-06 (e.g. `agentRules: false` in `frontend/next.config.ts`, the option the Next log names).
- **Status:** open

### A-05 · Low · Duplicate of F-08 (item 1): README says 78 frontend tests, `npm test` runs 82

- **Lens:** A (Requirements compliance)
- **Evidence:** found independently while Lens F ran in parallel; F-08 item 1 has the same evidence (`README.md:285` "Frontend: 78 tests" vs `cd frontend && npm test` → 7 files, 82 tests on 2026-10-10).
- **Steps to reproduce:** see F-08.
- **Impact:** see F-08.
- **Breaks:** CLAUDE.md §8 "README … updated if behavior or config changed".
- **Suggested fix:** see F-08.
- **Status:** duplicate of F-08 (track there)

## Passed checks

> **Evidence script:** `audit/scripts/a-req.ts` (copy into `backend/audit-tmp-a/` and run from `backend/` with `NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-a/a-req.ts`). It runs the real seed, then one fresh borrower through every PDF step against `createApp()` + an in-memory replica set. Run on 2026-10-10 (business date 2026-10-10 IST): **77 checks, 0 failures**. Lines below cite it as "a-req `[A0.x]`". Frontend unit tests: `cd frontend && npm test` → 7 files, 82 tests passed.

**PDF §1 What to Build**

- **A0.1:** Pass. Borrowers apply (`/apply` wizard → `POST /borrower/loans`) and staff move the loan `APPLIED → SANCTIONED → DISBURSED → CLOSED` (or `REJECTED`) through role-gated actions (`backend/src/utils/loan-state-machine.ts:29-34`); a-req ran the full lifecycle with the seeded staff accounts (status history `APPLIED>SANCTIONED>DISBURSED>CLOSED`); D8 did the same with a fresh borrower (36/36).
- **A0.2:** Pass. Multi-step wizard pages `frontend/src/app/(borrower)/apply/{profile,salary-slip,loan,status}/page.tsx` with a step indicator (`components/borrower/ApplicationSteps.tsx`) and resume logic (`lib/wizard.ts`, D5); the last step ends in the loan request (`components/borrower/LoanCalculator.tsx:128` `POST /borrower/loans`).
- **A0.3:** Pass. `/dashboard` with exactly the 4 PDF modules (`frontend/src/app/dashboard/{sales,sanction,disbursement,collection}`), plus ADMIN-only Overview and Staff; guarded by the role-aware proxy (`frontend/src/proxy.ts`, B10 page × role table) and backend `authenticate` + `requireRole` on every route (B1, B4 304/304 cells).
- **A0.4:** Pass. `frontend/package.json`: `next` 16.4.0 using the App Router (`frontend/src/app/`, no `pages/` dir), `typescript` 6.0.3 with `"strict": true` (`frontend/tsconfig.json:8`), `tailwindcss` 4.3.3 (`frontend/src/app/globals.css:1` `@import 'tailwindcss'`).
- **A0.5:** Pass. `backend/package.json`: Node `engines` 24.x (`.nvmrc` = 24), `express` 5.3.0, `typescript` 6.0.3, `"strict": true` (`backend/tsconfig.json:9`), ESM.
- **A0.6:** Pass. `mongoose` 9.11.1; models `backend/src/models/{user,borrower-profile,loan,payment}.model.ts`; MongoDB Atlas in production (README:69), mongodb-memory-server 8.0.30 in tests.
- **A0.7:** Pass. JWT via `jose` (`backend/src/utils/jwt.ts:23` `SignJWT`, `:36` `jwtVerify` pinned to HS256, 1-day expiry) in an httpOnly cookie; `bcrypt` 6.0.0 with `BCRYPT_COST = 10` (`backend/src/config/constants.ts:26`, used in `auth.service.ts:42,67`); a-req `[A0.10]` stored hash prefix `$2b$10$`. C1 confirms alg/expiry/cookie flags.
- **A1:** Pass (A0.4–A0.7): Next.js App Router + TypeScript + Tailwind; Node + Express + TypeScript; MongoDB + Mongoose; JWT + bcrypt. Extra libraries (zod, helmet, multer, file-type, pino, sonner) do not replace any required piece.

**PDF §2 Borrower Journey**

- **A0.8:** Pass. Wizard order PROFILE → SALARY_SLIP → LOAN → STATUS is computed server-side (`backend/src/modules/borrower/borrower.service.ts:21-30`) and enforced by the page redirects (`frontend/src/lib/wizard.ts:23-37`, D5); statuses `APPLIED, SANCTIONED, REJECTED, DISBURSED, CLOSED` (`loan-state-machine.ts:4`); a BRE failure keeps the borrower on step 2 (a-req `[A0.18]`); a-req `[A0.8]` history `APPLIED>SANCTIONED>DISBURSED>CLOSED`.
- **A0.9:** Pass. `POST /auth/signup` → 201 BORROWER + `lms_token` cookie, `POST /auth/login` → 200, wrong password → 401 "Invalid email or password" (a-req `[A0.9]`); pages `frontend/src/app/(auth)/{signup,login}/page.tsx` (`components/auth/SignupForm.tsx`, `LoginForm.tsx`).
- **A0.10:** Pass. bcrypt cost 10 (`auth.service.ts:42`), stored as `$2b$10$…` (a-req `[A0.10]`); `passwordHash` is `select: false` (`backend/src/models/user.model.ts:39`) and never returned (B8: 535 responses, 0 hashes).
- **A0.11:** Pass. `frontend/src/proxy.ts` runs `resolveRouteAccess` (`frontend/src/lib/route-access.ts:80-100`) on every page except `/api` and static assets: anonymous `/`, `/apply/*`, `/dashboard/*` → `/login?next=…` (B10 table, `route-access.test.ts` green); only `/login`, `/signup`, `/forbidden` and the 404 page are public. Live: G1 (`/dashboard` → 307 `/login?next=%2Fdashboard`). API backstop: anonymous → 401 on all 21 protected routes (B4; a-req `[A0.11/A0.52]`). Related open issue: B-08 (open redirect via `?next=` after a successful login), not a protection bypass.
- **A0.12:** Pass. `profileBodySchema` requires `fullName`, `pan`, `dateOfBirth`, `monthlySalary`, `employmentMode` ∈ `SALARIED | SELF_EMPLOYED | UNEMPLOYED` (`backend/src/modules/borrower/borrower.schema.ts:15-24`, `config/constants.ts:63`); the form has the same five fields with labels Salaried / Self-employed / Unemployed (`frontend/src/components/borrower/ProfileForm.tsx:122-166`, `lib/constants.ts:42-46`). a-req `[A0.12]`: missing fullName → 400, `STUDENT` → 400, `SELF_EMPLOYED` → eligible.
- **A0.13:** Pass. `evaluateEligibility` (`backend/src/utils/bre.ts:86-95`) runs in `saveProfile` (`borrower.service.ts:62`) and again in `applyForLoan` (`loans.service.ts:93`); the frontend preview never blocks (`ProfileForm.tsx:29`, DECISIONS #48). a-req `[A0.13/A0.18]`: 422 `BRE_FAILED` from the API with no UI involved.
- **A0.14:** Pass. Completed years, inclusive 23–50, IST calendar date (`bre.ts:41-61`). a-req `[A0.14]`: 22 (one day short of 23) → AGE, exactly 23 → eligible, 50 (day before 51st birthday) → eligible, exactly 51 → AGE. D1 adds Feb-29, future DOB, timezone and IST-midnight edges.
- **A0.15:** Pass. `monthlySalary < 2,500,000` paise fails (`bre.ts:63-67`, `constants.ts:69`). a-req `[A0.15]`: ₹24,999.99 → SALARY, ₹25,000 → eligible.
- **A0.16:** Pass. `PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/` after trim + upper-case (`constants.ts:70`, `bre.ts:69-73`). a-req `[A0.16]`: `ABCDE12345`, `ABCD1234EF` → PAN; `abcde1234f` → eligible (stored upper-case, D1).
- **A0.17:** Pass. `employmentMode === 'UNEMPLOYED'` fails (`bre.ts:75-79`); a-req `[A0.17]`.
- **A0.18:** Pass. A failed BRE saves the profile as not eligible and returns 422; the slip upload (`uploads.service.ts:41-48`) and apply (`loans.service.ts:82-100`) then refuse: a-req `[A0.18]` slip → 409 `PROFILE_INCOMPLETE`, apply → 409. Apply re-runs the BRE (D1 apply-time re-check → 422, no loan). UI: the slip and loan pages redirect back to details while not eligible (`lib/wizard.ts:28-34`). Edge case D-02 (stale stored result after a birthday) is Low and only over-blocks.
- **A0.19:** Pass. The API lists every failed rule with a plain message (a-req: "You must be at least 23 years old (you are 21).", "Monthly salary must be at least ₹25,000.", "PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter).", "Applicants who are unemployed are not eligible."); the UI shows them all in a `role="alert"` box (`frontend/src/components/borrower/BreFailureList.tsx:4-17`) on the details form (`ProfileForm.tsx:108-109,121`) and on apply (`LoanCalculator.tsx:133-134,193-199`), plus a live ✓/✗ preview per rule (`ProfileForm.tsx:30-52`). Upload errors are shown inline (`SalarySlipForm.tsx:16-20`).
- **A0.20:** Pass. `isEligible: failures.length === 0` over all four rules (`bre.ts:87-94`); a-req `[A0.20]` eligible only when all pass.
- **A0.21:** Pass (design question answered). PAN regex `^[A-Z]{5}[0-9]{4}[A-Z]$` with the reasoning (4th-character holder type deliberately not enforced) in `docs/DECISIONS.md:33` (#21); "server and client, server decides, because anyone can call the API" in README:116 and DECISIONS #21/#48; the client mirror is tested against the same JSON vectors (`backend/tests/fixtures`).
- **A0.22:** Pass. Extension + declared MIME + magic bytes must all be PDF/JPG/PNG (`backend/src/modules/uploads/salary-slip-file.ts:22-35`, `constants.ts:84-92`), multer cap 5 MB (`middleware/upload.ts:9-12`). a-req `[A0.22]`: PDF/JPG/PNG → 201, GIF and HTML-as-.pdf → 415, exactly 5,242,880 B → 201, +1 B → 413 `FILE_TOO_LARGE`. Client pre-check + `accept` (`SalarySlipForm.tsx:13-20`). C9 covers spoofing/polyglots.
- **A0.23:** Pass. Stored in GridFS bucket `salary_slips` with a generated name (`salary-slip-storage.ts`), linked to the profile (`uploads.service.ts:54-63`) and snapshotted onto the loan at apply (`loans.service.ts:107,127`). a-req `[A0.23]`: progress shows the PNG on the profile; after apply, SANCTION `GET /loans/:id/salary-slip` returns byte-identical content.
- **A0.24:** Pass. Two native range sliders: amount ₹50,000–₹5,00,000 step ₹1,000, tenure 30–365 step 1 day (`frontend/src/components/borrower/LoanCalculator.tsx:145-164`, `lib/constants.ts:58-64`). Server enforces the same ranges (`backend/src/modules/loans/loans.schema.ts:16-28`): a-req `[A0.24]` ₹49,999 / ₹5,00,001 / 29 / 366 days → 400; D2 boundaries ₹50,000/₹5,00,000 × 30/365 → 201.
- **A0.25:** Pass. `ANNUAL_INTEREST_RATE_PERCENT = 12` (`backend/src/config/constants.ts:76`; frontend `lib/constants.ts:56`), set by the server on apply (`loans.service.ts:105,114`); a client-sent rate → 400 (a-req `[A0.24]`); stored `annualInterestRate: 12` (a-req `[A0.25]`); the panel shows "12% p.a. (simple)" (`LoanCalculator.tsx:176-179`).
- **A0.26:** Pass. The quote is recomputed on every render from the slider state (`LoanCalculator.tsx:105-110`), so the "Your repayment" panel (amount, rate, tenure, interest, total; `:167-187`) updates on each slider `onChange`; a polite live region announces the total after a 500 ms pause (`:113-120,188-190`). Browser confirmation in A13.
- **A0.27:** Pass. `SI = round((P × R × T) / (365 × 100))` with P in paise, R = 12, T = days (`backend/src/utils/loan-math.ts:27-30`, mirrored `frontend/src/lib/loan-math.ts:19-22`). Only deviation: rounding to the nearest paisa, needed for integer-paise money and documented (README:120). a-req `[A0.27]`: ₹2,50,000 × 200 d → exact 1,643,835.616 paise → stored 1,643,836. D2: backend == frontend == exact BigInt reference on all 151,536 slider combinations.
- **A0.28:** Pass. `totalRepayment: principal + simpleInterest` (`loan-math.ts:30`); a-req `[A0.28]` 25,000,000 + 1,643,836 = 26,643,836; worked example ₹1,00,000 × 90 d → ₹1,02,958.90 (D2, README:122).
- **A0.29:** Pass. Apply creates the loan with `status: 'APPLIED'` (the pending state in the PDF flow diagram) and a first history entry `null → APPLIED` (`loans.service.ts:110-131`); a-req `[A0.29]` 201 APPLIED, second apply while active → 409 `ACTIVE_LOAN_EXISTS`.
- **A2:** Pass (A0.8–A0.29): sign up → details + server BRE → slip upload → sliders + live quote + apply works end to end through the API (a-req, D8) and the wizard pages exist and redirect in order (D5). UI walkthrough in a browser: see A13.
- **A3:** Pass (A0.11): every `/apply/*` and `/dashboard/*` page redirects anonymous visitors to `/login?next=…` (B10, G1 live) and every protected API route returns 401 (B4). Open related item: B-08.
- **A4:** Pass (A0.13–A0.21): all four rules with the PDF thresholds, evaluated on the server (profile save and again at apply), PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`, every failure listed in a `role="alert"` box.
- **A5:** Pass (A0.22–A0.23): PDF/JPG/PNG only (extension + MIME + magic bytes), 5 MB inclusive limit, GridFS storage linked to the profile and snapshotted onto the loan.
- **A6:** Pass (A0.24–A0.28): sliders ₹50K–₹5L and 30–365 days, fixed 12% p.a., SI = (P×R×T)/(365×100) rounded to the paisa, total = P + SI, panel recomputed on every slider change; the server recalculates and rejects client totals.
- **A7:** Pass (A0.29): `POST /borrower/loans` → 201 with status APPLIED; one active loan per borrower.

**PDF §3 Operations Dashboard**

- **A0.30:** Pass. Sidebar = `getAllowedModules(role)` (`frontend/src/lib/route-access.ts:43-48`, `components/dashboard/DashboardShell.tsx:18-23`): each executive sees one link, ADMIN all modules + Overview + Staff; other modules redirect to `/forbidden` (B10) and their APIs return 403 (B4). Live: G4 user run, every staff role lands on its own module and gets 403 / `/forbidden` elsewhere.
- **A0.31:** Pass. Four modules mapped to lifecycle stages: Sales = registered users with no loan, Sanction = APPLIED, Disbursement = SANCTIONED, Collection = DISBURSED (`backend/src/utils/loan-state-machine.ts:57-61` `MODULE_OWNED_STATUS`, `dashboard.service.ts:44-61`).
- **A0.32:** Pass (design answered). README:54-61 module table. Data: Sales → name, email, registered date, stage, BRE failure notes; Sanction → applicant (masked PAN `ABCDE****F`), BRE result, inline slip viewer, amounts, history (a-req detail keys); Disbursement → queue with amount, applicant, confirm dialog; Collection → outstanding, payment form, payment history. Actions: approve / reject + reason, mark disbursed, record payment.
- **A0.33:** Pass. `GET /leads` = BORROWER users with zero loans of any status (`backend/src/modules/dashboard/dashboard.service.ts:44-61`, DECISIONS #64). a-req `[A0.33]`: a fresh sign-up is listed, a borrower who applied is not. D6: stages and counts match the database.
- **A0.34:** Pass. Lead tracking by stage (Details pending / Not eligible / Slip pending / Ready to apply) with registration date and BRE notes, paginated (`frontend/src/components/dashboard/SalesModule.tsx:13-18,47-80`). The module is read-only by design; the PDF asks for none.
- **A0.35:** Pass. SANCTION `GET /loans` is forced to APPLIED (`loan-operations.service.ts:53-62`); a-req `[A0.35]` queue contains the new loan and only APPLIED; B6 out-of-module reads → 404.
- **A0.36:** Pass. `POST /loans/:id/approve` and `/reject` (SANCTION, ADMIN); reject needs a trimmed reason ≥ 5 chars (`backend/src/modules/loans/loans.schema.ts:43-52`), stored as `rejectionReason` + history note. a-req `[A0.36]`: no reason → 400, with reason → REJECTED and the borrower sees the reason. UI: Approve button + "Reject…" dialog with a required reason (`frontend/src/components/dashboard/SanctionModule.tsx:42-92,124-152`).
- **A0.37:** Pass (answered). APPLIED → SANCTIONED (approve) or APPLIED → REJECTED (reject + reason) (`loan-state-machine.ts:30-31`); any other state → 409 (D3 every action × status; B6).
- **A0.38:** Pass. DISBURSEMENT queue forced to SANCTIONED; a-req `[A0.38]`.
- **A0.39:** Pass. "Mark disbursed" + confirm dialog (`frontend/src/components/dashboard/DisbursementModule.tsx:14-70`) → `POST /loans/:id/disburse` (DISBURSEMENT, ADMIN) sets `disbursedAt`/`disbursedBy`; a-req `[A0.39/A0.40]`; SANCTION → 403 (a-req `[A0.48]`).
- **A0.40:** Pass (answered). SANCTIONED → DISBURSED (`loan-state-machine.ts:32`); the loan moves to the Collection queue (a-req `[A0.41]`).
- **A0.41:** Pass. COLLECTION queue forced to DISBURSED; a-req `[A0.41]`; after auto-close the loan leaves the queue (D4, by design only ADMIN sees CLOSED loans).
- **A0.42:** Pass. Collection detail has a payment form (UTR, amount ₹, date, "Fill outstanding amount") and history (`frontend/src/components/dashboard/CollectionModule.tsx:56-149,163-195`) → `POST /loans/:id/payments` (COLLECTION, ADMIN); a-req `[A0.42/A0.44]` → 201 with `recordedBy`.
- **A0.43:** Pass. `utr` has a unique index and is trimmed + upper-cased (`backend/src/models/payment.model.ts:18`, `payments.schema.ts:6`); duplicate-key → 409 `DUPLICATE_UTR` (`payments.service.ts:107-114`). a-req `[A0.43]`: same UTR in lower case → 409; D4: same UTR on another loan → 409 and the transaction rolls back; C8: whitespace/case variants and a two-loan race → one 201, one 409.
- **A0.44:** Pass. `utr`, `amount` (positive integer paise) and `paymentDate` (ISO date) are all required (`backend/src/modules/payments/payments.schema.ts:5-9`); a-req `[A0.44]` each missing → 400; stored and listed with the payment.
- **A0.45:** Pass. In the payment transaction, `totalPaid + amount === totalRepayment` sets CLOSED, `closedAt` and a history entry "Auto-closed: fully repaid" (`backend/src/modules/payments/payments.service.ts:23-44,63-106`); there is no manual close route (D3). a-req `[A0.45]`: paying the exact remainder → CLOSED, outstanding 0; a later payment → 409. D4: partials stay DISBURSED, concurrency never overpays.
- **A0.46:** Pass (answered). `totalPaid` on the loan is incremented atomically with the insert; `outstanding = totalRepayment − totalPaid` in every DTO (`loans.dto.ts:46,101`). Validations: positive integer amount (400), amount ≤ outstanding, date not in the future, not before disbursal (422, `backend/src/utils/payment-rules.ts:28-46`), loan must be DISBURSED (409). a-req `[A0.46]`: outstanding = total − paid after a partial; 0 → 400, overpay → 422, future date → 422.
- **A8:** Pass (A0.30–A0.42): Sales lists leads by stage; Sanction reviews applicant, BRE result and slip, approves or rejects with a required reason; Disbursement marks disbursed after a confirm; Collection records payments and sees outstanding/history. Each module is scoped to its status (B6) and role (B4).
- **A9:** Pass (A0.37, A0.40, A0.45): APPLIED → SANCTIONED | REJECTED, SANCTIONED → DISBURSED, DISBURSED → CLOSED (automatic only), matching the PDF diagram; every other action × status → 409 and nothing changes (D3), races resolve to one winner (B6, C8). Info only: wrong-state 409 names the current status (B-04/D-01).
- **A10:** Pass (A0.43–A0.46): unique UTR (case/whitespace-normalised), amount + date required, amount ≤ outstanding, date within disbursal..today, outstanding tracked as total − paid, auto-close exactly at paid == total inside one transaction. Edge case D-03 (re-seed deletes real payments whose UTR starts with SEED) is a seed issue, Low.

**PDF §4 Role-Based Access Control**

- **A0.47:** Pass. `ROLES = [ADMIN, SALES, SANCTION, DISBURSEMENT, COLLECTION, BORROWER]` (`backend/src/config/constants.ts:3-10`), `users.role` enum (`backend/src/models/user.model.ts:40`); a-req `[A0.47]` all 6 present after the seed; public sign-up always creates BORROWER and rejects `role` (a-req, B7).
- **A0.48:** Pass. B4 (304 cells, 0 mismatches): each executive gets 2xx only on its own routes and 403 elsewhere; a-req `[A0.48]`: SALES → 403 on `/loans`, SANCTION → 403 on `/leads` and on disburse. Executive reads are also limited to the module status (B6). Frontend: other modules → `/forbidden` (B10).
- **A0.49:** Pass. ADMIN is listed explicitly on every staff route (`require-role.ts:5-21`, no implicit bypass); a-req `[A0.49]`: ADMIN → 200 on `/leads`, `/loans?status=APPLIED|SANCTIONED|DISBURSED`, `/dashboard/summary`; B4 ADMIN column; B10 ADMIN allowed on every `/dashboard/*` page.
- **A0.50:** Pass. BORROWER → 403 on every dashboard API (a-req `[A0.50]`, B4) and `/dashboard/*` pages → `/forbidden` (B10); borrower routes are BORROWER-only (staff → 403, B4), and the borrower nav shows only "My application" / "My loans" (`components/borrower/BorrowerShell.tsx:13-16`).
- **A0.51:** Pass. Frontend: `proxy.ts` route guard (JWT role, HS256, fail-closed) + role-filtered sidebar; backend: `authenticate` (user reloaded from DB per request) + `requireRole` on all 21 protected routes (B1, B3). Open frontend issue in this area: B-08 (High, open redirect via `?next=`), which does not grant access.
- **A0.52:** Pass. The API rejects regardless of the UI: anonymous → 401, wrong role → 403 on every protected route (B4 matrix; `require-role.ts:16-18`); IDOR attempts → 403/404 (B5, 27/27).
- **A0.53:** Pass in code, fails on production data. `seedDemoData()` upserts `admin@`, `sales@`, `sanction@`, `disbursement@`, `collection@` and `borrower@lms.dev` (+ 11 demo borrowers) with `Password@123` (`backend/src/scripts/seed-demo.ts:8-23,31-40`), documented in README:15-35. a-req `[A0.53]`: all 6 role logins → 200 with the right role. D7: idempotent, CLI guarded. Production: `borrower@lms.dev` is COLLECTION (G-03) and the later demo accounts are missing (G-04); not re-reported here.
- **A0.54:** Pass (answered). Roles are a string enum on `users.role`; `authenticate` reloads the user each request (DECISIONS #28); `requireRole(...roles)` with no implicit ADMIN bypass (#29, `require-role.ts:5-21`); 401 `UNAUTHENTICATED` when not logged in, 403 `FORBIDDEN` for a wrong role, 404 for loans outside a module (#55) (`docs/API.md:15-30`, README:176).
- **A11:** Pass (A0.47–A0.54): six roles, each executive limited to its module, ADMIN everything, borrowers only the portal, enforced by the proxy + sidebar on the frontend and by `authenticate` + `requireRole` + status scoping on the backend (B4, B6, B10). Open in this area: B-08 (High), B-05 (Low).

**PDF §5 What You Need to Design Yourself**

- **A0.55:** Pass. The schemas, API and folder structure are the author's own and documented: README "Data model" (:130-150), "API" (:152-176), "Project structure" (:182-204); `docs/API.md`, `docs/ARCHITECTURE.md`, 78 decisions in `docs/DECISIONS.md`, original design in `PLAN.md`.
- **A0.56:** Pass. Data model with relationships (README:132-140 ER diagram), status transitions (README:88-103 state diagram), REST endpoints (README:156-174); applicant + slip snapshotted onto the loan (README:150).
- **A0.57:** Pass. Collections `users`, `borrower_profiles`, `loans`, `payments`, GridFS `salary_slips` with their relations (userId, borrowerId, loanId, recordedBy) and indexes (README:142-148; `backend/src/models/*.model.ts`).
- **A0.58:** Pass. Fields per collection in README:144-148 (money in integer paise, `statusHistory`, `breResult`, snapshots, `roleHistory`), matching the models (`backend/src/models/loan.model.ts`, `payment.model.ts`, `borrower-profile.model.ts`, `user.model.ts`).
- **A0.59:** Pass. 25 versioned routes under `/api/v1` with roles (README:156-174) and request/response shapes + error codes (`docs/API.md`); B2: code and docs agree route by route. Docs polish items: B-01 (API.md table broken by blank lines, Low), B-02 (unknown query params accepted on non-list routes, Low).
- **A0.60:** Pass. `middleware/authenticate.ts` (JWT cookie → user reloaded from DB) and `middleware/require-role.ts` (explicit role list), mounted per route as `authenticate → requireRole → [upload] → validate` (B3), roles for actions taken from `LOAN_ACTIONS[...].allowedRoles` so they live in one place.
- **A0.61:** Pass. One state machine (`backend/src/utils/loan-state-machine.ts:19-47`) lists states, transitions and the roles allowed to trigger each; AUTO_CLOSE has no role (payment transaction only); README:88-103.
- **A0.62:** Pass. Backend `routes → controller → service → model` per module (`backend/src/modules/<module>/`), `config/`, `middleware/`, `models/`, `utils/`, `scripts/`, `tests/{unit,integration,fixtures,helpers}`; frontend App Router groups `(auth)`, `(borrower)`, `dashboard`, with `components/`, `lib/`, `hooks/`, `types/` (README:182-204). Code-quality details are Lens F.

**PDF §6 Submission**

- **A0.63:** Partial. Repo (origin `https://github.com/YesudasZ/loan-management-system.git`) and credentials (README:15-35) are in place; the video is missing → A-01.
- **A0.66:** Pass. `backend/.env.example` (NODE_ENV, PORT, MONGODB_URI, JWT_SECRET, CORS_ORIGINS, TRUST_PROXY_HOPS, LOG_LEVEL) and `frontend/.env.example` (BACKEND_URL, JWT_SECRET), placeholders only, each variable commented; these are exactly the variables `backend/src/config/env.ts:25-38` and `frontend/next.config.ts:6-11` validate. Tracked in git (C11). Related: C-11 (the placeholder JWT secret passes validation, Low).
- **A0.67:** Fail → A-01 (High): no video yet; the planned script in `PROGRESS.md:273-277` covers BRE fail and pass, approve, disburse, payment, auto-close.
- **A0.68:** Fail → A-01: no YouTube/Drive link in README or docs.
- **A0.69:** Pass in the docs, fails on production data. README:15-35 lists one account per role (+ demo borrowers in every state) with `Password@123`; `docs/TEST_ACCOUNTS.md` adds 60 `@test.lms.dev` accounts. Locally every role logs in (a-req `[A0.53]`, D7). On production `borrower@lms.dev` is COLLECTION (G-03), the branch-5 demo accounts are missing (G-04) and the test accounts are absent (G-05): fix before submitting.
- **A0.70:** Info. Coverage per weighted area: E2E flow 35 % → a-req + D8 pass locally, production data G-03/G-04/G-05 and video A-01 open; code quality 20 % → Lens F (pending); BRE + loan math 15 % → D1/D2 pass; RBAC 15 % → B4/B10 pass, B-08 open; UI/UX 10 % → Lens E (pending); README + hygiene 5 % → A13 and Lens F.
- **A0.71:** Pass. The core flow works end to end locally (a-req, D8); the extras (staff management, removable test data, borrower loan history, admin overview) sit on top of it without changing the core rules (B/C/D found no core-flow defect).

**Evaluator journey and grouped items**

- **A13:** Pass, with README gaps A-03 (replica set not stated, Low) and A-04 (setup noise, Info). 2026-10-10, Node 24.18.0 / npm 11.16.0: `git clone https://github.com/YesudasZ/loan-management-system.git` anonymously (HEAD `1bc86bc`, = `origin/main`; README identical to this branch). Followed README "Local setup" in order: `npm install` (2 s), `npm install --prefix backend` (2.5 s), `npm install --prefix frontend` (3 s), `cp backend/.env.example backend/.env`, `cp frontend/.env.example frontend/.env.local`. Stand-ins: `MONGODB_URI` = an in-memory replica set on 27401 (`clone/backend/audit-memdb.mjs`), a throwaway 40-char `JWT_SECRET` in both files, `PORT=4401`, `CORS_ORIGINS=http://localhost:3401`, `BACKEND_URL=http://localhost:4401`. `npm run seed --prefix backend` → `{"accounts":17,"demoBorrowers":12,"msg":"Seed complete"}`; `-- --test-data` → `{"users":60,…,"loans":125,"payments":159}`. `npm run dev --prefix backend` → "API listening" port 4401; `npm run dev --prefix frontend -- --port 3401` → ready. Checks: `GET :4401/health` → 200 `{"status":"ok","database":"connected"}`; `GET :3401/login` → 200 "Log in · LMS"; anonymous `/` → 307 `/login`, `/dashboard` → 307 `/login?next=%2Fdashboard`; `POST :3401/api/v1/auth/login` (Origin `http://localhost:3401`, `admin@lms.dev`/`Password@123`) → 200 ADMIN + `lms_token` HttpOnly SameSite=Lax; then `/` → 307 `/dashboard`, `/api/v1/auth/me` → ADMIN; Origin `http://localhost:3000` → 403. Browser (local clone only): `borrower@lms.dev` → `/apply/profile`; invalid details showed the live ✗ preview for all 4 rules, and on submit the server's red alert listed all 4 messages; `lead.ready@lms.dev` → `/apply/loan`: keyboard End/Home on the sliders updated the panel at once (₹5,00,000 × 30 d → ₹4,931.51 / ₹5,04,931.51; × 365 d → ₹60,000 / ₹5,60,000; Home + → = ₹51,000), Apply → `/apply/status` "APPLIED … with our sanction team". README wrong/missing/ambiguous: replica-set requirement (A-03); install noise and generated `AGENTS.md` (A-04); stale test count (F-08; A-05 is its duplicate); otherwise every step worked as written (ports and DB were the only deliberate deviations). All processes stopped; clone deleted with the scratch folder.
- **A0.64:** Pass. The repo is public: an anonymous `git clone https://github.com/YesudasZ/loan-management-system.git` succeeded (A13).
- **A0.65:** Pass with gaps. README "Local setup" (`README.md:206-256`) took a fresh clone to a working app with no outside help (A13); gaps A-03 (replica set), A-04 (install noise), F-08 (stale README details, incl. the test count).
- **A12:** Partial. Seed: one account per role with known credentials, works locally (A0.53) but production data is wrong (G-03/G-04/G-05). README setup works (A13; A-03, A-04, F-08). `.env.example` in both apps (A0.66). Submission items: public repo ✓, live URL in README ✓ (health 200, G1), README ✓, credentials ✓ in docs, demo video ✗ (A-01), final tag stale (F-05).

## A14 · Compliance matrix (PDF sentence → evidence → result)

Evidence keys: "a-req" = `audit/scripts/a-req.ts` (77/77); B/C/D/G = other lenses' passed checks; A13 = fresh-clone run. Result: **Pass**, **Partial**, **Fail**, or **Info** (no requirement to meet).

| ID    | PDF requirement                                                     | Evidence                                                                                | Result  |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| A0.1  | §1 Borrowers apply; executives manage loans through their lifecycle | `loan-state-machine.ts:29-34`; a-req full lifecycle; D8                                 | Pass    |
| A0.2  | Borrower Portal: multi-step form ending with a loan request         | `app/(borrower)/apply/*`, `LoanCalculator.tsx:128`; D5                                  | Pass    |
| A0.3  | Operations Dashboard: 4 modules, role-guarded                       | `app/dashboard/{sales,sanction,disbursement,collection}`; B4, B10                       | Pass    |
| A0.4  | Frontend: Next.js (App Router) + TypeScript + Tailwind              | next 16.4.0 App Router, TS 6 strict, Tailwind 4.3.3                                     | Pass    |
| A0.5  | Backend: Node.js + Express + TypeScript                             | Node 24, express 5.3.0, TS 6 strict                                                     | Pass    |
| A0.6  | Database: MongoDB + Mongoose                                        | mongoose 9.11.1, `src/models/*`                                                         | Pass    |
| A0.7  | Auth: JWT + bcrypt                                                  | jose HS256 1 d (`jwt.ts:23,36`); bcrypt cost 10; C1                                     | Pass    |
| A0.8  | §2 Flow 1→2 (BRE)→3→4; APPLIED→SANCTIONED→DISBURSED→CLOSED          | `borrower.service.ts:21-30`, `wizard.ts`; a-req history                                 | Pass    |
| A0.9  | Sign up and login flow                                              | a-req `[A0.9]`; `(auth)/{signup,login}` pages; A13 login                                | Pass    |
| A0.10 | Passwords must be hashed                                            | `$2b$10$` stored; `select: false`; B8                                                   | Pass    |
| A0.11 | Protect all other pages                                             | `proxy.ts` + `route-access.ts:80-100`; B10; G1; A13 redirects (B-08 open, not a bypass) | Pass    |
| A0.12 | Collect name, PAN, DOB, salary, employment (3 modes)                | `borrower.schema.ts:15-24`; `ProfileForm.tsx:122-166`; a-req                            | Pass    |
| A0.13 | Run the BRE on the server                                           | `bre.ts:86-95` in `saveProfile` + `applyForLoan`; a-req 422                             | Pass    |
| A0.14 | Reject if age not 23–50                                             | `bre.ts:41-61`; a-req 22/23/50/51; D1                                                   | Pass    |
| A0.15 | Reject if salary < ₹25,000/month                                    | `bre.ts:63-67`; a-req ₹24,999.99 / ₹25,000                                              | Pass    |
| A0.16 | Reject if PAN format invalid                                        | `^[A-Z]{5}[0-9]{4}[A-Z]$` (`constants.ts:70`); a-req                                    | Pass    |
| A0.17 | Reject if Unemployed                                                | `bre.ts:75-79`; a-req                                                                   | Pass    |
| A0.18 | Any rule fails → block the application                              | slip 409, apply 409, apply re-checks BRE (a-req, D1); D-02 Low                          | Pass    |
| A0.19 | Show clear error                                                    | 4 plain messages in a `role="alert"` list (`BreFailureList.tsx`); A13 browser           | Pass    |
| A0.20 | All checks must pass                                                | `isEligible = failures.length === 0`; a-req                                             | Pass    |
| A0.21 | Think: PAN regex; BRE client/server/both, why                       | README:113-116, DECISIONS #21, #48                                                      | Pass    |
| A0.22 | Upload PDF/JPG/PNG, max 5 MB                                        | `salary-slip-file.ts:22-35`; a-req 201/415/413 at 5 MB ± 1 B; C9                        | Pass    |
| A0.23 | Store and link to the application                                   | GridFS + profile link + loan snapshot; a-req same bytes via loan                        | Pass    |
| A0.24 | Sliders: ₹50K–₹5L, 30–365 days                                      | `LoanCalculator.tsx:145-164`; `loans.schema.ts:16-28`; a-req; A13                       | Pass    |
| A0.25 | Interest fixed at 12% p.a.                                          | `constants.ts:76`; server-set; client rate → 400                                        | Pass    |
| A0.26 | Live calculation panel updates as sliders move                      | `LoanCalculator.tsx:105-110,167-187`; A13 browser                                       | Pass    |
| A0.27 | SI = (P × R × T) / (365 × 100), T in days                           | `loan-math.ts:27-30` (rounded to the paisa, documented); D2 151,536 combos              | Pass    |
| A0.28 | Total Repayment = P + SI                                            | `loan-math.ts:30`; a-req; D2 worked example                                             | Pass    |
| A0.29 | Apply → loan created with a pending status                          | APPLIED (`loans.service.ts:118`); a-req; A13 UI                                         | Pass    |
| A0.30 | §3 Each role sees only its module; Admin all                        | `getAllowedModules`; B10; B4; G4 live                                                   | Pass    |
| A0.31 | 4 modules tied to lifecycle stages                                  | `MODULE_OWNED_STATUS`; leads = no loan                                                  | Pass    |
| A0.32 | Think: data and actions per module                                  | README:54-61; module components                                                         | Pass    |
| A0.33 | Sales: registered users who haven't applied                         | `dashboard.service.ts:44-61`; a-req; D6                                                 | Pass    |
| A0.34 | Sales: lead tracking                                                | stages + notes + dates (`SalesModule.tsx`)                                              | Pass    |
| A0.35 | Sanction: applied loans                                             | queue = APPLIED; a-req; B6                                                              | Pass    |
| A0.36 | Approve or reject (with a reason)                                   | reason ≥ 5 chars, stored, shown to borrower; a-req; `SanctionModule.tsx`                | Pass    |
| A0.37 | Think: Sanction transitions                                         | APPLIED→SANCTIONED / REJECTED; D3                                                       | Pass    |
| A0.38 | Disbursement: sanctioned loans                                      | queue = SANCTIONED; a-req                                                               | Pass    |
| A0.39 | Mark as disbursed (funds released)                                  | confirm dialog → `/disburse`; a-req                                                     | Pass    |
| A0.40 | Think: next status                                                  | DISBURSED → Collection                                                                  | Pass    |
| A0.41 | Collection: active (disbursed) loans                                | queue = DISBURSED; a-req                                                                | Pass    |
| A0.42 | Record borrower payments                                            | `CollectionModule.tsx`; a-req 201                                                       | Pass    |
| A0.43 | UTR unique across all payments                                      | unique index, normalised; a-req 409; D4; C8                                             | Pass    |
| A0.44 | Amount and Date                                                     | required in schema; a-req 400 each                                                      | Pass    |
| A0.45 | Paid == total → auto-close                                          | transaction (`payments.service.ts:23-44`); a-req; D4                                    | Pass    |
| A0.46 | Think: outstanding tracking; amount validations                     | total − paid; >0, ≤ outstanding, date rules; a-req                                      | Pass    |
| A0.47 | §4 Six roles                                                        | `ROLES`; a-req all 6                                                                    | Pass    |
| A0.48 | Executive → only own module                                         | B4 304/304; a-req 403s; B10                                                             | Pass    |
| A0.49 | Admin → all modules                                                 | a-req 200 on every list; B4                                                             | Pass    |
| A0.50 | Borrower → portal only, not dashboard                               | a-req 403; B10 `/forbidden`                                                             | Pass    |
| A0.51 | Enforce on frontend AND backend                                     | proxy + sidebar; authenticate + requireRole (B-08 open)                                 | Pass    |
| A0.52 | API must reject unauthorized requests                               | 401/403 on all 21 protected routes (B4)                                                 | Pass    |
| A0.53 | Seed: one account per role, known credentials                       | `seed-demo.ts:8-40`; a-req 6 logins; D7; A13 seed. Production: G-03, G-04               | Partial |
| A0.54 | Design: role storage, middleware, HTTP status                       | DECISIONS #28, #29, #55; `docs/API.md:15-30`                                            | Pass    |
| A0.55 | §5 Schemas/API/folders designed by the author                       | README, `docs/API.md`, `docs/ARCHITECTURE.md`, DECISIONS                                | Pass    |
| A0.56 | Data model, relationships, transitions, endpoints                   | README:88-176 diagrams + tables                                                         | Pass    |
| A0.57 | Collections and relations                                           | users, borrower_profiles, loans, payments, GridFS                                       | Pass    |
| A0.58 | Fields per collection                                               | README:144-148 = models                                                                 | Pass    |
| A0.59 | REST API design incl. status codes                                  | 25 routes, error table; B2 (B-01, B-02 Low)                                             | Pass    |
| A0.60 | Auth and RBAC middleware structure                                  | `authenticate.ts`, `require-role.ts`; B3                                                | Pass    |
| A0.61 | Status transitions and who triggers each                            | `loan-state-machine.ts:19-47`                                                           | Pass    |
| A0.62 | Clean project folder structure                                      | README:182-204 (quality: Lens F)                                                        | Pass    |
| A0.63 | §6 Submit repo, video, credentials                                  | repo ✓, credentials ✓, video ✗ (A-01)                                                   | Partial |
| A0.64 | Repo public or evaluator added                                      | anonymous clone works (A13)                                                             | Pass    |
| A0.65 | README with setup instructions                                      | works from a fresh clone (A13); A-03, A-04, F-08                                        | Pass    |
| A0.66 | `.env.example`                                                      | both apps, placeholders, all validated vars (C-11 Low)                                  | Pass    |
| A0.67 | 3–5 min video of the full flow incl. BRE pass & fail                | not recorded (A-01)                                                                     | Fail    |
| A0.68 | Video on YouTube (unlisted) or Google Drive                         | no link (A-01)                                                                          | Fail    |
| A0.69 | Login credentials for all roles                                     | README:15-35, TEST_ACCOUNTS.md; production data G-03/G-04/G-05                          | Partial |
| A0.70 | Evaluation weights                                                  | coverage mapped to lenses                                                               | Info    |
| A0.71 | Core flow end to end first                                          | works locally (a-req, D8, A13)                                                          | Pass    |

**Totals (71 rows):** 65 Pass, 3 Partial (A0.53, A0.63, A0.69), 2 Fail (A0.67, A0.68: the video), 1 Info (A0.70). A0.65 counts as Pass; its README gaps are logged as Low/Info findings. The code meets every functional PDF requirement; what's left is the video (A-01) and the production data (G-03/G-04/G-05), plus the open High B-08 in the RBAC area.
