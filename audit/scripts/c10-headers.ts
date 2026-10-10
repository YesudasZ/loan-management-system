// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=production (and NODE_ENV=test) MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c10-headers.ts
// C10: helmet headers, CORS allowlist, Cache-Control on every API response, and error bodies
// (run once with NODE_ENV=test and once with NODE_ENV=production to compare).
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { isProduction } from '../src/config/env.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { createStaff } from '../tests/helpers/loans.js';
import { saveEligibleProfile } from '../tests/helpers/borrower.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const LEAK = /stack|\bat [\w.<>]+ \(|\/Users\/|node_modules|BSON|Mongo|Cast|SyntaxError|Unexpected token|URIError|busboy|Multipart|\.ts:\d+/i;

async function main() {
  note('mode', isProduction ? 'NODE_ENV=production' : 'NODE_ENV=test');
  await startTestDatabase();
  const app = createApp();
  const staff = await createStaff();
  const borrower = await createTestUser('BORROWER', 'hdr@audit.dev');
  await saveEligibleProfile(app, borrower.cookie);

  // Helmet defaults on API responses.
  const me = await request(app).get('/api/v1/auth/me');
  const expected: Record<string, string | RegExp> = {
    'content-security-policy': /^default-src 'self';(?=.*object-src 'none')(?=.*script-src 'self')(?=.*frame-ancestors 'self')/,
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'origin-agent-cluster': '?1',
    'x-dns-prefetch-control': 'off',
    'x-download-options': 'noopen',
    'x-permitted-cross-domain-policies': 'none',
    'x-xss-protection': '0',
    'cache-control': 'no-store',
  };
  for (const [header, value] of Object.entries(expected)) {
    const actual = me.headers[header];
    const ok = typeof value === 'string' ? actual === value : value.test(String(actual));
    check(`GET /auth/me (401) header ${header}`, ok, String(actual));
  }
  check('no X-Powered-By', me.headers['x-powered-by'] === undefined, String(me.headers['x-powered-by']));
  note('full API CSP', me.headers['content-security-policy']);

  // Cache-Control: no-store on every kind of API response.
  const big = JSON.stringify({ name: 'x'.repeat(110 * 1024) });
  const responses: [string, () => request.Test][] = [
    ['GET /health 200', () => request(app).get('/health')],
    ['GET unknown route 404', () => request(app).get('/api/v1/nope')],
    ['GET /auth/me 200 (logged in)', () => request(app).get('/api/v1/auth/me').set('Cookie', borrower.cookie)],
    ['GET /borrower/profile 200', () => request(app).get('/api/v1/borrower/profile').set('Cookie', borrower.cookie)],
    ['GET /loans 403 (borrower)', () => request(app).get('/api/v1/loans').set('Cookie', borrower.cookie)],
    ['GET /loans 200 (admin)', () => request(app).get('/api/v1/loans').set('Cookie', staff.ADMIN.cookie)],
    ['POST /auth/login 400 invalid JSON', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":')],
    ['POST /auth/login 413 body > 100kb', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send(big)],
    ['POST /auth/logout 403 bad origin', () => request(app).post('/api/v1/auth/logout').set('Origin', 'https://evil.example')],
  ];
  for (const [name, make] of responses) {
    const res = await make();
    check(`Cache-Control no-store: ${name} (${res.status})`, String(res.headers['cache-control']).includes('no-store'), String(res.headers['cache-control']));
  }

  const preflightCache = await request(app).options('/api/v1/auth/login').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
  note('OPTIONS preflight Cache-Control (cors ends it before the no-store middleware)', `${preflightCache.status} cache-control=${preflightCache.headers['cache-control']}`);

  // CORS allowlist.
  const allowed = await request(app).get('/health').set('Origin', ORIGIN);
  check('CORS allowed origin: ACAO echoes it + credentials true + Vary: Origin',
    allowed.headers['access-control-allow-origin'] === ORIGIN && allowed.headers['access-control-allow-credentials'] === 'true' && /Origin/.test(String(allowed.headers.vary)),
    { acao: allowed.headers['access-control-allow-origin'], acac: allowed.headers['access-control-allow-credentials'], vary: allowed.headers.vary });
  for (const origin of ['https://evil.example', 'null', 'http://localhost:3000.evil.example', 'http://localhost:3001']) {
    const res = await request(app).get('/api/v1/auth/me').set('Origin', origin).set('Cookie', borrower.cookie);
    check(`CORS foreign origin ${origin}: no ACAO`, res.headers['access-control-allow-origin'] === undefined, String(res.headers['access-control-allow-origin']));
  }
  const pre = await request(app).options('/api/v1/borrower/profile').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'PUT').set('Access-Control-Request-Headers', 'content-type');
  check('preflight allowed origin -> 204 with ACAO + methods', pre.status === 204 && pre.headers['access-control-allow-origin'] === ORIGIN, { status: pre.status, methods: pre.headers['access-control-allow-methods'], headers: pre.headers['access-control-allow-headers'] });
  const preEvil = await request(app).options('/api/v1/borrower/profile').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'PUT');
  check('preflight foreign origin -> no ACAO', preEvil.headers['access-control-allow-origin'] === undefined, { status: preEvil.status, acac: preEvil.headers['access-control-allow-credentials'] });

  // Error bodies: client errors and reachable unexpected errors.
  const errorCases: [string, () => request.Test][] = [
    ['malformed JSON', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email": "a@b.c", ')],
    ['JSON with a BOM-less garbage token', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{\'email\':1}')],
    ['body > 100 kb', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send(big)],
    ['JSON charset=utf-7', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json; charset=utf-7').send('{"email":"a@b.c","password":"x"}')],
    ['Content-Encoding: compress (unsupported)', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').set('Content-Encoding', 'compress').send('{"email":"a@b.c","password":"x"}')],
    ['Content-Encoding: gzip with non-gzip bytes', () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send('{"email":"a@b.c","password":"x"}')],
    ['malformed percent-encoding in a path param', () => request(app).get('/api/v1/loans/%E0%A4%A').set('Cookie', staff.ADMIN.cookie)],
    ['malformed percent-encoding (anonymous)', () => request(app).get('/api/v1/loans/%E0%A4%A/salary-slip')],
    ['unknown route', () => request(app).get('/api/v1/does-not-exist')],
    ['validation error', () => request(app).post('/api/v1/auth/login').send({ email: 'not-an-email', password: '' })],
    ['NUL in staff search (C-05)', () => request(app).get('/api/v1/admin/users?search=a%00b').set('Cookie', staff.ADMIN.cookie)],
    ['multipart without boundary (C-07)', () => request(app).post('/api/v1/borrower/salary-slip').set('Cookie', borrower.cookie).set('Content-Type', 'multipart/form-data').send('xx')],
  ];
  for (const [name, make] of errorCases) {
    const res = await make();
    const text = JSON.stringify(res.body);
    const envelope = res.body?.success === false && typeof res.body?.error?.code === 'string';
    check(`${name}: ${res.status} envelope, no internals`, envelope && !LEAK.test(text), `${res.status} ${text.slice(0, 160)}`);
  }

  // Unexpected error: the database goes away mid-flight.
  await mongoose.connection.close();
  const dbDown = await request(app).get('/api/v1/loans').set('Cookie', staff.ADMIN.cookie);
  check(`database down: ${dbDown.status} generic envelope, no internals`, !LEAK.test(JSON.stringify(dbDown.body)), `${dbDown.status} ${JSON.stringify(dbDown.body).slice(0, 160)}`);
  note('database down, valid ADMIN cookie: status and Set-Cookie', `${dbDown.status} set-cookie=${JSON.stringify(dbDown.headers['set-cookie'] ?? null)}`);
  const dbDownAnon = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: 'admin@test.dev', password: 'Password@123' });
  check(`database down: login ${dbDownAnon.status} generic envelope, no internals`, !LEAK.test(JSON.stringify(dbDownAnon.body)), `${dbDownAnon.status} ${JSON.stringify(dbDownAnon.body).slice(0, 160)}`);
  const health = await request(app).get('/health');
  note('GET /health with the database down', `${health.status} ${JSON.stringify(health.body)}`);

  summary();
  await stopTestDatabase();
}

main().catch(async (error) => {
  process.stdout.write(`CRASH ${String(error?.stack ?? error)}\n`);
  await stopTestDatabase().catch(() => undefined);
  process.exit(1);
});
