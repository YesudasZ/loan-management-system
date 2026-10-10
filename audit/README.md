# Pre-submission audit: method and rules

Every auditor reads this file before starting.

## Rules

1. **Audit only.** Change no application code, tests, config or docs outside `audit/`. Temporary scripts go in `audit/scripts/` and are deleted when the lens is done, unless they're useful evidence.
2. **Production safety.** Make no requests to the live site (`*.vercel.app`, `*.onrender.com`) or to Atlas. Everything runs locally:
   - in-process `supertest` against `createApp()` with `mongodb-memory-server` (a replica set);
   - or a local API and frontend on **your lens's own ports** (table below).
   - Only the orchestrator runs the read-only live checks (Lens G).
3. **Never read or print secrets.** Don't open `backend/.env` or `frontend/.env.local`; they hold real connection strings. Set the variables yourself on the command line: `MONGODB_URI` (in-memory), a throwaway `JWT_SECRET` of at least 32 characters, `CORS_ORIGINS`, `TRUST_PROXY_HOPS`. The only passwords you may write down are the published ones: `Password@123` (demo) and `Test@1234` (test data).
4. **No git commands that change history or the index.** No commit, checkout, stash or reset. The orchestrator commits.
5. **Checkpoint after every item.** When a checklist item is finished, immediately:
   1. append any findings to `audit/findings/<lens>.md`;
   2. tick the item in `audit/STATE.md` (`- [ ]` → `- [x]`), re-reading `STATE.md` right before editing (other auditors edit their own sections at the same time);
   3. then start the next item.

   Never batch ticks. When resuming, skip ticked items.

6. **Evidence or it didn't happen.** Every finding has a file:line, or the exact request and response, plus reproducible steps. If a check passes, note one line of evidence under the item in your findings file's "Passed checks" section.

## Local ports (avoid clashes between parallel auditors)

| Lens                          | API port              | Web port                                    | Mongo (memory) port |
| ----------------------------- | --------------------- | ------------------------------------------- | ------------------- |
| A (requirements, fresh clone) | 4401                  | 3401                                        | 27401               |
| B (API/RBAC)                  | in-process only       | –                                           | random (in-process) |
| C (security)                  | 4403 (only if needed) | 3403 (bundle inspection: `next build` only) | random / 27403      |
| D (functional)                | in-process only       | –                                           | random (in-process) |
| E (frontend)                  | 4405                  | 3405                                        | 27405               |
| F (code quality)              | –                     | –                                           | –                   |

The frontend's `.next` folder is shared: only Lens C (bundle build) and Lens E (dev/prod server) may build or serve the frontend, and never at the same time.

## Severity

- **Critical:** a borrower can reach another user's data or money, auth or RBAC can be bypassed, money or loan state can be corrupted, a production secret leaks, or the core assignment flow is broken.
- **High:** an explicit PDF requirement isn't met, or the core flow breaks in a realistic case, or a security weakness is exploitable in practice.
- **Medium:** a partial deviation from a requirement or CLAUDE.md rule, a defence-in-depth gap, or a notable UX or accessibility break.
- **Low:** a minor issue, a docs inaccuracy, or polish.
- **Info:** an observation; no action needed.

## Finding format (append to `audit/findings/<lens>.md`)

```
### <ID> · <Severity> · <Title>
- **Lens:** <letter and name>
- **Evidence:** <file:line, or the exact request and response>
- **Steps to reproduce:** <numbered steps or a command>
- **Impact:** <what goes wrong, for whom>
- **Breaks:** <PDF requirement / CLAUDE.md rule, or "none">
- **Suggested fix:** <concrete change>
- **Status:** open
```

IDs are per lens: `A-01`, `B-01`, … so parallel auditors never collide.
