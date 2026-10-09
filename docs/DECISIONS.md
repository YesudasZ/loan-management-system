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
