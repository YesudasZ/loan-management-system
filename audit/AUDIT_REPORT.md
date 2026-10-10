# Pre-submission audit report

Branch `chore/pre-submission-audit` · audited 2026-10-10 · source of requirements: `LMS_Assignment.pdf` (local) and `CLAUDE.md`.
Method, rules and severity scale: [`audit/README.md`](README.md). Checklist state: [`audit/STATE.md`](STATE.md). Full evidence: `audit/findings/*.md`; reproduction scripts: `audit/scripts/`.

## 1. Executive summary

| Severity | Findings | Unique (excluding duplicates) |
| -------- | -------- | ----------------------------- |
| Critical | 0        | 0                             |
| High     | 5        | 5                             |
| Medium   | 1        | 1                             |
| Low      | 27       | 22                            |
| Info     | 10       | 10                            |

**Verification:** an independent verifier re-checked every High, the Medium and 13 of the Lows/Infos. All were **confirmed**, with **no false positives** and no severity changes. Five duplicates are marked (B-06→C-09, B-07→C-10, D-01→B-04, A-02→F-05, A-05→F-08).

**The application code meets every functional requirement in the PDF.** Of 71 PDF sentences, 65 pass. The 3 "partial" rows are the production-data problems below. The 2 "fail" rows are the demo video, which isn't recorded yet. RBAC was checked in a 304-cell route × identity matrix with **0 mismatches**. IDOR, injection, mass assignment, upload spoofing, CSRF, the business rules, the state machine and the payment transaction all pass. So do the responsive layout (126/126 page × viewport checks, including phone landscape), the console and accessibility.

**Go / no-go for recording the video: NO-GO until 2 things are done, then GO.**

1. **Production data (G-03, G-04, G-05).** This is not a code bug. The database Render reads still holds the branch-4 demo seed:
   - only 2 loans, so the Disbursement and Collection queues are empty;
   - `demo.closed@lms.dev` and every `@test.lms.dev` account are missing;
   - `borrower@lms.dev` was changed to COLLECTION on the Staff page.

   The video would show empty modules and a broken borrower account. The fix is to seed the right database, about 20 minutes of your own steps.

2. **Open redirect B-08.** This is the only exploitable security issue. `/login?next=/.//evil.com` sends the user to an attacker's site after a successful login; it was confirmed in a real browser. It isn't visible in the video, but an evaluator testing security could find it. The fix is small and frontend-only (about 20 minutes plus tests).

The demo video itself (A-01) is the last submission step, after those two.

## 2. PDF compliance matrix

From Lens A ([A-requirements.md](findings/A-requirements.md), A14): one row per requirement sentence. "Partial" means the code and docs meet the requirement but production data currently doesn't (G-03, G-04, G-05). "Fail" is the not-yet-recorded video (A-01).

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

## 3. API × role matrix

From Lens B ([B-api-rbac.md](findings/B-api-rbac.md), B4): run in-process against the real app with fresh data per cell. ANON = no session; BORROWER2 = a second borrower (IDOR). **304 cells, 0 mismatches** against the expected 401 / 403 / 404 / 2xx.

| Route                                  | ANON | ADMIN | SALES | SANCTION | DISBURSEMENT | COLLECTION | BORROWER | BORROWER2 |
| -------------------------------------- | ---- | ----- | ----- | -------- | ------------ | ---------- | -------- | --------- |
| 1 GET /health                          | 200  | 200   | 200   | 200      | 200          | 200        | 200      | 200       |
| 2 POST /auth/signup                    | 201  | 201   | 201   | 201      | 201          | 201        | 201      | 201       |
| 3 POST /auth/login                     | 200  | 200   | 200   | 200      | 200          | 200        | 200      | 200       |
| 4 POST /auth/logout                    | 200  | 200   | 200   | 200      | 200          | 200        | 200      | 200       |
| 5 GET /auth/me                         | 401  | 200   | 200   | 200      | 200          | 200        | 200      | 200       |
| 6 GET /borrower/progress               | 401  | 403   | 403   | 403      | 403          | 403        | 200      | 200       |
| 7 PUT /borrower/profile                | 401  | 403   | 403   | 403      | 403          | 403        | 200      | 200       |
| 8 POST /borrower/salary-slip           | 401  | 403   | 403   | 403      | 403          | 403        | 201      | 201       |
| 9 GET /borrower/salary-slip            | 401  | 403   | 403   | 403      | 403          | 403        | 200      | 200       |
| 11 POST /borrower/loans                | 401  | 403   | 403   | 403      | 403          | 403        | 201      | 201       |
| 12 GET /borrower/loans                 | 401  | 403   | 403   | 403      | 403          | 403        | 200      | 200       |
| 13 GET /borrower/loans/:own            | 401  | 403   | 403   | 403      | 403          | 403        | 200      | 200       |
| 13a GET /borrower/loans/:otherBorrower | 401  | 403   | 403   | 403      | 403          | 403        | 404      | 404       |
| 13b GET /borrower/loans/:unknown       | 401  | 403   | 403   | 403      | 403          | 403        | 404      | 404       |
| 13c GET /borrower/loans/:malformed     | 401  | 403   | 403   | 403      | 403          | 403        | 400      | 400       |
| 10 GET /loans/:id/salary-slip          | 401  | 200   | 403   | 200      | 403          | 403        | 403      | 403       |
| 10a GET /loans/:unknown/salary-slip    | 401  | 404   | 403   | 404      | 403          | 403        | 403      | 403       |
| 14 GET /loans                          | 401  | 200   | 403   | 200      | 200          | 200        | 403      | 403       |
| 15 GET /loans/:id                      | 401  | 200   | 403   | 200      | 200          | 200        | 403      | 403       |
| 15a GET /loans/:outOfScope             | 401  | 404   | 403   | 404      | 404          | 404        | 403      | 403       |
| 15b GET /loans/:unknown                | 401  | 404   | 403   | 404      | 404          | 404        | 403      | 403       |
| 15c GET /loans/:malformed              | 401  | 400   | 403   | 400      | 400          | 400        | 403      | 403       |
| 16 POST /loans/:id/approve             | 401  | 200   | 403   | 200      | 403          | 403        | 403      | 403       |
| 16a POST /loans/:unknown/approve       | 401  | 404   | 403   | 404      | 403          | 403        | 403      | 403       |
| 17 POST /loans/:id/reject              | 401  | 200   | 403   | 200      | 403          | 403        | 403      | 403       |
| 17a POST /loans/:unknown/reject        | 401  | 404   | 403   | 404      | 403          | 403        | 403      | 403       |
| 18 POST /loans/:id/disburse            | 401  | 200   | 403   | 403      | 200          | 403        | 403      | 403       |
| 18a POST /loans/:unknown/disburse      | 401  | 404   | 403   | 403      | 404          | 403        | 403      | 403       |
| 19 GET /loans/:id/payments             | 401  | 200   | 403   | 403      | 403          | 200        | 403      | 403       |
| 19a GET /loans/:unknown/payments       | 401  | 404   | 403   | 403      | 403          | 404        | 403      | 403       |
| 20 POST /loans/:id/payments            | 401  | 201   | 403   | 403      | 403          | 201        | 403      | 403       |
| 20a POST /loans/:unknown/payments      | 401  | 404   | 403   | 403      | 403          | 404        | 403      | 403       |
| 21 GET /leads                          | 401  | 200   | 200   | 403      | 403          | 403        | 403      | 403       |
| 22 GET /dashboard/summary              | 401  | 200   | 403   | 403      | 403          | 403        | 403      | 403       |
| 23 GET /admin/users                    | 401  | 200   | 403   | 403      | 403          | 403        | 403      | 403       |
| 24 POST /admin/users                   | 401  | 201   | 403   | 403      | 403          | 403        | 403      | 403       |
| 25 PATCH /admin/users/:id/role         | 401  | 200   | 403   | 403      | 403          | 403        | 403      | 403       |
| 25a PATCH /admin/users/:unknown/role   | 401  | 404   | 403   | 403      | 403          | 403        | 403      | 403       |

Frontend RBAC (B10): the route guard's decision was checked for 25 page paths × 7 identities, and the sidebar for every role; all correct. The one weakness is the post-login `?next=` redirect (B-08).

## 4. Findings (by severity, then lens)

| ID                                 | Severity | Lens           | Title                                                                                                                                                                              | Verification (P1)                                  | Duplicate of |
| ---------------------------------- | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------ |
| [A-01](findings/A-requirements.md) | High     | A Requirements | The demo video (a required submission item) is not recorded or linked yet                                                                                                          | Confirmed                                          | –            |
| [B-08](findings/B-api-rbac.md)     | High     | B API/RBAC     | Open redirect after login: `?next=/.//evil.com` (or `/..//`, `/%2e//`) passes getSafeNextPath and becomes `//evil.com`                                                             | Confirmed                                          | –            |
| [G-03](findings/G-live.md)         | High     | G Live         | `borrower@lms.dev` has the COLLECTION role on production                                                                                                                           | Confirmed (production data; user-run smoke script) | –            |
| [G-04](findings/G-live.md)         | High     | G Live         | The production database Render reads is stale: seeded only up to the branch-4 demo data                                                                                            | Confirmed (production data; user-run smoke script) | –            |
| [G-05](findings/G-live.md)         | High     | G Live         | The `@test.lms.dev` test data is absent from the database Render reads                                                                                                             | Confirmed (production data; user-run smoke script) | –            |
| [C-04](findings/C-security.md)     | Medium   | C Security     | Rate-limit keying is still unmeasured on the deployed path: either a shared bucket (hops=1) or an XFF spoof bypass (hops=2)                                                        | Confirmed                                          | –            |
| [A-02](findings/A-requirements.md) | Low      | A Requirements | Duplicate of F-05: the `v1.0.0` tag and release are three merged PRs behind `main`                                                                                                 | not in the spot-check sample                       | F-05         |
| [A-03](findings/A-requirements.md) | Low      | A Requirements | README "Local setup" doesn't say the database must be a replica set; on a plain local `mongod` every payment fails with 500                                                        | not in the spot-check sample                       | –            |
| [A-05](findings/A-requirements.md) | Low      | A Requirements | Duplicate of F-08 (item 1): README says 78 frontend tests, `npm test` runs 82                                                                                                      | not in the spot-check sample                       | F-08         |
| [B-01](findings/B-api-rbac.md)     | Low      | B API/RBAC     | docs/API.md endpoint table is split by blank lines, so 13 of the 25 endpoint rows don't render as a table                                                                          | not in the spot-check sample                       | –            |
| [B-02](findings/B-api-rbac.md)     | Low      | B API/RBAC     | Unknown query parameters are silently accepted on every non-list route, contrary to docs/API.md and CLAUDE.md §6                                                                   | not in the spot-check sample                       | –            |
| [B-05](findings/B-api-rbac.md)     | Low      | B API/RBAC     | An admin can change their own role by sending their user id in upper-case hex (CANNOT_CHANGE_OWN_ROLE is a case-sensitive string compare)                                          | Confirmed                                          | –            |
| [B-06](findings/B-api-rbac.md)     | Low      | B API/RBAC     | Client errors from Express's router and the JSON parser (bad %-encoding in a path, unsupported Content-Encoding or charset, corrupt gzip) return 500 INTERNAL_ERROR instead of 4xx | Confirmed                                          | C-09         |
| [B-07](findings/B-api-rbac.md)     | Low      | B API/RBAC     | A database error during authentication is reported as 401 and deletes the session cookie, so a short database outage logs every active user out                                    | Confirmed                                          | C-10         |
| [C-03](findings/C-security.md)     | Low      | C Security     | The login "dummy hash" is built on first use, not at startup (first unknown-email login is ~2x slower)                                                                             | not in the spot-check sample                       | –            |
| [C-05](findings/C-security.md)     | Low      | C Security     | A NUL byte in the staff search returns 500 instead of 400                                                                                                                          | Confirmed                                          | –            |
| [C-06](findings/C-security.md)     | Low      | C Security     | The "details locked during an active loan" rule can be bypassed by racing a profile edit against apply                                                                             | Confirmed                                          | –            |
| [C-07](findings/C-security.md)     | Low      | C Security     | Malformed multipart uploads (no boundary, truncated body, NUL in a part header) return 500 instead of 400                                                                          | Confirmed                                          | –            |
| [C-09](findings/C-security.md)     | Low      | C Security     | Body-parser and URL-decoding client errors become 500 (anonymous, before any rate limit)                                                                                           | Confirmed                                          | –            |
| [C-10](findings/C-security.md)     | Low      | C Security     | A database outage logs every user out: `authenticate` treats any lookup error as "not logged in" and clears the cookie                                                             | Confirmed                                          | –            |
| [C-11](findings/C-security.md)     | Low      | C Security     | Env validation accepts the published `.env.example` JWT secret, other trivially weak secrets, and CORS entries that become the origin `"null"`                                     | Confirmed                                          | –            |
| [D-01](findings/D-functional.md)   | Low      | D Functional   | Loan actions reveal a loan's existence and current status outside the executive's module                                                                                           | not in the spot-check sample                       | B-04         |
| [D-02](findings/D-functional.md)   | Low      | D Functional   | A borrower who has since become eligible by age is sent to the salary-slip step, then refused                                                                                      | Confirmed                                          | –            |
| [D-03](findings/D-functional.md)   | Low      | D Functional   | Re-seeding deletes any payment whose UTR starts with "SEED", including real payments on non-demo loans                                                                             | Confirmed                                          | –            |
| [D-04](findings/D-functional.md)   | Low      | D Functional   | seedTestData isn't atomic: a real payment with a TEST-pattern UTR makes it fail halfway and leave inconsistent test loans                                                          | Confirmed                                          | –            |
| [F-01](findings/F-quality-docs.md) | Low      | F Quality/docs | `CollectionModule.tsx` is 247 lines (four components in one file); two other files sit just over 200                                                                               | not in the spot-check sample                       | –            |
| [F-02](findings/F-quality-docs.md) | Low      | F Quality/docs | A few small rules and paths are written twice although a helper or constant already exists                                                                                         | not in the spot-check sample                       | –            |
| [F-03](findings/F-quality-docs.md) | Low      | F Quality/docs | Test gaps: the safe-redirect tests miss dot-segment paths (B-08), and the route-guard token check and the demo seed have no tests                                                  | not in the spot-check sample                       | –            |
| [F-05](findings/F-quality-docs.md) | Low      | F Quality/docs | The `v1.0.0` tag and GitHub release are three merged PRs behind `main`                                                                                                             | not in the spot-check sample                       | –            |
| [F-06](findings/F-quality-docs.md) | Low      | F Quality/docs | Untracked, tool-generated `frontend/AGENTS.md` sits in the working tree                                                                                                            | not in the spot-check sample                       | –            |
| [F-08](findings/F-quality-docs.md) | Low      | F Quality/docs | README is stale in five places: frontend test count, module and docs lists, PR count, required checks                                                                              | not in the spot-check sample                       | –            |
| [F-09](findings/F-quality-docs.md) | Low      | F Quality/docs | docs/ contradict the code in several places (ARCHITECTURE, DECISIONS #31, DEPLOYMENT, UI, SECURITY) and PROGRESS shows branch 11 as "in review"                                    | Confirmed                                          | –            |
| [G-01](findings/G-live.md)         | Low      | G Live         | Pages send only a `frame-ancestors` CSP (no script/style policy)                                                                                                                   | not in the spot-check sample                       | –            |
| [A-04](findings/A-requirements.md) | Info     | A Requirements | A fresh-clone setup prints alarming but harmless output that the README doesn't mention                                                                                            | not in the spot-check sample                       | –            |
| [B-03](findings/B-api-rbac.md)     | Info     | B API/RBAC     | The global Origin check runs after the JSON body parser, and validate() checks the body before the params                                                                          | not in the spot-check sample                       | –            |
| [B-04](findings/B-api-rbac.md)     | Info     | B API/RBAC     | Wrong-state action errors tell an executive the current status of a loan they can't read                                                                                           | not in the spot-check sample                       | –            |
| [C-01](findings/C-security.md)     | Info     | C Security     | JWT verification does not require an `exp` claim                                                                                                                                   | not in the spot-check sample                       | –            |
| [C-02](findings/C-security.md)     | Info     | C Security     | Logout does not revoke the JWT (documented trade-off)                                                                                                                              | not in the spot-check sample                       | –            |
| [C-08](findings/C-security.md)     | Info     | C Security     | PDF content is not inspected: a PDF with a JavaScript action, or HTML after the `%PDF-` header, is accepted                                                                        | not in the spot-check sample                       | –            |
| [C-12](findings/C-security.md)     | Info     | C Security     | Five dev-only "high" npm advisories in the frontend, all one `braces` DoS advisory under eslint-config-next (not reachable at runtime)                                             | not in the spot-check sample                       | –            |
| [F-04](findings/F-quality-docs.md) | Info     | F Quality/docs | `npm run typecheck` fails on a machine without `frontend/.env.local`: `next typegen` loads `next.config.ts`, which validates the env                                               | not in the spot-check sample                       | –            |
| [F-07](findings/F-quality-docs.md) | Info     | F Quality/docs | Local repo has 7 stale branches and 13 stale remote-tracking refs; one squash title uses `style` for a PR that adds behaviour                                                      | not in the spot-check sample                       | –            |
| [G-02](findings/G-live.md)         | Info     | G Live         | A CORS preflight from a foreign origin still sends `Access-Control-Allow-Credentials: true`                                                                                        | not in the spot-check sample                       | –            |

Lens E (frontend responsive, accessibility, stability) found **no new issues**: every check passed (see [E-frontend.md](findings/E-frontend.md)).

## 5. Proposed fix plan

Each group is one small branch with a regression test for every code fix, the full Definition of Done, a PR, green CI and a squash-merge (CLAUDE.md §4–§8). Times are estimates. Deadline: Sunday 16:00 IST.

### Required before recording the video

| #   | Branch / action                           | Fixes                         | Effort  | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Production data** (your steps, no code) | G-03, G-04, G-05              | ~20 min | (1) Compare Render's `MONGODB_URI` database name with the one you seed (the read-only URI-inspection command). (2) Run the demo seed and the test-data seed against **the database Render reads**, or seed `lms_prod` and point Render at it. This also resets `borrower@lms.dev` to BORROWER. (3) Re-run `bash audit/scripts/live-smoke.sh`: every line should PASS. |
| R2  | `fix/audit-open-redirect`                 | B-08 (+ F-03's missing tests) | ~20 min | `getSafeNextPath` validates the normalised path it returns (reject a leading `//` or any backslash after parsing). Add the dot-segment payloads (`/.//`, `/..//`, `/%2e//`, `/%2F/`) to `route-access.test.ts`. Frontend-only; Vercel redeploys.                                                                                                                      |
| R3  | Record the video (you)                    | A-01                          | ~30 min | After R1 and R2: follow the script, upload it unlisted, add the link to the README and the release.                                                                                                                                                                                                                                                                   |

### Recommended (small, low-risk; before or right after the video)

| #   | Branch                      | Fixes                                                                                                                                                                                  | Effort                    |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| S1  | `fix/audit-admin-self-role` | B-05: compare ObjectIds (`user._id.equals(admin.id)`), not strings                                                                                                                     | ~10 min                   |
| S2  | `fix/audit-client-errors`   | C-09 (and B-06): map 4xx http-errors to 400/413/415; C-07: multipart parse errors → 400; C-05: NUL in the staff search → 400                                                           | ~30 min                   |
| S3  | `fix/audit-auth-db-outage`  | C-10 (and B-07): only token errors → 401; database errors → 500 and the cookie is kept                                                                                                 | ~15 min                   |
| S4  | `docs/audit-accuracy`       | B-01 (API.md table), F-08 (README counts and lists), F-09 (ARCHITECTURE, DECISIONS #31, DEPLOYMENT, UI, SECURITY, PROGRESS), A-03 (replica set needed), A-04, F-04, the D-03 doc lines | ~30 min                   |
| S5  | `chore/audit-hygiene`       | F-06 (`agentRules: false` in `next.config.ts`, delete `AGENTS.md`), F-07 (prune local branches)                                                                                        | ~10 min                   |
| S6  | Release                     | F-05 (and A-02): tag the final `main` (`v1.1.0`) with notes and the video link                                                                                                         | ~10 min, after the merges |

### Nice-to-have / accept as documented risk (after submission)

| Finding                            | Suggestion                                                                                                                                                                                                     | Effort                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| C-04 (Medium)                      | **Measure `TRUST_PROXY_HOPS`** from a Render log line (DEPLOYMENT.md checkpoint B step 5) and set it. Optionally have only Vercel set a secret header. Otherwise accept and keep it documented in SECURITY.md. | 10 min (measure) / 45 min (header)    |
| C-11                               | Reject placeholder or weak `JWT_SECRET` values and non-http CORS entries in the env schemas                                                                                                                    | ~10 min                               |
| D-03, D-04                         | Seed robustness: delete only demo-loan payments; insert the test data in one transaction                                                                                                                       | ~20 min                               |
| D-02                               | Re-evaluate the BRE in `uploadSalarySlip` instead of reading the stored result                                                                                                                                 | ~15 min                               |
| C-06                               | Make the "details locked during an active loan" rule atomic (a transaction or version check)                                                                                                                   | ~30 min, or accept: a narrow race     |
| B-02                               | Strict (empty) query schema on routes that take no query parameters                                                                                                                                            | ~20 min                               |
| B-04 / D-01                        | Generic 404/409 message for executives outside the owned status (recorded decision #55)                                                                                                                        | ~15 min, or accept                    |
| C-01, C-03                         | `requiredClaims: ['exp']`; build the dummy hash at startup                                                                                                                                                     | ~10 min                               |
| F-01, F-02                         | Split `CollectionModule.tsx`; reuse the existing helpers                                                                                                                                                       | ~20 min                               |
| G-01                               | A nonce-based page CSP                                                                                                                                                                                         | ~1 h; risky right before the deadline |
| B-03, C-02, C-08, C-12, G-02, F-07 | No action needed (Info)                                                                                                                                                                                        | –                                     |

**Suggested order with the deadline in mind:** R1 → R2 → (S1–S5 if time allows) → R3 (video) → S6 (release).
