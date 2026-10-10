# Findings: Lens C: Security

Format and severity scale: `audit/README.md`.

## Findings

### C-01 · Info · JWT verification does not require an `exp` claim
- **Lens:** C (Security)
- **Evidence:** `backend/src/utils/jwt.ts:36` calls `jwtVerify(token, key, { algorithms: ['HS256'] })` without `requiredClaims: ['exp']` (or `maxTokenAge`). Local run: a token signed with the real secret but with no `exp` → `GET /api/v1/auth/me` 200.
- **Steps to reproduce:** `npx tsx audit/scripts/c1-auth.ts` (line "token WITHOUT exp signed with the real secret | status=200").
- **Impact:** None while the secret is safe: the server always sets `exp` (1 day) and forging needs the secret. Defence in depth only.
- **Breaks:** none
- **Suggested fix:** `jwtVerify(token, key, { algorithms: [ALGORITHM], requiredClaims: ['exp', 'sub'] })`, optionally `maxTokenAge: JWT_EXPIRY`.
- **Status:** open

### C-02 · Info · Logout does not revoke the JWT (documented trade-off)
- **Lens:** C (Security)
- **Evidence:** `backend/src/modules/auth/auth.controller.ts:20-23` only clears the cookie. Local run: the old token replayed after logout → `GET /auth/me` 200. Already listed in `docs/SECURITY.md` "Known limitations" (stateless JWT, 1-day expiry).
- **Steps to reproduce:** `npx tsx audit/scripts/c1-auth.ts` (line "old JWT replayed after logout").
- **Impact:** A stolen cookie stays usable for up to 24 h after the victim logs out. Mitigated by httpOnly + 1-day expiry + per-request user reload.
- **Breaks:** none (CLAUDE.md only asks for a short expiry and clearing the cookie)
- **Suggested fix:** none needed for submission; future: a `tokenVersion` on the user checked in `authenticate`.
- **Status:** open

### C-03 · Low · The login "dummy hash" is built on first use, not at startup (first unknown-email login is ~2x slower)
- **Lens:** C (Security)
- **Evidence:** `backend/src/modules/auth/auth.service.ts:25-28` (`dummyPasswordHash ??= bcrypt.hash(...)`) runs the extra `bcrypt.hash` inside the first unknown-email login. `docs/DECISIONS.md` #30 says "a startup-made dummy hash". Local timing: first unknown-email login 99 ms; afterwards unknown email median 49.2 ms vs wrong password median 49.2 ms (20 tries each).
- **Steps to reproduce:** `npx tsx audit/scripts/c2-session.ts` (lines "first unknown-email login" and "x20 ms").
- **Impact:** Only the first unknown-email login after each process start (Render free instances restart after idling) is distinguishable, by about one bcrypt hash. Negligible enumeration value; mainly a docs/code mismatch.
- **Breaks:** CLAUDE.md §6 "never reveal whether the email exists" (marginal); `docs/DECISIONS.md` #30 accuracy
- **Suggested fix:** Call `getDummyPasswordHash()` once from `server.ts` after connecting (or at module load), or reword DECISIONS #30.
- **Status:** open

### C-04 · Medium · Rate-limit keying is still unmeasured on the deployed path: either a shared bucket (hops=1) or an XFF spoof bypass (hops=2)
- **Lens:** C (Security)
- **Evidence:** `backend/src/app.ts:38` (`trust proxy` = `TRUST_PROXY_HOPS`), `backend/src/middleware/rate-limit.ts:16-27` (default `req.ip` key). `PROGRESS.md:104` and `:272`, `docs/DEPLOYMENT.md:170`: "`TRUST_PROXY_HOPS` is still `1`", measurement open. Local runs (`audit/scripts/c3-rate-limit.ts`, supertest's socket plays the last proxy):
  - hops=1: `X-Forwarded-For: 198.51.100.<n>, 203.0.113.7` (spoofed first entry rotated) → 429 at the 11th failure: a client can't spoof through one appending proxy.
  - hops=1: `X-Forwarded-For: 198.51.100.<n>, 203.0.113.7, 192.0.2.1` (two proxies, as on browser → Vercel → Render) → 429 at the 11th failure whatever `<n>` is, so every client behind the same last-but-one hop shares ONE bucket.
  - hops=2: the same rotated header with one fixed proxy entry (a client calling `*.onrender.com` directly) → never limited after 30 failures (bypass).
- **Steps to reproduce:** `TRUST_PROXY_HOPS=1 npx tsx audit/scripts/c3-rate-limit.ts`, then again with `TRUST_PROXY_HOPS=2` (same env as the README command).
- **Impact:** If the Vercel → Render path really has one more hop than direct access (likely), the current value 1 makes `req.ip` the Vercel egress address: 10 failed logins or 10 sign-ups from anyone sharing that address lock everybody on it out (429 for 15 min / 1 h), which an evaluator could hit; brute-force protection becomes global, not per attacker. Setting 2 fixes that but lets a direct-to-Render caller rotate a spoofed XFF entry and brute-force logins without limit. Documented in `docs/SECURITY.md` "Known limitations", but unresolved. Escalate to High if the Render log shows `clientIp` is not the real client IP.
- **Breaks:** CLAUDE.md §6 "Rate-limit `/auth/*`" and "`trust proxy` set for Render" (effectiveness)
- **Suggested fix:** Measure now (DEPLOYMENT.md checkpoint B step 5). Then either key the limiter on a header only Vercel can set (e.g. have Vercel's rewrite add a shared-secret header and reject requests without it, or key on `x-vercel-forwarded-for` only when that secret header matches), or block direct access to the Render URL. At minimum set hops to the measured value and record the residual risk.
- **Status:** open

### C-05 · Low · A NUL byte in the staff search returns 500 instead of 400
- **Lens:** C (Security)
- **Evidence:** `GET /api/v1/admin/users?search=a%00b` (ADMIN cookie) → `500 {"success":false,"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. Please try again later."}}`; the log shows `BSONError: value a\u0000b must not contain null bytes` from `serializeRegExp`. `backend/src/modules/admin/admin.schema.ts:10` accepts any string up to 100 chars; `admin.service.ts:22` builds a `RegExp`, and BSON regex patterns can't contain NUL.
- **Steps to reproduce:** `NODE_ENV=production … npx tsx audit/scripts/c6-nullbyte.ts`.
- **Impact:** ADMIN-only; the body stays generic (no leak), but bad input produces an error-level 500 log line instead of a 400.
- **Breaks:** CLAUDE.md §2/§6 "validate at the boundaries" (minor)
- **Suggested fix:** In `listUsersQuerySchema.search` add `.refine((value) => !value.includes('\0'), 'Invalid search')` (or strip control characters); add a test.
- **Status:** open

### C-06 · Low · The "details locked during an active loan" rule can be bypassed by racing a profile edit against apply
- **Lens:** C (Security)
- **Evidence:** `backend/src/modules/borrower/borrower.service.ts:59-77` checks `assertNoActiveLoan` and then upserts the profile in a separate step; `backend/src/modules/loans/loans.service.ts:82-131` reads the profile, checks, and creates the loan in separate steps. Locally, `Promise.all([POST /borrower/loans, PUT /borrower/profile {monthlySalary: 100}])` for a ready borrower gave **201 (loan created) and 422 (ineligible profile saved) in 10 of 10 runs**: the borrower ends up with an APPLIED loan while their stored profile was changed after the lock should have applied.
- **Steps to reproduce:** `npx tsx audit/scripts/c8-business-logic.ts` (line "apply racing an ineligible profile edit … 10").
- **Impact:** No privilege or money gain: the loan's `applicant` snapshot is the eligible profile that apply read, and the BRE still ran on it, so staff see consistent data. Only the profile (and Sales/borrower views of it) can drift from the loan, and only by the borrower racing themselves. The related slip-replacement race (a loan pointing at a deleted slip) is already a documented known limitation; it didn't reproduce in 10 local runs.
- **Breaks:** none in the PDF; weakens the documented lock (`borrower.service.ts:56` "Locked while the borrower has an active loan")
- **Suggested fix:** Make the lock atomic, e.g. run apply in a transaction that also writes the profile (bump a `version`/`lockedAt` conditioned on the `updatedAt` it read) and do the profile update in a transaction that re-checks for an active loan, so MongoDB's write conflict serialises the two; or document it next to the slip race.
- **Status:** open

## Passed checks

- **C1.** bcrypt: `BCRYPT_COST = 10` (`backend/src/config/constants.ts:26`); a user created through `POST /auth/signup` is stored with prefix `$2b$10$`; no hash in the response.
- **C1.** JWT: header `{"alg":"HS256"}`, `exp - iat = 86400`; expired → 401 (and cookie cleared), HS512 with the same secret → 401, `alg: none` → 401, wrong secret → 401, payload-tampered → 401 (`backend/src/utils/jwt.ts:36` pins `algorithms: ['HS256']`).
- **C1.** Cookie: `lms_token=<jwt>; Max-Age=86400; Path=/; Expires=…; HttpOnly; SameSite=Lax`, no `Domain`; with `NODE_ENV=production` the same line gains `Secure` (also on the clearing cookie).
- **C1.** Logout: `POST /auth/logout` → 200 with `lms_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax` (attributes match, so browsers drop it).
- **C2.** Role change: a BORROWER token gets `/leads` 403; after `role → SALES` in the DB the same token gets `/leads` 200, `/borrower/progress` 403 and `/auth/me` returns `SALES`; a demoted ADMIN token gets `/admin/users` 403 (`authenticate.ts:17` reloads the user every request).
- **C2.** Deleted user: still-valid JWT → 401 `UNAUTHENTICATED` on `/auth/me` and `/loans`, and the response clears the cookie.
- **C2.** Login errors: unknown email and wrong password (and upper-case email) both give 401 `{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}` with identical header sets; timing medians 49.2 ms vs 49.2 ms (20 tries each, cost 10).
- **C3.** Login limiter counts only failures: 9 failures + 5 successes + a 10th failure → all ≤ 401; the 11th failure → 429 `RATE_LIMITED` (headers `RateLimit: "10-in-15min"; r=0; t=900`); a correct password while blocked also → 429; another IP is unaffected.
- **C3.** Signup limiter: 10 × 201 then 429 on the 11th (per IP, 1 h). Session limiter: `/auth/me` + `/auth/logout` combined → 429 exactly at request 301.
- **C3.** With `TRUST_PROXY_HOPS=1` and one real appending proxy, a spoofed leading `X-Forwarded-For` entry doesn't change the key (429 at #11). `TRUST_PROXY_HOPS` is an integer `min(0)`, never `true` (`backend/src/config/env.ts:36`).
- **C4.** Origin check (`backend/src/middleware/verify-origin.ts`, mounted app-wide before every router in `app.ts:58`): all 12 state-changing routes (signup, login, logout, PUT profile, multipart slip upload, apply, approve, reject, disburse, payment, admin POST, admin PATCH role) plus an unknown POST and a DELETE → 403 `INVALID_ORIGIN` for `https://evil.example`, `null`, `http://localhost:3000/` (trailing slash), `HTTP://LOCALHOST:3000`, `http://localhost:3000.evil.example`, `http://localhost`, `:3001` and `https://localhost:3000`; afterwards no loan, payment, user, role or profile had changed. The allowed Origin → 200. A missing Origin is allowed by design (documented in `docs/SECURITY.md`; SameSite=Lax is the primary defence). CORS: foreign-Origin GET/preflight get no `Access-Control-Allow-Origin`; the allowed Origin gets ACAO + `Allow-Credentials: true`.
- **C5.** Guards active at runtime: `mongoose.get('sanitizeFilter') === true`, `strictQuery === 'throw'` (`backend/src/config/db.ts:10-12`); a direct `findOne({ email: { $ne: null } })` is wrapped in `$eq` (CastError) and an unknown filter path throws. Every `req.body`/`req.params` use sits behind `validate()` and every `req.query` use behind a strict zod parse (grep of `src/`); no `$where`/`$expr`/`$function` anywhere.
- **C5.** Body operators (`{"$gt":""}`, `{"$ne":null}`, `{"$regex":".*"}`) on login, signup, profile, apply, reject, payment, admin create and admin role → 400 `VALIDATION_ERROR` (13 cases). `__proto__` / `constructor.prototype` keys → 400 "Unrecognized key"; `Object.prototype` unpolluted; nothing created or changed.
- **C5.** Query operators (`?status[$ne]=X`, `?page[$gt]=0`, `?search[$regex]=.*`, `?role[$ne]=`, `?__proto__[role]=`, duplicated params, `limit=1000`, `page=0/-1/1.5`) on `/loans`, `/admin/users`, `/leads`, `/borrower/loans`, `/loans/:id/payments` → 400; `?search=.*` is matched literally (0 results); huge `page` values → 200 with an empty page (no 500).
- **C5.** ObjectId validation: all 9 `:loanId`/`:userId` routes return 400 for `abc`, `{"$gt":""}`, URL-encoded `{"$ne":null}`, a 12-char string, 24 non-hex chars, an id + suffix, `%24ne`, `__proto__`, `constructor`; a valid but missing id → 404 (`backend/src/utils/schemas.ts:5`).
- **C6.** Staff search escapes `. * + ? ^ $ { } ( ) | [ ] \` (`backend/src/modules/admin/admin.service.ts:16-18`) and caps at 100 chars after trim (`admin.schema.ts:10`; 101 chars → 400). Six catastrophic patterns (`(a+)+$`, `(a|aa)+$`, `(a*)*b`, `^(([a-z])+.)+[A-Z]([a-z])+$`, `(.*a){20}`, `(?:a+){10}$`) repeated to ~100 chars against 300 users named `a×60!` → 200 in 2–4 ms with 0 hits (baseline 17 ms). Specials (`a.b`, `(Paren)`, `[Br]`, `$x^`, `|pipe|`, `back\slash`, `\`, unicode) match literally; `((((` → 200, no compile error.
- **C7.** All 11 JSON write bodies (signup, login, logout, profile, apply, approve, reject, disburse, payment, admin create, admin role) use `z.strictObject` and returned 400 "Unrecognized key" for each of 24 injected server-owned fields (`role`, `status`, `totalPaid`, `totalRepayment`, `simpleInterest`, `annualInterestRate`, `breResult`, `userId`, `borrowerId`, `recordedBy`, `roleHistory`, `passwordHash`, `_id`, `salarySlip`, `applicant`, `statusHistory`, `disbursedAt/By`, `closedAt`, `rejectionReason`, `loanId`, `createdAt`, dotted `applicant.fullName`, `isEligible`); signup with `role` in any form → 400; admin create with `role: BORROWER` → 400. The database was unchanged afterwards.
- **C8.** Payment amounts: −100, 0, 100.5, `"100"`, `null`, `true`, `1e21`, `1e400` → 400 (`payments.schema.ts:7`); outstanding + 1 and `MAX_SAFE_INTEGER` → 422 `AMOUNT_EXCEEDS_OUTSTANDING`. Dates: yesterday (before disbursal) → 422 `DATE_BEFORE_DISBURSAL`, tomorrow → 422 `DATE_IN_FUTURE`, `2026-02-30`, `2025-02-29`, `2026-13-01`, `2026-1-1`, an ISO datetime and `""` → 400. Nothing stored after the invalid attempts.
- **C8.** UTR: `utrcase123` stored as `UTRCASE123`; `UTRCASE123`, `" UTRCASE123 "`, `"\tUtRcAsE123\n"` → 409 `DUPLICATE_UTR`; an inner space → 400; after the rejected duplicates `totalPaid` equals the sum of stored payments (transaction rollback). The same UTR raced on two loans → one 201, one 409, loser's `totalPaid` unchanged.
- **C8.** Concurrency: 5 simultaneous full payoffs → one 201 + four 409, loan CLOSED once, `totalPaid == totalRepayment`; 6 simultaneous ⅓+1 payments → exactly 2 × 201, `totalPaid` = stored sum ≤ total (`payments.service.ts:63` transaction); payment on a CLOSED loan → 409. Double approve / double disburse → 200 then 409; 7 concurrent approve/reject → exactly one 200 and one history entry; 5 concurrent disburse → one 200 (conditional `findOneAndUpdate({_id, status: from})`, `loan-operations.service.ts:119`).
- **C8.** Apply: client `totalRepayment`/`simpleInterest`/`annualInterestRate`, paise principal, out-of-range principal/tenure, 30.5 days and string principal → 400; server math gives SI 295,890 / total 10,295,890 paise for ₹1,00,000 × 90 d; apply twice → 409 `ACTIVE_LOAN_EXISTS`; 8 concurrent applies → one 201, seven 409, one loan stored (partial unique index); profile edit and slip upload during an active loan → 409.
