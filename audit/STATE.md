# Audit state (resumable checkpoint)

Branch `chore/pre-submission-audit`. Method and rules: `audit/README.md`. Findings: `audit/findings/<lens>.md`.

On resume: skip ticked items and lenses marked done, and continue from the first unticked item.

| Lens                                      | Status  | Findings file                      |
| ----------------------------------------- | ------- | ---------------------------------- |
| A: Requirements compliance                | pending | `audit/findings/A-requirements.md` |
| B: API and RBAC                           | done    | `audit/findings/B-api-rbac.md`     |
| C: Security                               | done    | `audit/findings/C-security.md`     |
| D: Functional correctness                 | done    | `audit/findings/D-functional.md`   |
| E: Frontend responsive / a11y / stability | done | `audit/findings/E-frontend.md`     |
| F: Code quality, repo, docs               | pending | `audit/findings/F-quality-docs.md` |
| G: Live smoke check (read-only)           | done    | `audit/findings/G-live.md`         |
| Phase 2: verification and report          | pending | `audit/AUDIT_REPORT.md`            |

## Lens A: Requirements compliance

The first item expands the PDF into one checkbox per sentence, inserted below it.

- [x] A0. Read LMS_Assignment.pdf and add one checkbox per requirement sentence below this item (grouped by PDF section)
  - PDF §1 What to Build
    - [ ] A0.1 Build an LMS: borrowers apply for loans; internal executives manage those loans through their lifecycle
    - [ ] A0.2 Borrower Portal: a multi-step application form ending with a loan request
    - [ ] A0.3 Operations Dashboard: internal panel with 4 modules for different teams, guarded by role-based access
    - [ ] A0.4 Frontend: Next.js (App Router) + TypeScript + Tailwind CSS
    - [ ] A0.5 Backend: Node.js + Express.js + TypeScript
    - [ ] A0.6 Database: MongoDB + Mongoose
    - [ ] A0.7 Auth: JWT + bcrypt
  - PDF §2 Borrower Journey
    - [ ] A0.8 Flow: 1 Sign Up/Login → 2 Personal Details (BRE reject?) → 3 Upload Salary Slip → 4 Loan Config & Apply; statuses APPLIED → SANCTIONED → DISBURSED → CLOSED
    - [ ] A0.9 Step 1: sign up and login flow
    - [ ] A0.10 Step 1: passwords must be hashed
    - [ ] A0.11 Step 1: protect all other pages
    - [ ] A0.12 Step 2: collect Full Name, PAN, Date of Birth, Monthly Salary, Employment Mode (Salaried / Self-Employed / Unemployed)
    - [ ] A0.13 Step 2: run a Business Rule Engine (BRE) on the server
    - [ ] A0.14 BRE: reject if age is not between 23 and 50
    - [ ] A0.15 BRE: reject if salary is below ₹25,000 / month
    - [ ] A0.16 BRE: reject if PAN does not match the valid PAN format
    - [ ] A0.17 BRE: reject if the applicant is Unemployed
    - [ ] A0.18 If any rule fails → block the application
    - [ ] A0.19 Show clear error
    - [ ] A0.20 All checks must pass
    - [ ] A0.21 Think about: the correct PAN regex; BRE on client, server or both, and why
    - [ ] A0.22 Step 3: file upload accepts PDF/JPG/PNG, max 5 MB
    - [ ] A0.23 Step 3: store the file and link it to the application
    - [ ] A0.24 Step 4: user picks Loan Amount (₹50K – ₹5L) and Tenure (30 – 365 days) using sliders
    - [ ] A0.25 Step 4: interest rate fixed at 12% p.a.
    - [ ] A0.26 Step 4: live calculation panel that updates as the sliders move
    - [ ] A0.27 Step 4: Simple Interest SI = (P × R × T) / (365 × 100), T = tenure in days
    - [ ] A0.28 Step 4: Total Repayment = P + SI
    - [ ] A0.29 Step 4: on clicking "Apply" → loan is created with a pending status
  - PDF §3 Operations Dashboard
    - [ ] A0.30 Each role sees ONLY their module; Admin sees ALL (Sales → Sanction → Disbursement → Collection)
    - [ ] A0.31 The dashboard has 4 modules, each tied to a stage in the loan lifecycle
    - [ ] A0.32 Think about what data each module needs to show and what actions are available
    - [ ] A0.33 Sales: handles the pre-application stage (users who've registered but haven't applied yet)
    - [ ] A0.34 Sales: think of it as lead tracking
    - [ ] A0.35 Sanction: handles applied loans
    - [ ] A0.36 Sanction: the executive reviews and either approves or rejects (with a reason)
    - [ ] A0.37 Sanction: figure out the status transitions that happen here
    - [ ] A0.38 Disbursement: handles approved/sanctioned loans
    - [ ] A0.39 Disbursement: the executive marks a loan as disbursed (funds released)
    - [ ] A0.40 Disbursement: decide what the next status should be
    - [ ] A0.41 Collection: handles active (disbursed) loans
    - [ ] A0.42 Collection: the executive records borrower payments
    - [ ] A0.43 Collection: each payment needs a UTR Number, unique across all payments (no duplicates)
    - [ ] A0.44 Collection: each payment needs an Amount and a Date
    - [ ] A0.45 Collection: when total amount paid equals total repayment → loan auto-closes
    - [ ] A0.46 Think about: how to track the outstanding balance; what validations on the payment amount
  - PDF §4 Role-Based Access Control
    - [ ] A0.47 Roles: Admin, Sales, Sanction, Disbursement, Collection, Borrower
    - [ ] A0.48 Each executive role can access only their own module on the dashboard
    - [ ] A0.49 Admin can access all modules
    - [ ] A0.50 Borrowers can only access the application portal, not the dashboard
    - [ ] A0.51 Enforce access control on both frontend AND backend
    - [ ] A0.52 Hiding a menu item is not enough: the API must also reject unauthorized requests
    - [ ] A0.53 Seed script pre-creates one account per role with known credentials, so the evaluator can log in and test each role immediately
    - [ ] A0.54 Design decisions: how roles are stored, how middleware checks them, what HTTP status for unauthorized access
  - PDF §5 What You Need to Design Yourself
    - [ ] A0.55 Schemas, API contracts and folder structure are not given; designing them is part of the evaluation
    - [ ] A0.56 Think through the data model, relationships, status transitions and REST endpoints
    - [ ] A0.57 Decide what MongoDB collections are needed and how they relate
    - [ ] A0.58 Decide what fields each collection needs
    - [ ] A0.59 Full REST API design: routes, methods, request/response shapes, status codes
    - [ ] A0.60 How authentication middleware and RBAC middleware are structured
    - [ ] A0.61 How loan status transitions work (valid states; who can trigger each transition)
    - [ ] A0.62 Project folder structure: clean and logical
  - PDF §6 Submission
    - [ ] A0.63 Submit three things: GitHub repo, working video, login credentials
    - [ ] A0.64 GitHub repo: public or private (add the evaluator)
    - [ ] A0.65 Include a README with setup instructions
    - [ ] A0.66 Include a .env.example
    - [ ] A0.67 Working video (3–5 min): borrower applies (BRE pass & fail) → executive approves → disburses → payment recorded → loan closes
    - [ ] A0.68 Video uploaded to YouTube (unlisted) or Google Drive
    - [ ] A0.69 Login credentials for all roles, so the evaluator can test without creating accounts
    - [ ] A0.70 Evaluation focus weights (E2E flow 35%, code quality + TS 20%, BRE + loan math 15%, RBAC FE+BE 15%, UI/UX + responsiveness 10%, README + repo hygiene 5%)
    - [ ] A0.71 Get the core flow working end-to-end first; a complete basic system beats a half-built one with extras
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
- [x] B2. Compare with docs/API.md and the README (undocumented / missing / mismatched)
- [x] B3. Confirm the middleware order: verifyOrigin → authenticate → requireRole → upload → validate
- [x] B4. Route × identity matrix (anonymous, 6 roles, a second borrower): expected 401/403/404/2xx, run in-process
- [x] B5. IDOR: borrower B vs A's profile, slip, loans, loan detail, payments, slip-by-loan
- [x] B6. Executive scoping: reads outside the owned status → 404; wrong-state actions → 409
- [x] B7. Staff management: ADMIN only, no self-demote, last admin, borrower with loans, signup can't create staff
- [x] B8. No passwordHash (or bcrypt hash) in any response of any route
- [x] B9. Error envelope on every error; status codes match the docs; pagination limits enforced
- [x] B10. Frontend RBAC: route-access/proxy for every page × role, sidebar per role, ?next= open-redirect protection

## Lens C: Security

- [x] C1. Auth: bcrypt cost, JWT alg pinned + expiry, cookie flags, logout clears the cookie
- [x] C2. A changed-role or deleted user is rejected immediately; generic login errors + equal timing
- [x] C3. Rate limiting and trust proxy (local only)
- [x] C4. CSRF: the Origin check on every state-changing route (incl. uploads, staff management)
- [x] C5. NoSQL injection payloads in body, query and params; sanitizeFilter + strictQuery; ObjectId validation
- [x] C6. Regex/ReDoS in search inputs (staff search)
- [x] C7. Mass assignment: every write schema is strict (role, status, totalPaid, totals)
- [x] C8. Business-logic abuse (negative/zero/fractional paise, overpay, dates, double actions, concurrency, UTR case/whitespace, apply twice, profile edit during an active loan, tampered totals)
- [x] C9. Uploads: spoofed magic bytes, wrong extension, 0-byte, >5 MB, polyglot, filename tricks; serving with auth + nosniff + CSP
- [x] C10. Headers: helmet, CORS allowlist, no-store on the API, page security headers (local config); no stack traces in production-mode errors
- [x] C11. Secrets: gitleaks full history; .env untracked; built frontend bundle has no JWT_SECRET/MONGODB_URI/keys; env validation
- [x] C12. Logs: PAN masking, no passwords/tokens/cookies
- [x] C13. npm audit (root, backend, frontend): list high/critical and runtime exploitability

## Lens D: Functional correctness (local)

- [x] D1. BRE boundaries (exactly 23 today, the day before 23, 50y+364d, 51, Feb-29 DOB, future DOB, ₹24,999.99 vs ₹25,000, PAN lowercase/spaces, all 4 failing, IST midnight edge)
- [x] D2. Loan math: min/max principal and tenure, rounding, the worked example, client == server for 20 random combinations
- [x] D3. State machine: every action × every status
- [x] D4. Payments and auto-close: exact payoff closes; partials; outstanding never negative; rollback on duplicate UTR
- [x] D5. Wizard resume after logout at each step; "Apply again" after REJECTED / CLOSED
- [x] D6. Sales lead stages; admin counts match the database
- [x] D7. Seed idempotent; demo accounts log in; test-data add/remove leave the demo data intact
- [x] D8. Full E2E flow from the video script, API-level, with a fresh borrower

## Lens E: Frontend (local)

- [x] E1. Viewports 360/390/768/1024/1440 + phone landscape × every page: no horizontal page scroll
- [x] E2. Tables → cards or contained scroll; the drawer works; dialogs fit with the keyboard; long text wraps
- [x] E3. Touch targets ≥ 44px on phones; sliders usable by touch; no iOS input zoom (16px inputs)
- [x] E4. Console clean on every page (production build); no hydration warnings
- [x] E5. Error boundaries catch thrown errors; the backend-down state shows the banner / unavailable state
- [x] E6. Double-click protection on every action; slow-network behaviour
- [x] E7. Accessibility: labels, focus order, visible focus, skip link, aria-valuetext, live regions, contrast incl. badges

## Lens F: Code quality, repo, docs

- [x] F1. No any / @ts-ignore / non-null ! / console.log / commented-out code / TODOs; files over ~200 lines
- [x] F2. Layering (controllers without Mongoose, services without req/res); duplicated logic; naming conventions
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
