// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c6-nullbyte.ts
// C6 follow-up: a NUL byte in the staff search term.
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createStaff } from '../tests/helpers/loans.js';
import { check, note, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

async function main() {
  await startTestDatabase();
  const app = createApp();
  const staff = await createStaff();
  const res = await request(app).get('/api/v1/admin/users?search=a%00b').set('Cookie', staff.ADMIN.cookie);
  note('GET /api/v1/admin/users?search=a%00b', `${res.status} ${JSON.stringify(res.body)}`);
  check('NUL byte search -> 4xx (not 500)', res.status >= 400 && res.status < 500, res.status);
  await stopTestDatabase();
  summary();
}
main().catch(async (error: unknown) => { process.stdout.write(`ERROR ${String(error)}\n`); await stopTestDatabase(); process.exit(1); });
