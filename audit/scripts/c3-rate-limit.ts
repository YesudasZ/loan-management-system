// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c3-rate-limit.ts
// C3: auth rate limits at the configured thresholds, and how X-Forwarded-For interacts with
// TRUST_PROXY_HOPS. supertest connects from 127.0.0.1, which plays the role of "the proxy".
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AUTH_RATE_LIMITS } from '../src/config/constants.js';
import { env } from '../src/config/env.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const hops = env.TRUST_PROXY_HOPS;

async function failedLoginsUntil429(app: ReturnType<typeof createApp>, xff: (i: number) => string | undefined, max = 30) {
  for (let i = 1; i <= max; i += 1) {
    const call = request(app).post('/api/v1/auth/login').set('Origin', ORIGIN);
    const header = xff(i);
    if (header) call.set('X-Forwarded-For', header);
    const res = await call.send({ email: 'nobody@audit.dev', password: 'Wrong@1234' });
    if (res.status === 429) return i;
  }
  return -1;
}

async function main() {
  await startTestDatabase();
  note('TRUST_PROXY_HOPS', hops);
  note('AUTH_RATE_LIMITS', AUTH_RATE_LIMITS);

  if (hops === 1) {
    // 1. Login: only failures count, 429 on the 11th failure.
    const app = createApp();
    await request(app).post('/api/v1/auth/signup').set('Origin', ORIGIN).set('X-Forwarded-For', '10.0.0.99')
      .send({ name: 'Rate User', email: 'rate@audit.dev', password: 'Test@1234' });
    const ip = '10.0.0.1';
    const login = (password: string) =>
      request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip)
        .send({ email: 'rate@audit.dev', password });
    const statuses: number[] = [];
    for (let i = 0; i < 9; i += 1) statuses.push((await login('Wrong@1234')).status);
    for (let i = 0; i < 5; i += 1) statuses.push((await login('Test@1234')).status);
    statuses.push((await login('Wrong@1234')).status); // 10th failure
    const eleventh = await login('Wrong@1234');
    statuses.push(eleventh.status);
    const correctAfterBlock = await login('Test@1234');
    note('login statuses (9 fail, 5 ok, fail #10, fail #11)', statuses.join(','));
    check('9 failures + 5 successes + 10th failure are not limited', statuses.slice(0, 15).every((s) => s !== 429), '');
    check('11th failed login -> 429 RATE_LIMITED', eleventh.status === 429 && eleventh.body?.error?.code === 'RATE_LIMITED', eleventh.body);
    note('correct password while blocked', correctAfterBlock.status);
    note('rate limit headers on 429', { ratelimit: eleventh.get('RateLimit'), policy: eleventh.get('RateLimit-Policy') });

    // 2. Signup: 10 per hour, every request counts.
    const signupStatuses: number[] = [];
    for (let i = 1; i <= 11; i += 1) {
      const res = await request(app).post('/api/v1/auth/signup').set('Origin', ORIGIN).set('X-Forwarded-For', '10.0.0.2')
        .send({ name: 'Signup User', email: `signup${i}@audit.dev`, password: 'Test@1234' });
      signupStatuses.push(res.status);
    }
    note('signup statuses', signupStatuses.join(','));
    check('signup 1-10 not limited, 11th -> 429', signupStatuses.slice(0, 10).every((s) => s === 201) && signupStatuses[10] === 429, '');

    // 3. Session limiter: 300 per 15 min across /me and /logout.
    let sessionHit = -1;
    for (let i = 1; i <= 305; i += 1) {
      const call = i % 2 === 0
        ? request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN)
        : request(app).get('/api/v1/auth/me');
      const res = await call.set('X-Forwarded-For', '10.0.0.3');
      if (res.status === 429) { sessionHit = i; break; }
    }
    check('session limiter (/me + /logout) -> 429 at request 301', sessionHit === 301, sessionHit);

    // 4. Limits are per IP: another IP is unaffected.
    const other = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '10.0.0.4')
      .send({ email: 'rate@audit.dev', password: 'Wrong@1234' });
    check('a different client IP is not limited', other.status === 401, other.status);
  }

  // 5. X-Forwarded-For behaviour with this TRUST_PROXY_HOPS.
  const fresh = () => createApp();
  const noHeader = await failedLoginsUntil429(fresh(), () => undefined);
  note('no XFF (req.ip = socket 127.0.0.1): 429 at failure #', noHeader);
  const rotateWhole = await failedLoginsUntil429(fresh(), (i) => `203.0.113.${i}`);
  note('rotating a single XFF value (client talks to the app directly, no proxy appends): 429 at #', rotateWhole);
  const rotatePrefix = await failedLoginsUntil429(fresh(), (i) => `198.51.100.${i}, 203.0.113.7`);
  note('rotating a spoofed FIRST entry, last entry fixed (= what one real proxy appends): 429 at #', rotatePrefix);
  const rotatePrefix3 = await failedLoginsUntil429(fresh(), (i) => `198.51.100.${i}, 203.0.113.7, 192.0.2.1`);
  note('rotating first entry with two fixed proxy entries: 429 at #', rotatePrefix3);

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
