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

## Passed checks

- **G1** `/health` → 200 `{"status":"ok","database":"connected"}`. `/login` → 200. Anonymous `/` → 307 `/login`; `/dashboard` → 307 `/login?next=%2Fdashboard`; `/apply/loans` → 307 `/login?next=%2Fapply%2Floans`. (2026-10-10, logged out)
- **G2** Page headers on `/login`: HSTS (`max-age=63072000; includeSubDomains; preload`), `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=()`, `cache-control: private, no-cache, no-store`.
- **G2** API `GET /api/v1/auth/me` (anonymous) → 401 envelope `{"success":false,"error":{"code":"UNAUTHENTICATED",…}}` with `cache-control: no-store`, `x-vercel-cache: MISS`, the helmet CSP, nosniff, HSTS and no `x-powered-by`.
- **G2** Unknown API route → 404 `{"success":false,"error":{"code":"NOT_FOUND","message":"Route not found"}}`: no stack trace or internals.
- **G3** `POST /api/v1/auth/logout` with `Origin: https://evil.example` and no session → 403 `INVALID_ORIGIN` (nothing changed).
- **G4** Logged-in checks: the orchestrator may not sign in on a non-local site, so `audit/scripts/live-smoke.sh` was prepared for the user. It checks login, the cookie flags (httpOnly, Secure, SameSite=Lax), the landing page per role, each module endpoint (with item counts), a 403 for a wrong-role API, a `/forbidden` redirect for a wrong-role page, and logout for every demo role. It also logs in to one test account per role (to diagnose the earlier test-data issue). Read-only: it prints only statuses, flag names and counts. Syntax-checked and dry-run against a closed port. **Results pending: the user runs it.**
