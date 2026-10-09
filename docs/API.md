# API reference

The canonical API reference. Each feature branch adds the rows for the endpoints it ships. The full design is in [PLAN.md §6](../PLAN.md).

## Conventions

- Base path `/api/v1` (only `GET /health` is unversioned).
- Success: `{ "success": true, "data": ... }`. Error: `{ "success": false, "error": { "code", "message", "details?" } }`.
- Money is integer **paise**. Date-only fields are `YYYY-MM-DD`. Timestamps are ISO-8601.
- Paginated lists take `?page=1&limit=20` (max 100) and return `{ items, pagination: { page, limit, totalItems, totalPages } }`.

## Endpoints

| Method | Path             | Roles  | Request | Success | Errors          |
| ------ | ---------------- | ------ | ------- | ------- | --------------- |
| any    | any unknown path | public | —       | —       | 404 `NOT_FOUND` |
