# API reference

The canonical API reference. Each feature branch adds the rows for the endpoints it ships. The full design is in [PLAN.md §6](../PLAN.md).

## Conventions

- Base path `/api/v1` (only `GET /health` is unversioned, for Render's health check).
- Success: `{ "success": true, "data": ... }`. Error: `{ "success": false, "error": { "code", "message", "details?" } }`.
- Money is integer **paise**. Date-only fields are `YYYY-MM-DD`. Timestamps are ISO-8601.
- Paginated lists take `?page=1&limit=20` (max 100) and return `{ items, pagination: { page, limit, totalItems, totalPages } }`.
- Bodies, params and queries are validated with strict schemas: unknown fields → 400.
- Authentication is the `lms_token` cookie (httpOnly, SameSite=Lax, Secure in production, 1 day), set by signup and login.
- Every response has `Cache-Control: no-store`.
- POST/PUT/PATCH/DELETE requests carrying an `Origin` header must come from an origin in `CORS_ORIGINS`, otherwise 403 `INVALID_ORIGIN`.

## Error codes

| HTTP | Codes                                                                |
| ---- | -------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` (details: `[{ field, message }]`), `INVALID_JSON` |
| 401  | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                             |
| 403  | `FORBIDDEN`, `INVALID_ORIGIN`                                        |
| 404  | `NOT_FOUND`                                                          |
| 409  | `EMAIL_ALREADY_REGISTERED`                                           |
| 413  | `PAYLOAD_TOO_LARGE` (JSON body over 100 kb)                          |
| 429  | `RATE_LIMITED`                                                       |
| 500  | `INTERNAL_ERROR` (generic message, no internals)                     |
| 503  | `DATABASE_UNAVAILABLE` (`/health` only)                              |

## Endpoints

`User` = `{ id, name, email, role }`.

| Method | Path                  | Roles                                             | Request                                                                                                                    | Success                                           | Errors                                                                               |
| ------ | --------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/health`             | public                                            | —                                                                                                                          | 200 `{ status: 'ok', database: 'connected' }`     | 503 `DATABASE_UNAVAILABLE`                                                           |
| POST   | `/api/v1/auth/signup` | public (10 per hour per IP)                       | `{ name (2–80), email, password }`. Password: 8+ chars, ≤ 72 bytes, at least one letter and one digit. `role` is rejected. | 201 `{ user }` (role `BORROWER`) + session cookie | 400, 403 `INVALID_ORIGIN`, 409 `EMAIL_ALREADY_REGISTERED`, 429                       |
| POST   | `/api/v1/auth/login`  | public (10 **failed** attempts per 15 min per IP) | `{ email, password }`                                                                                                      | 200 `{ user }` + session cookie                   | 400, 401 `INVALID_CREDENTIALS` (same for unknown email and wrong password), 403, 429 |
| POST   | `/api/v1/auth/logout` | public (300 per 15 min per IP)                    | empty or `{}`                                                                                                              | 200 `null`, cookie cleared                        | 400, 403, 429                                                                        |
| GET    | `/api/v1/auth/me`     | any logged-in role (300 per 15 min per IP)        | —                                                                                                                          | 200 `{ user }`                                    | 401 `UNAUTHENTICATED` (an invalid cookie is also cleared), 429                       |
