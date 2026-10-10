# Audit state (resumable checkpoint)

Branch `chore/pre-submission-audit`. Method and rules: `audit/README.md`. Findings: `audit/findings/<lens>.md`.

On resume: skip ticked items and lenses marked done, and continue from the first unticked item.

| Lens                                      | Status                              | Findings file                      |
| ----------------------------------------- | ----------------------------------- | ---------------------------------- |
| A: Requirements compliance                | pending                             | `audit/findings/A-requirements.md` |
| B: API and RBAC                           | in progress                         | `audit/findings/B-api-rbac.md`     |
| C: Security                               | pending                             | `audit/findings/C-security.md`     |
| D: Functional correctness                 | pending                             | `audit/findings/D-functional.md`   |
| E: Frontend responsive / a11y / stability | pending                             | `audit/findings/E-frontend.md`     |
| F: Code quality, repo, docs               | pending                             | `audit/findings/F-quality-docs.md` |
| G: Live smoke check (read-only)           | done (G4 results from user pending) | `audit/findings/G-live.md`         |
| Phase 2: verification and report          | pending                             | `audit/AUDIT_REPORT.md`            |

## Lens A: Requirements compliance

The first item expands the PDF into one checkbox per sentence, inserted below it.

- [ ] A0. Read LMS_Assignment.pdf and add one checkbox per requirement sentence below this item (grouped by PDF section)
- [ ] A1. Tech stack matches the PDF
- [ ] A2. Borrower flow steps 1–4 (sign up → details + BRE → slip upload → loan config + apply)
- [ ] A3. All other pages protected (not accessible without login)
- [ ] A4. BRE: all 4 rules and thresholds, server-side, PAN regex, clear error display
- [ ] A5. Upload: PDF/JPG/PNG, 5 MB limit, stored and linked to the application
- [ ] A6. Loan config: slider ranges, 12% p.a., exact SI formula, total repayment, live calculation
- [ ] A7. Apply creates the application with the pending (APPLIED) status
- [ ] A8. Each module's data and actions (Sales, Sanction, Disbursement, Collection), incl. reject with reason
- [ ] A9. Status transitions match the PDF
- [ ] A10. Payments: unique UTR, amount, date, validations, outstanding tracking, auto-close when paid == total
- [ ] A11. All 6 roles; RBAC on frontend AND backend
- [ ] A12. Seed with one account per role; README setup; .env.example; submission items
- [ ] A13. Evaluator journey: fresh clone → follow the README only → setup works (in-memory DB stand-in for Atlas)
- [ ] A14. Write the compliance matrix (requirement → evidence → pass/fail) into the findings file

## Lens B: API and RBAC (derived from code)

- [x] B1. Enumerate every registered Express route from source (method, path, middleware chain)
- [ ] B2. Compare with docs/API.md and the README (undocumented / missing / mismatched)
- [ ] B3. Confirm the middleware order: verifyOrigin → authenticate → requireRole → upload → validate
- [ ] B4. Route × identity matrix (anonymous, 6 roles, a second borrower): expected 401/403/404/2xx, run in-process
- [ ] B5. IDOR: borrower B vs A's profile, slip, loans, loan detail, payments, slip-by-loan
- [ ] B6. Executive scoping: reads outside the owned status → 404; wrong-state actions → 409
- [ ] B7. Staff management: ADMIN only, no self-demote, last admin, borrower with loans, signup can't create staff
- [ ] B8. No passwordHash (or bcrypt hash) in any response of any route
- [ ] B9. Error envelope on every error; status codes match the docs; pagination limits enforced
- [ ] B10. Frontend RBAC: route-access/proxy for every page × role, sidebar per role, ?next= open-redirect protection

## Lens C: Security

- [ ] C1. Auth: bcrypt cost, JWT alg pinned + expiry, cookie flags, logout clears the cookie
- [ ] C2. A changed-role or deleted user is rejected immediately; generic login errors + equal timing
- [ ] C3. Rate limiting and trust proxy (local only)
- [ ] C4. CSRF: the Origin check on every state-changing route (incl. uploads, staff management)
- [ ] C5. NoSQL injection payloads in body, query and params; sanitizeFilter + strictQuery; ObjectId validation
- [ ] C6. Regex/ReDoS in search inputs (staff search)
- [ ] C7. Mass assignment: every write schema is strict (role, status, totalPaid, totals)
- [ ] C8. Business-logic abuse (negative/zero/fractional paise, overpay, dates, double actions, concurrency, UTR case/whitespace, apply twice, profile edit during an active loan, tampered totals)
- [ ] C9. Uploads: spoofed magic bytes, wrong extension, 0-byte, >5 MB, polyglot, filename tricks; serving with auth + nosniff + CSP
- [ ] C10. Headers: helmet, CORS allowlist, no-store on the API, page security headers (local config); no stack traces in production-mode errors
- [ ] C11. Secrets: gitleaks full history; .env untracked; built frontend bundle has no JWT_SECRET/MONGODB_URI/keys; env validation
- [ ] C12. Logs: PAN masking, no passwords/tokens/cookies
- [ ] C13. npm audit (root, backend, frontend): list high/critical and runtime exploitability

## Lens D: Functional correctness (local)

- [ ] D1. BRE boundaries (exactly 23 today, the day before 23, 50y+364d, 51, Feb-29 DOB, future DOB, ₹24,999.99 vs ₹25,000, PAN lowercase/spaces, all 4 failing, IST midnight edge)
- [ ] D2. Loan math: min/max principal and tenure, rounding, the worked example, client == server for 20 random combinations
- [ ] D3. State machine: every action × every status
- [ ] D4. Payments and auto-close: exact payoff closes; partials; outstanding never negative; rollback on duplicate UTR
- [ ] D5. Wizard resume after logout at each step; "Apply again" after REJECTED / CLOSED
- [ ] D6. Sales lead stages; admin counts match the database
- [ ] D7. Seed idempotent; demo accounts log in; test-data add/remove leave the demo data intact
- [ ] D8. Full E2E flow from the video script, API-level, with a fresh borrower

## Lens E: Frontend (local)

- [ ] E1. Viewports 360/390/768/1024/1440 + phone landscape × every page: no horizontal page scroll
- [ ] E2. Tables → cards or contained scroll; the drawer works; dialogs fit with the keyboard; long text wraps
- [ ] E3. Touch targets ≥ 44px on phones; sliders usable by touch; no iOS input zoom (16px inputs)
- [ ] E4. Console clean on every page (production build); no hydration warnings
- [ ] E5. Error boundaries catch thrown errors; the backend-down state shows the banner / unavailable state
- [ ] E6. Double-click protection on every action; slow-network behaviour
- [ ] E7. Accessibility: labels, focus order, visible focus, skip link, aria-valuetext, live regions, contrast incl. badges

## Lens F: Code quality, repo, docs

- [ ] F1. No any / @ts-ignore / non-null ! / console.log / commented-out code / TODOs; files over ~200 lines
- [ ] F2. Layering (controllers without Mongoose, services without req/res); duplicated logic; naming conventions
- [ ] F3. Tests: all pass; coverage of BRE, math, state machine, payments, RBAC; no skipped tests
- [ ] F4. Repo: Conventional Commit history, branches, .gitignore, lockfiles, CI green, stray files (frontend/AGENTS.md)
- [ ] F5. Docs match the code: README setup, API.md, TEST_ACCOUNTS.md, DEPLOYMENT.md, SECURITY.md, DECISIONS.md, credentials, live URLs

## Lens G: Live smoke check (read-only, orchestrator only)

- [x] G1. /health, the login page, the / redirect (anonymous)
- [x] G2. Security headers on pages and the API; Cache-Control no-store on /api; no stack traces in error responses
- [x] G3. Cross-origin POST → 403 (no session, changes nothing)
- [x] G4. Logged-in checks (every demo account lands right, modules load, 403 for wrong roles, cookie flags): script prepared for the user to run (the orchestrator can't sign in on non-local sites)

## Phase 2: Verification and report

- [ ] P1. Verifier re-checks every Critical and High (Confirmed / False positive + reason); spot-checks Medium/Low
- [ ] P2. Write audit/AUDIT_REPORT.md (summary + go/no-go, PDF matrix, API × role matrix, findings, fix plan)
- [ ] P3. Commit, push, open the docs-only PR; stop for approval
