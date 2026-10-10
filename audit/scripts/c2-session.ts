// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c2-session.ts
// C2: role change / deleted user take effect immediately; generic login errors + timing.
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserModel } from '../src/models/user.model.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const BIG = { windowMs: 60_000, limit: 10_000 };

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return { mean: Math.round(mean * 10) / 10, median: Math.round(median * 10) / 10, min: Math.round((sorted[0] ?? 0) * 10) / 10, max: Math.round((sorted.at(-1) ?? 0) * 10) / 10 };
}

async function main() {
  await startTestDatabase();
  const app = createApp({ authRateLimits: { login: BIG, signup: BIG, session: BIG } });

  // Role change in DB takes effect on the next request (token still says BORROWER).
  const user = await createTestUser('BORROWER', 'role-change@audit.dev');
  const before = await request(app).get('/api/v1/leads').set('Cookie', user.cookie);
  check('BORROWER token on /leads -> 403', before.status === 403, before.status);
  await UserModel.updateOne({ _id: user.id }, { $set: { role: 'SALES' } });
  const after = await request(app).get('/api/v1/leads').set('Cookie', user.cookie);
  check('same token after DB role -> SALES: /leads 200', after.status === 200, after.status);
  const oldRights = await request(app).get('/api/v1/borrower/progress').set('Cookie', user.cookie);
  check('same token after DB role -> SALES: /borrower/progress 403', oldRights.status === 403, oldRights.status);
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', user.cookie);
  check('/auth/me returns DB role SALES', me.body?.data?.user?.role === 'SALES', me.body?.data?.user);

  // Demotion: ADMIN token, demoted to BORROWER in DB.
  const admin = await createTestUser('ADMIN', 'demoted-admin@audit.dev');
  await UserModel.updateOne({ _id: admin.id }, { $set: { role: 'BORROWER' } });
  const adminAfter = await request(app).get('/api/v1/admin/users').set('Cookie', admin.cookie);
  check('demoted ADMIN token -> /admin/users 403', adminAfter.status === 403, adminAfter.status);

  // Deleted user.
  const doomed = await createTestUser('COLLECTION', 'deleted@audit.dev');
  await UserModel.deleteOne({ _id: doomed.id });
  const gone = await request(app).get('/api/v1/auth/me').set('Cookie', doomed.cookie);
  check('deleted user valid JWT -> 401', gone.status === 401, { status: gone.status, body: gone.body });
  check('deleted user cookie cleared', (gone.get('Set-Cookie') ?? []).some((l) => l.startsWith('lms_token=;')), gone.get('Set-Cookie'));
  const goneLoans = await request(app).get('/api/v1/loans').set('Cookie', doomed.cookie);
  check('deleted user /loans -> 401', goneLoans.status === 401, goneLoans.status);

  // Generic login errors.
  await request(app)
    .post('/api/v1/auth/signup')
    .set('Origin', ORIGIN)
    .send({ name: 'Timing User', email: 'timing@audit.dev', password: 'Test@1234' });

  const login = (email: string, password: string) =>
    request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password });

  const t0 = performance.now();
  const firstUnknown = await login('nobody-first@audit.dev', 'Test@1234');
  const firstUnknownMs = performance.now() - t0;
  const wrong = await login('timing@audit.dev', 'Wrong@1234');
  check('unknown email status 401', firstUnknown.status === 401, firstUnknown.status);
  check('wrong password status 401', wrong.status === 401, wrong.status);
  check(
    'identical bodies',
    JSON.stringify(firstUnknown.body) === JSON.stringify(wrong.body),
    { unknown: firstUnknown.body, wrong: wrong.body },
  );
  const headerKeys = (r: request.Response) =>
    Object.keys(r.headers).filter((h) => !['date', 'etag', 'ratelimit', 'ratelimit-policy'].includes(h)).sort().join(',');
  check('identical header sets (ignoring date/etag/ratelimit)', headerKeys(firstUnknown) === headerKeys(wrong), { u: headerKeys(firstUnknown), w: headerKeys(wrong) });
  const caseEmail = await login('TIMING@audit.dev', 'Wrong@1234');
  check('upper-case email wrong password same body', JSON.stringify(caseEmail.body) === JSON.stringify(wrong.body), caseEmail.status);

  const unknownTimes: number[] = [];
  const wrongTimes: number[] = [];
  const rightTimes: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    let start = performance.now();
    await login(`nobody${i}@audit.dev`, 'Test@1234');
    unknownTimes.push(performance.now() - start);
    start = performance.now();
    await login('timing@audit.dev', `Wrong@${i}234`);
    wrongTimes.push(performance.now() - start);
    start = performance.now();
    await login('timing@audit.dev', 'Test@1234');
    rightTimes.push(performance.now() - start);
  }
  note('first unknown-email login (builds dummy hash lazily) ms', Math.round(firstUnknownMs));
  note('unknown email x20 ms', stats(unknownTimes));
  note('wrong password x20 ms', stats(wrongTimes));
  note('correct password x20 ms', stats(rightTimes));
  const diff = Math.abs(stats(unknownTimes).median - stats(wrongTimes).median);
  check('median difference < 10 ms', diff < 10, `${Math.round(diff * 10) / 10} ms`);

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
