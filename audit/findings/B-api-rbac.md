# Findings: Lens B: API and RBAC

Format and severity scale: `audit/README.md`.

## Findings

### B-01 · Low · docs/API.md endpoint table is split by blank lines, so 13 of the 25 endpoint rows don't render as a table
- **Lens:** B (API and RBAC)
- **Evidence:** `docs/API.md:50` and `docs/API.md:59` are empty lines inside the endpoint table. In GitHub-flavoured Markdown a blank line ends a table, and the following `| GET | /api/v1/loans | … |` lines have no header/delimiter row, so rows `docs/API.md:51-58` (all `/loans/*` and payment routes) and `:60-64` (leads, dashboard summary, the three `/admin/users` routes) render as plain paragraphs full of pipes.
- **Steps to reproduce:** `awk 'NR>=48 && NR<=61 {print NR": ["substr($0,1,50)"]"}' docs/API.md` shows lines 50 and 59 are empty; open `docs/API.md` on GitHub and scroll to the endpoints.
- **Impact:** The "canonical API reference" is hard to read for the evaluator exactly where the staff and admin routes are described.
- **Breaks:** none (docs polish).
- **Suggested fix:** Delete the two blank lines (and re-run prettier so the new rows are padded like the first 12).
- **Status:** open

### B-02 · Low · Unknown query parameters are silently accepted on every non-list route, contrary to docs/API.md and CLAUDE.md §6
- **Lens:** B (API and RBAC)
- **Evidence:** `docs/API.md:11` says "Bodies, params and queries are validated with strict schemas: unknown fields → 400"; CLAUDE.md §6 says "Use zod `.strict()` schemas on every body, query and param". `middleware/validate.ts:4-7` only takes `body` and `params`; only the 5 list controllers parse `req.query` (`loans.controller.ts:22,32`, `payments.controller.ts:18`, `dashboard.controller.ts:8`, `admin.controller.ts:14`). Run in-process (`audit/scripts/b2-query.ts`) with `?unknownField=1&role=ADMIN`:
  `GET /health` 200 · `GET /api/v1/auth/me` 200 · `GET /borrower/progress` 200 · `GET /borrower/salary-slip` 200 · `GET /borrower/loans/:id` 200 · `GET /loans/:id` 200 · `GET /loans/:id/salary-slip` 200 · `GET /dashboard/summary` 200, while the 5 list routes return 400 `VALIDATION_ERROR`. The same holds for the POST/PUT/PATCH routes (no query schema at all).
- **Steps to reproduce:** as ADMIN, `GET /api/v1/dashboard/summary?anything=1` → 200.
- **Impact:** None exploitable today: these handlers never read `req.query`. It's a gap between the documented contract and the code, and a future handler that starts reading `req.query` would get it unvalidated.
- **Breaks:** CLAUDE.md §6 "zod `.strict()` schemas on every body, query and param"; `docs/API.md:11`.
- **Suggested fix:** Add `query?: ZodType` to `validate()` (defining an own `query` property as is already done for `params`) and mount `validate({ query: emptyQuerySchema })` (`z.strictObject({})`) on the non-list routes; or narrow the doc sentence to "list queries".
- **Status:** open

### B-03 · Info · The global Origin check runs after the JSON body parser, and validate() checks the body before the params
- **Lens:** B (API and RBAC)
- **Evidence:** `backend/src/app.ts:56-58` mounts `express.json()` and `cookieParser()` before `verifyOrigin()`; PLAN.md:285 lists `verifyOrigin` first. In-process (`audit/scripts/b3-order.ts`): `POST /api/v1/auth/login` with `Origin: https://evil.com` and body `{bad` → **400 `INVALID_JSON`** (not 403 `INVALID_ORIGIN`); the same for SANCTION `POST /loans/:id/approve`. With valid JSON the cross-origin request is 403 `INVALID_ORIGIN` before `authenticate` (anonymous and logged-in alike), so nothing is ever executed. Separately, `middleware/validate.ts:24-33` parses `body` before `params`: ADMIN `POST /api/v1/loans/not-an-id/approve` with `{ "evil": true }` → 400 whose `details` list only the body error (`{"field":"","message":"Unrecognized key: \"evil\""}`), not the invalid id.
- **Steps to reproduce:** run `audit/scripts/b3-order.ts` (copy into `backend/audit-tmp-b/` first, see the header comment there).
- **Impact:** None in practice: a cross-origin attacker can only make the server parse ≤ 100 kb of JSON and learn nothing; the error details are just less complete when both id and body are wrong.
- **Breaks:** none (deviation from the order written in PLAN.md:285 only).
- **Suggested fix:** Optional: move `app.use(verifyOrigin(...))` above `express.json()`; validate params before body (or collect both).
- **Status:** open

### B-04 · Info · Wrong-state action errors tell an executive the current status of a loan they can't read
- **Lens:** B (API and RBAC)
- **Evidence:** `loan-operations.service.ts:140-145` falls back to `getNextStatus(existing.status, action)`, whose message names the status (`loan-state-machine.ts:40-44`). In-process (`audit/scripts/b6-scoping.ts`): DISBURSEMENT `GET /api/v1/loans/<closedLoanId>` → 404 `Loan not found`, but `POST /api/v1/loans/<closedLoanId>/disburse` → 409 `"Cannot disburse a loan that is CLOSED"` (likewise `…that is APPLIED/REJECTED/DISBURSED`; SANCTION approve/reject → `…that is SANCTIONED/DISBURSED/CLOSED`).
- **Steps to reproduce:** as DISBURSEMENT, POST `/disburse` on any non-SANCTIONED loan id.
- **Impact:** Staff who already pass the role check can learn that an id exists and its status, which the read scoping hides. No data beyond the status leaks, and the ids are random ObjectIds. This trade-off is a recorded decision (PLAN.md:288, `docs/API.md:66`), following the brief's 409 requirement.
- **Breaks:** none (accepted deviation from CLAUDE.md §6 "Never leak whether a resource exists to unauthorized users").
- **Suggested fix:** None required. If wanted: return a generic "This loan is not awaiting <action>" message for executives outside the owned status.
- **Status:** open

## B1 · Route table (derived from source)

**App-level middleware, in order** (`backend/src/app.ts:38-70`): `trust proxy = TRUST_PROXY_HOPS` → `helmet()` → `cors({ origin: CORS_ORIGINS, credentials: true })` → `pino-http` → `Cache-Control: no-store` → `express.json({ limit: '100kb' })` → `cookie-parser` → `verifyOrigin(CORS_ORIGINS)` (403 `INVALID_ORIGIN` for POST/PUT/PATCH/DELETE whose `Origin` is present and not allowed) → routers (mount order: health, auth, borrower, uploads, loans, payments, dashboard, admin; all but health under `/api/v1`) → `notFoundHandler` (404 `NOT_FOUND`) → `errorHandler`.

Routers carry no router-level middleware; every chain below starts after the app-level chain. "q-parse" = the controller parses `req.query` with a strict zod schema (a ZodError → 400).

| #   | Method | Path                                 | Route middleware chain (after app-level)                                                              | Source                      |
| --- | ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | GET    | `/health`                            | `getHealth` (public; 503 when the DB ping fails)                                                       | `health.routes.ts:7`        |
| 2   | POST   | `/api/v1/auth/signup`                | `signupLimiter` (10/h) → `validate(body: signupBodySchema)` → `signup`                                | `auth.routes.ts:15-20`      |
| 3   | POST   | `/api/v1/auth/login`                 | `loginLimiter` (10 failed/15 min) → `validate(body: loginBodySchema)` → `login`                       | `auth.routes.ts:21-26`      |
| 4   | POST   | `/api/v1/auth/logout`                | `sessionLimiter` (300/15 min) → `validate(body: emptyBodySchema)` → `logout` (no authenticate)        | `auth.routes.ts:27-32`      |
| 5   | GET    | `/api/v1/auth/me`                    | `sessionLimiter` → `authenticate` → `getCurrentUser` (any role)                                        | `auth.routes.ts:33`         |
| 6   | GET    | `/api/v1/borrower/progress`          | `authenticate` → `requireRole(BORROWER)` → `getProgress`                                               | `borrower.routes.ts:12-17`  |
| 7   | PUT    | `/api/v1/borrower/profile`           | `authenticate` → `requireRole(BORROWER)` → `validate(body: profileBodySchema)` → `saveProfile`         | `borrower.routes.ts:18-24`  |
| 8   | POST   | `/api/v1/borrower/salary-slip`       | `authenticate` → `requireRole(BORROWER)` → `uploadSingleFile('file')` (multer) → `uploadSalarySlip`    | `uploads.routes.ts:13-19`   |
| 9   | GET    | `/api/v1/borrower/salary-slip`       | `authenticate` → `requireRole(BORROWER)` → `downloadOwnSalarySlip`                                     | `uploads.routes.ts:20-25`   |
| 10  | GET    | `/api/v1/loans/:loanId/salary-slip`  | `authenticate` → `requireRole(SANCTION, ADMIN)` → `validate(params)` → `downloadLoanSalarySlip`        | `uploads.routes.ts:28-34`   |
| 11  | POST   | `/api/v1/borrower/loans`             | `authenticate` → `requireRole(BORROWER)` → `validate(body: applyBodySchema)` → `apply`                 | `loans.routes.ts:17-23`     |
| 12  | GET    | `/api/v1/borrower/loans`             | `authenticate` → `requireRole(BORROWER)` → `listMyLoans` (q-parse `paginationQuerySchema`)             | `loans.routes.ts:24-29`     |
| 13  | GET    | `/api/v1/borrower/loans/:loanId`     | `authenticate` → `requireRole(BORROWER)` → `validate(params)` → `getMyLoan`                            | `loans.routes.ts:31-37`     |
| 14  | GET    | `/api/v1/loans`                      | `authenticate` → `requireRole(SANCTION, DISBURSEMENT, COLLECTION, ADMIN)` → `listLoans` (q-parse `listLoansQuerySchema`) | `loans.routes.ts:40-45` |
| 15  | GET    | `/api/v1/loans/:loanId`              | `authenticate` → `requireRole(SANCTION, DISBURSEMENT, COLLECTION, ADMIN)` → `validate(params)` → `getLoan` | `loans.routes.ts:46-52` |
| 16  | POST   | `/api/v1/loans/:loanId/approve`      | `authenticate` → `requireRole(SANCTION, ADMIN)` → `validate(params, body: approveBodySchema)` → `approve` | `loans.routes.ts:53-59` |
| 17  | POST   | `/api/v1/loans/:loanId/reject`       | `authenticate` → `requireRole(SANCTION, ADMIN)` → `validate(params, body: rejectBodySchema)` → `reject` | `loans.routes.ts:60-66`   |
| 18  | POST   | `/api/v1/loans/:loanId/disburse`     | `authenticate` → `requireRole(DISBURSEMENT, ADMIN)` → `validate(params, body: emptyBodySchema)` → `disburse` | `loans.routes.ts:67-73` |
| 19  | GET    | `/api/v1/loans/:loanId/payments`     | `authenticate` → `requireRole(COLLECTION, ADMIN)` → `validate(params)` → `listPayments` (q-parse `listPaymentsQuerySchema`) | `payments.routes.ts:12-18` |
| 20  | POST   | `/api/v1/loans/:loanId/payments`     | `authenticate` → `requireRole(COLLECTION, ADMIN)` → `validate(params, body: recordPaymentBodySchema)` → `recordPayment` | `payments.routes.ts:19-25` |
| 21  | GET    | `/api/v1/leads`                      | `authenticate` → `requireRole(SALES, ADMIN)` → `listLeads` (q-parse `paginationQuerySchema`)           | `dashboard.routes.ts:9-14`  |
| 22  | GET    | `/api/v1/dashboard/summary`          | `authenticate` → `requireRole(ADMIN)` → `getSummary`                                                   | `dashboard.routes.ts:17-22` |
| 23  | GET    | `/api/v1/admin/users`                | `authenticate` → `requireRole(ADMIN)` → `listUsers` (q-parse `listUsersQuerySchema`)                   | `admin.routes.ts:11-16`     |
| 24  | POST   | `/api/v1/admin/users`                | `authenticate` → `requireRole(ADMIN)` → `validate(body: createStaffBodySchema)` → `createStaffUser`    | `admin.routes.ts:17-23`     |
| 25  | PATCH  | `/api/v1/admin/users/:userId/role`   | `authenticate` → `requireRole(ADMIN)` → `validate(params: userIdParamsSchema, body: changeRoleBodySchema)` → `changeRole` | `admin.routes.ts:24-30` |

Totals: 25 routes; 4 public (`/health`, signup, login, logout); 21 behind `authenticate` (matches the README's "21 protected endpoints"). Role lists for actions come from `LOAN_ACTIONS[...].allowedRoles` (`utils/loan-state-machine.ts:29-34`) and `PAYMENT_RECORDER_ROLES` (`utils/payment-rules.ts:6`). No `requireRole` grants an implicit ADMIN bypass (`middleware/require-role.ts:10-21`). Express 5 also answers HEAD on every GET route and cors answers OPTIONS preflights.

Service-level scoping (applies after the route chain):

- Staff reads (`/loans/:loanId`, `/loans/:loanId/salary-slip`, `/loans/:loanId/payments` GET) go through `findLoanForViewer` → 404 unless ADMIN or the loan is in the role's `MODULE_OWNED_STATUS` (SANCTION=APPLIED, DISBURSEMENT=SANCTIONED, COLLECTION=DISBURSED) (`loan-operations.service.ts:90-96`, `loan-state-machine.ts:57-66`).
- `GET /loans` forces executives onto their module's status; another `?status=` → 403 (`loan-operations.service.ts:53-62`).
- Staff actions (approve/reject/disburse) use a conditional update `{ _id, status: from }`; 404 only when the id doesn't exist, otherwise 409 (`loan-operations.service.ts:112-146`). Payments: 404 unknown id, 409 `LOAN_NOT_DISBURSED` otherwise (`payments.service.ts:64-70`).
- Borrower routes take no user id from the request: everything is scoped by `req.user.id` (`borrower.service.ts`, `loans.service.ts:44-69`, `uploads.service.ts:96-102`).

## B4 · Route × identity matrix (in-process, 304 cells, 0 mismatches)

Script: `audit/scripts/b4-matrix.ts` (supertest against `createApp()` + `MongoMemoryReplSet`). Identities: anonymous, one user per role, `BORROWER` = borrower A, `BORROWER2` = borrower B. Each allowed cell used fresh data in the right state (e.g. SANCTION and ADMIN each approved their own APPLIED loan; DISBURSEMENT reads a SANCTIONED loan, COLLECTION a DISBURSED one; borrowers walk profile → slip → apply → read in order). Denied borrower cells on `/loans/:id…` used the borrower's **own** loan id, so owning the loan never helps. A plain number means expected = actual. Expected values: public routes → their success status for everyone; otherwise 401 anonymous, 403 for a role not in the route's list, and for allowed roles the success status, 404 (rows `a`/`b`: another borrower's loan, a loan outside the executive's module status, or an unknown id) or 400 (rows `c`: malformed id).

The 2xx bodies were checked too: approve → `SANCTIONED`, reject → `REJECTED`, disburse → `DISBURSED`, payment 201 with `amount` 100000, `POST /admin/users` → role `SANCTION`, `PATCH …/role` → `SALES`; `GET /loans` returned only `APPLIED` for SANCTION, only `SANCTIONED` for DISBURSEMENT, only `DISBURSED` for COLLECTION and all statuses for ADMIN.

| Route | ANON | ADMIN | SALES | SANCTION | DISBURSEMENT | COLLECTION | BORROWER | BORROWER2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 GET /health | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| 2 POST /auth/signup | 201 | 201 | 201 | 201 | 201 | 201 | 201 | 201 |
| 3 POST /auth/login | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| 4 POST /auth/logout | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| 5 GET /auth/me | 401 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| 6 GET /borrower/progress | 401 | 403 | 403 | 403 | 403 | 403 | 200 | 200 |
| 7 PUT /borrower/profile | 401 | 403 | 403 | 403 | 403 | 403 | 200 | 200 |
| 8 POST /borrower/salary-slip | 401 | 403 | 403 | 403 | 403 | 403 | 201 | 201 |
| 9 GET /borrower/salary-slip | 401 | 403 | 403 | 403 | 403 | 403 | 200 | 200 |
| 11 POST /borrower/loans | 401 | 403 | 403 | 403 | 403 | 403 | 201 | 201 |
| 12 GET /borrower/loans | 401 | 403 | 403 | 403 | 403 | 403 | 200 | 200 |
| 13 GET /borrower/loans/:own | 401 | 403 | 403 | 403 | 403 | 403 | 200 | 200 |
| 13a GET /borrower/loans/:otherBorrower | 401 | 403 | 403 | 403 | 403 | 403 | 404 | 404 |
| 13b GET /borrower/loans/:unknown | 401 | 403 | 403 | 403 | 403 | 403 | 404 | 404 |
| 13c GET /borrower/loans/:malformed | 401 | 403 | 403 | 403 | 403 | 403 | 400 | 400 |
| 10 GET /loans/:id/salary-slip | 401 | 200 | 403 | 200 | 403 | 403 | 403 | 403 |
| 10a GET /loans/:unknown/salary-slip | 401 | 404 | 403 | 404 | 403 | 403 | 403 | 403 |
| 14 GET /loans | 401 | 200 | 403 | 200 | 200 | 200 | 403 | 403 |
| 15 GET /loans/:id | 401 | 200 | 403 | 200 | 200 | 200 | 403 | 403 |
| 15a GET /loans/:outOfScope | 401 | 404 | 403 | 404 | 404 | 404 | 403 | 403 |
| 15b GET /loans/:unknown | 401 | 404 | 403 | 404 | 404 | 404 | 403 | 403 |
| 15c GET /loans/:malformed | 401 | 400 | 403 | 400 | 400 | 400 | 403 | 403 |
| 16 POST /loans/:id/approve | 401 | 200 | 403 | 200 | 403 | 403 | 403 | 403 |
| 16a POST /loans/:unknown/approve | 401 | 404 | 403 | 404 | 403 | 403 | 403 | 403 |
| 17 POST /loans/:id/reject | 401 | 200 | 403 | 200 | 403 | 403 | 403 | 403 |
| 17a POST /loans/:unknown/reject | 401 | 404 | 403 | 404 | 403 | 403 | 403 | 403 |
| 18 POST /loans/:id/disburse | 401 | 200 | 403 | 403 | 200 | 403 | 403 | 403 |
| 18a POST /loans/:unknown/disburse | 401 | 404 | 403 | 403 | 404 | 403 | 403 | 403 |
| 19 GET /loans/:id/payments | 401 | 200 | 403 | 403 | 403 | 200 | 403 | 403 |
| 19a GET /loans/:unknown/payments | 401 | 404 | 403 | 403 | 403 | 404 | 403 | 403 |
| 20 POST /loans/:id/payments | 401 | 201 | 403 | 403 | 403 | 201 | 403 | 403 |
| 20a POST /loans/:unknown/payments | 401 | 404 | 403 | 403 | 403 | 404 | 403 | 403 |
| 21 GET /leads | 401 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| 22 GET /dashboard/summary | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 |
| 23 GET /admin/users | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 |
| 24 POST /admin/users | 401 | 201 | 403 | 403 | 403 | 403 | 403 | 403 |
| 25 PATCH /admin/users/:id/role | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 |
| 25a PATCH /admin/users/:unknown/role | 401 | 404 | 403 | 403 | 403 | 403 | 403 | 403 |

## Passed checks

- **B1:** 25 routes enumerated from `app.ts` + 8 `*.routes.ts` files (grep for `.get/.post/.put/.patch/.delete/.use/.route` in `src/` finds no other registrations); every non-public route starts with `authenticate` and, except `/auth/me`, an explicit `requireRole`.
- **B2:** All 25 routes in code appear in `docs/API.md:38-64` and `README.md:156-174` with the same method, path and roles; no documented route is missing from the code; every `AppError` status/code in `src/` (28 codes in `utils/app-error.ts:1-28`) is listed in the `docs/API.md:18-30` error table with the same HTTP status; per-route error lists match the services (e.g. staff actions 404 only for an unknown id, 409 otherwise, `docs/API.md:66` = `loan-operations.service.ts:140-145`). Mismatches: B-01, B-02.
- **B3:** Every protected route in the B1 table is `authenticate` → `requireRole` → [`uploadSingleFile`] → `validate` (list routes parse the query inside the controller, i.e. after the role check); `verifyOrigin` is global (`app.ts:58`). In-process probes (`audit/scripts/b3-order.ts`): anonymous upload of a 5 MB+ PDF → 401 and of an HTML file → 401 (multer never ran, otherwise 413/415); SANCTION upload 5 MB+ → 403; ADMIN upload → 403; BORROWER `POST /loans/not-an-id/approve` with an unknown body field → 403 (not 400); SALES `PATCH /admin/users/xyz/role {role:'GOD'}` → 403; BORROWER `GET /loans?limit=1000&evil=1` → 403; anonymous `GET /admin/users?limit=1000` → 401; cross-origin `POST approve` anonymous and as SANCTION → 403 `INVALID_ORIGIN`, and the loan was still APPLIED afterwards. Only deviation: B-03 (Info).
- **B4:** 38 route rows (the 25 routes plus 13 unknown/out-of-scope/malformed-id variants) × 8 identities = 304 cells, all expected = actual (table above). Public: `/health`, signup, login, logout → success for all 8. `/auth/me` → 401 anonymous, 200 for every role. Every other route → 401 anonymous, 403 for every role not listed, success/404/400 for listed roles.
- **B5:** `audit/scripts/b5-idor.ts`, 27/27 pass. Borrower A had a profile (PAN `AAAAA1111A`), a PNG slip, a DISBURSED loan and one payment (UTR `ALICEUTR0001`); borrower B a different profile, a PDF slip and an APPLIED loan. B → `PUT /borrower/profile` with `userId`/`borrowerId`/`_id` = A → 400; slip upload with an extra `userId` form field → 400; `POST /borrower/loans` with `borrowerId` → 400; `GET /borrower/loans?borrowerId=A` → 400; `GET /borrower/progress` (also `?userId=A&borrowerId=A`) → 200 with only B's data; `GET /borrower/salary-slip` (also `?userId=A&loanId=A`) → B's PDF, never A's PNG; `GET /borrower/loans` → exactly B's one loan; `GET /borrower/loans/:loanA` → 404, and with the id in upper-case hex → 404 (A's own upper-case request → 200, so the query is `{ _id, borrowerId }`, `loans.service.ts:64`); `/loans/:loanA`, `/loans/:loanA/salary-slip`, `/loans/:loanA/payments` (GET and POST), `/loans`, `/leads`, `/admin/users`, `PATCH /admin/users/:A/role` → 403. No B response contained A's user id, loan id, PAN, name, email, UTR or amount; `BorrowerLoan.statusHistory` keys are `from,to,at,byRole,note` (no staff ids). A's `/borrower/progress` JSON was byte-identical before and after B's attempts and A's slip was still the PNG.
- **B6:** `audit/scripts/b6-scoping.ts`, 114/114 pass, with one loan in each of the 5 statuses. Reads: SANCTION sees only APPLIED (`/loans/:id` and `/loans/:id/salary-slip` → 404 for SANCTIONED, REJECTED, DISBURSED, CLOSED); DISBURSEMENT only SANCTIONED; COLLECTION only DISBURSED (`/loans/:id/payments` → 404 for APPLIED, SANCTIONED, REJECTED and CLOSED); ADMIN 200 for every status. `GET /loans?status=X` for an executive → 403 unless X is the owned status; unfiltered lists contain only the owned status (ADMIN: all 5). Actions: approve/reject on SANCTIONED/REJECTED/DISBURSED/CLOSED → 409 `INVALID_STATUS_TRANSITION` (SANCTION and ADMIN); disburse on APPLIED/REJECTED/DISBURSED/CLOSED → 409 (DISBURSEMENT and ADMIN); payments on APPLIED/SANCTIONED/REJECTED/CLOSED → 409 `LOAN_NOT_DISBURSED` (COLLECTION and ADMIN); unknown id → 404 for every action; double approve and double disburse → 409; concurrent approve (SANCTION) + reject (ADMIN) → one 200, one 409; every loan still had its original status after the 409s. Observation (by design): once a loan auto-closes, COLLECTION gets 404 on its detail and payment history; only ADMIN can see closed loans.
