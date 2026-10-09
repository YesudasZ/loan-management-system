## Summary

<!-- What changed and why. -->

## Branch goal

<!-- `type/short-description`: one line on the goal. -->

## Definition of Done (CLAUDE.md section 8)

- [ ] `npm run lint` passes with no warnings
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes; new logic has tests
- [ ] `npm run build` succeeds for the affected app(s)
- [ ] `npm audit --audit-level=high` is clean, or the exceptions are justified below
- [ ] Secret scan is clean (`npm run secrets`); no `.env` staged
- [ ] Security self-review done: auth, RBAC, IDOR, validation, error leaks; controllers never read raw `req.query` / `req.body`
- [ ] No `any`, `console.log`, commented-out code or dead code
- [ ] README / `.env.example` / `docs/API.md` updated if behaviour or config changed
- [ ] `PROGRESS.md` updated
- [ ] Commits follow Conventional Commits; branch named correctly

## Security notes

<!-- Anything a reviewer should look at closely. -->

## Audit exceptions

<!-- Advisory id, package, why it can't be fixed now, and when it will be revisited. "None" if clean. -->

## Manual test steps

1.
