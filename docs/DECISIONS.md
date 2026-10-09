# Design decisions

Short entries: the decision and the reason. Newest decisions are added at the bottom of their section.

## Process

1. **GitHub Flow with squash-merged PRs.** Solo project with one deployable branch; Git Flow's extra branches add nothing. The repo uses the PR title as the squash commit message, so a CI check enforces Conventional Commit PR titles.
2. **PROGRESS.md is updated on the feature branch, before the PR.** "Never commit to main" and the Definition of Done both require it; CLAUDE.md §4 was reworded to match.
3. **One empty root commit on `main`** (`chore: initial commit`), so the first PR had a base. It is the only direct commit to `main`.
4. **The assignment PDF is not committed.** The repo is public; the brief stays local and git-ignored.
5. **Compressed branch plan (8 branches instead of 15)** to meet the Sunday deadline. Related branches were merged (see PLAN.md §15); the end-to-end flow lands in branch 5.
6. **Dependabot PR titles are exempt from the PR-title check**, because their titles often exceed 72 characters.
7. **The npm audit CI gate blocks only on runtime dependencies** (`--omit=dev`). A second, non-blocking step audits everything; dev-only findings are justified in the PR's "Audit exceptions" section, as CLAUDE.md allows ("fix or justify").
8. **Commit scopes for module work:** sanction and disbursement → `loan`, collection → `payment`, sales and admin overview → `backend` / `frontend`, repo tooling → `ci`.

## Stack and structure

9. **Two independent npm packages (`backend/`, `frontend/`), not npm workspaces.** Render and Vercel each build one sub-folder; separate lockfiles keep both builds simple.
10. **TypeScript 6.0.x, not 7.x.** npm's `latest` is TS 7 (native compiler, no JS API), but typescript-eslint supports TS `< 6.1`. Revisit when typescript-eslint supports 7.
11. **ESLint 9, not 10.** eslint-config-next's React and import plugins support ESLint 9 at most.
12. **Exact versions everywhere** (`save-exact=true`), so installs are reproducible; Dependabot proposes upgrades.
13. **Backend is ESM** (`"type": "module"`, `module: nodenext`), because `file-type` (magic-byte checks) is ESM-only.
14. **Express 5, no `async-handler.ts`.** Express 5 forwards rejected promises from async handlers to the error handler by itself.
15. **`backend/tests/` sits beside `src/`,** and the build uses `tsconfig.build.json` (rootDir `src`), so only app code is emitted to `dist/`.
16. **Next.js `proxy.ts` instead of `middleware.ts`.** Next 16 deprecated and renamed the middleware file.
17. **Next.js Cache Components and partial prefetching are off** (create-next-app turns them on). The app fetches data on the client through the API proxy, and Cache Components would add Suspense and caching rules this app doesn't need.
18. **No Google Fonts.** The system font stack avoids a build-time network fetch.
19. **Tests run with `TZ=America/New_York`,** so any accidental use of local-time date APIs fails in tests (business dates use `Asia/Kolkata`).
20. **CI secret scan runs the pinned gitleaks binary over the full history** instead of the gitleaks GitHub Action, which avoids extra token permissions.

## Domain (from PLAN.md, detailed as each feature lands)

21. **BRE runs on the server and is mirrored on the client.** The server is the source of truth (anyone can call the API without the UI); it returns 422 with every failure and re-checks at apply time because age changes over time. The client mirror only gives instant feedback and never blocks submission. PAN uses `^[A-Z]{5}[0-9]{4}[A-Z]$` after trimming and uppercasing; the 4th-character holder type is deliberately not enforced.
22. **Money is integer paise; dates-only values are `YYYY-MM-DD` in `Asia/Kolkata`.**
23. **Client-sent loan totals are rejected (400) rather than ignored,** because CLAUDE.md requires strict schemas. The server always calculates interest and totals.

## Backend platform and auth (branch 2)

24. **Branch protection requires the Backend, Frontend and Secret scan checks, but not the PR-title check.** The PR-title workflow runs on `pull_request_target`, whose check run is attached to the base branch rather than the PR head, so requiring it could block merges. It still runs and shows on every PR.
25. **Env is validated once, at import (`config/env.ts`).** Every module reads the same typed `env`; a bad value crashes startup with one message listing every problem. Tests set their env in `vitest.config.ts`.
26. **`createApp()` takes options only for rate limits.** Tests can trigger 429 quickly, and each app instance gets fresh limiter counters.
27. **Three auth rate limits instead of one:** 10 _failed_ logins per 15 min, 10 signups per hour, 300 `/me` + `/logout` calls per 15 min (per IP). One shared limit would have locked out normal page loads.
28. **`authenticate` loads the user from the database on every request.** Role changes and deleted accounts take effect immediately; the token's role is used only by the frontend route guard.
29. **No implicit ADMIN bypass in `requireRole`.** ADMIN is listed explicitly on staff routes and gets 403 on borrower-only routes (your decision: admins can't apply for loans).
30. **Login always runs a bcrypt compare,** against a startup-made dummy hash when the email is unknown, so response time doesn't reveal which emails exist. Signup's 409 does reveal it (unavoidable without email verification); the signup rate limit slows enumeration.
31. **Express 5 `req.query` is a getter,** so `validate()` shadows it with an own property holding the parsed value instead of reassigning it.
32. **`mongoose.set('strictQuery', 'throw')` and `sanitizeFilter: true`.** A typo in a filter path throws instead of matching every document; operator objects from clients are neutralised. Server-written operators must use `mongoose.trusted()`.
33. **Tests relax `no-unsafe-*` lint rules for supertest bodies only** (untyped JSON). `no-explicit-any` stays on everywhere.
34. **The seed resets its accounts on every run** (upsert by email, password reset to `Password@123`) and never touches other accounts. It refuses `NODE_ENV=production` without `--force`; production is seeded from a laptop because Render's free tier has no shell.
35. **`/health` pings the database with a 2 s cap** and returns 503 if it fails, so Render restarts an instance that lost its database. Health checks are excluded from request logs.
36. **Test MongoDB binary pinned to 8.0.30** (Atlas M0 runs 8.0) and downloaded once in a vitest global setup, so parallel test files don't race for the download lock.

## Frontend platform (branch 3)

37. **`@types/node` stays on 24.x** (Dependabot ignores its majors). The runtime is Node 24 on Render and Vercel, so Node 26 type definitions would allow APIs that crash in production.
38. **The route guard (`proxy.ts`) verifies the JWT with the shared secret and fails closed.** A missing secret or an invalid or expired token means "anonymous", and an invalid cookie is deleted, so redirects can't loop. It's UX only; the API re-checks every request.
39. **`next.config.ts` validates `BACKEND_URL` and `JWT_SECRET` when it loads,** because rewrites are compiled into the build. A misconfigured Vercel project fails its build instead of deploying a broken app. CI passes placeholders.
40. **Page security headers apply to pages only (`/((?!api/).*)`).** API responses keep the backend's own headers, which the salary-slip viewer will need.
41. **Navigation after login, signup and logout uses `router.replace`.** The target layout mounts fresh and loads the new session, and the route guard runs on the request. The API client's auth redirects (401 → /login, 403 → /forbidden) do a full page load instead, with a documented lint exception, because they run outside React.
42. **The API client retries GET requests for about 90 s when the API is unreachable or answers with non-JSON** (Render free-tier cold start) and shows a "Waking up the server" banner. Mutations never retry automatically.
43. **The backend logs `clientIp` (`req.ip`) on every request.** It is used to measure `TRUST_PROXY_HOPS` on the deployed Vercel → Render path.
44. **One `CurrentUserProvider` per authenticated layout** loads `/auth/me` once per page load. The cookie is httpOnly, so that's the only way the UI learns the user's name and role.

## Borrower journey (branch 4)

45. **A failed BRE is saved and still returns 422.** Sales sees "BRE failed" leads, while the borrower gets every failure at once and stays blocked until the details pass.
46. **Format checks are 400s; eligibility rules are the BRE's (422).** zod only checks shape (date valid and not in the future, salary an integer, known employment mode). A badly formatted PAN is a BRE failure, so it's reported together with any other failed rules.
47. **The BRE runs again on apply, with today's date.** Age changes over time. A new failure is saved to the profile, and the wizard sends the borrower back to their details.
48. **The client BRE mirror never blocks submission.** It shows a live preview; the server always decides. The BRE and loan-math mirrors are tested against the same JSON vectors as the backend (`backend/tests/fixtures`), which proves they match.
49. **The applicant details and salary slip are snapshotted onto the loan** at apply time, so later profile edits don't rewrite an application. The slip snapshot includes its type, so the sanction viewer can pick `<iframe>` or `<img>`.
50. **Status history stores the actor's role (`byRole`)** as well as their id, so borrowers see "approved by the sanction team" without receiving staff ids.
51. **Wizard resume:** once a borrower has any loan, the status page is their home. While a loan is active (APPLIED, SANCTIONED or DISBURSED) the details and slip are locked; after REJECTED or CLOSED, "Apply again" opens the loan step.
52. **Salary slips: multer memory storage with tight limits (1 file, 0 fields, 5 MB) and no fileFilter.** The extension, the declared type and the magic bytes (`file-type`) are checked after upload and must all agree. Files go to GridFS under a generated name. A replaced slip is deleted unless a loan application still points at it.
53. **Slips are served with their own CSP** (`default-src 'none'; object-src 'self'; frame-ancestors 'self'`), `nosniff` and `private, no-store`, replacing helmet's default (whose `object-src 'none'` can blank Chrome's PDF viewer).
54. **The seed builds demo borrowers through the real services** (`saveProfile`, `uploadSalarySlip`, `applyForLoan`), so demo data always follows the same rules as the app. Demo slips are generated one-page PDFs.
