// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c5-nosql.ts
// C5: NoSQL operator payloads in body, query and params; prototype pollution; mongoose guards.
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserModel } from '../src/models/user.model.js';
import { LoanModel } from '../src/models/loan.model.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { ELIGIBLE_PROFILE } from '../tests/helpers/borrower.js';
import { createAppliedLoan, createDisbursedLoan, createStaff } from '../tests/helpers/loans.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const BIG = { windowMs: 60_000, limit: 10_000 };

async function main() {
  await startTestDatabase();
  const app = createApp({ authRateLimits: { login: BIG, signup: BIG, session: BIG } });
  const staff = await createStaff();
  const applied = await createAppliedLoan(app);
  const disbursed = await createDisbursedLoan(app, staff);
  const borrower = await createTestUser('BORROWER', 'nosql@audit.dev');

  check("mongoose.get('sanitizeFilter') === true", mongoose.get('sanitizeFilter') === true, mongoose.get('sanitizeFilter'));
  check("mongoose.get('strictQuery') === 'throw'", mongoose.get('strictQuery') === 'throw', mongoose.get('strictQuery'));
  let sanitizeThrows = false;
  try { await UserModel.findOne({ email: { $ne: null } as unknown as string }); } catch { sanitizeThrows = true; }
  check('direct findOne({email:{$ne:null}}) is neutralised ($eq wrap -> CastError)', sanitizeThrows, '');
  let strictThrows = false;
  try { await UserModel.find({ notAField: 1 } as never); } catch { strictThrows = true; }
  check('strictQuery: unknown filter path throws', strictThrows, '');

  // Body payloads.
  const post = (path: string, body: unknown, cookie?: string, method: 'post' | 'put' | 'patch' = 'post') => {
    let call = request(app)[method](path).set('Origin', ORIGIN).set('Content-Type', 'application/json');
    if (cookie) call = call.set('Cookie', cookie);
    return call.send(JSON.stringify(body));
  };
  const bodyCases: [string, string, unknown, string | undefined, ('post' | 'put' | 'patch')?][] = [
    ['login email $gt', '/api/v1/auth/login', { email: { $gt: '' }, password: 'x' }, undefined],
    ['login email $ne', '/api/v1/auth/login', { email: { $ne: null }, password: { $ne: null } }, undefined],
    ['login password $ne', '/api/v1/auth/login', { email: 'admin@test.dev', password: { $ne: null } }, undefined],
    ['login email $regex', '/api/v1/auth/login', { email: { $regex: '.*' }, password: 'Password@123' }, undefined],
    ['signup email $gt', '/api/v1/auth/signup', { name: 'Xx Yy', email: { $gt: '' }, password: 'Test@1234' }, undefined],
    ['profile pan $ne', '/api/v1/borrower/profile', { ...ELIGIBLE_PROFILE, pan: { $ne: null } }, borrower.cookie, 'put'],
    ['profile salary $gt', '/api/v1/borrower/profile', { ...ELIGIBLE_PROFILE, monthlySalary: { $gt: 0 } }, borrower.cookie, 'put'],
    ['apply principal $gt', '/api/v1/borrower/loans', { principal: { $gt: 0 }, tenureDays: 90 }, borrower.cookie],
    ['reject reason $ne', `/api/v1/loans/${applied.loanId}/reject`, { reason: { $ne: null } }, staff.SANCTION.cookie],
    ['payment utr $gt', `/api/v1/loans/${disbursed.loanId}/payments`, { utr: { $gt: '' }, amount: 100, paymentDate: '2026-01-01' }, staff.COLLECTION.cookie],
    ['payment amount $gt', `/api/v1/loans/${disbursed.loanId}/payments`, { utr: 'NOSQL12345', amount: { $gt: 0 }, paymentDate: '2026-01-01' }, staff.COLLECTION.cookie],
    ['admin role $ne', `/api/v1/admin/users/${borrower.id}/role`, { role: { $ne: 'X' } }, staff.ADMIN.cookie, 'patch'],
    ['admin create email $gt', '/api/v1/admin/users', { name: 'Xx Yy', email: { $gt: '' }, password: 'Test@1234', role: 'SALES' }, staff.ADMIN.cookie],
  ];
  for (const [name, path, body, cookie, method] of bodyCases) {
    const res = await post(path, body, cookie, method);
    check(`body ${name} -> 400 VALIDATION_ERROR`, res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR', `${res.status} ${res.body?.error?.code}`);
  }

  // Prototype pollution keys in JSON bodies.
  const protoCases: [string, string, string, string | undefined, ('post' | 'put' | 'patch')?][] = [
    ['signup __proto__', '/api/v1/auth/signup', '{"name":"Proto Kid","email":"proto@audit.dev","password":"Test@1234","__proto__":{"role":"ADMIN","isAdmin":true}}', undefined],
    ['signup constructor.prototype', '/api/v1/auth/signup', '{"name":"Proto Kid","email":"proto2@audit.dev","password":"Test@1234","constructor":{"prototype":{"role":"ADMIN"}}}', undefined],
    ['profile __proto__', '/api/v1/borrower/profile', JSON.stringify(ELIGIBLE_PROFILE).replace('{', '{"__proto__":{"isEligible":true},'), borrower.cookie, 'put'],
    ['admin role __proto__', `/api/v1/admin/users/${borrower.id}/role`, '{"role":"SALES","__proto__":{"role":"ADMIN"}}', staff.ADMIN.cookie, 'patch'],
  ];
  for (const [name, path, raw, cookie, method] of protoCases) {
    let call = request(app)[method ?? 'post'](path).set('Origin', ORIGIN).set('Content-Type', 'application/json');
    if (cookie) call = call.set('Cookie', cookie);
    const res = await call.send(raw);
    check(`proto ${name} -> 400`, res.status === 400, `${res.status} ${JSON.stringify(res.body?.error?.details ?? res.body?.error)}`);
  }
  const probe: Record<string, unknown> = {};
  check('Object.prototype not polluted', probe.role === undefined && probe.isAdmin === undefined, '');
  check('no proto users created', (await UserModel.countDocuments({ email: mongoose.trusted({ $in: ['proto@audit.dev', 'proto2@audit.dev'] }) })) === 0, '');
  check('borrower still BORROWER', (await UserModel.findById(borrower.id))?.role === 'BORROWER', '');

  // Query payloads.
  const get = (url: string, cookie: string) => request(app).get(url).set('Cookie', cookie);
  const queryCases: [string, string, string][] = [
    ['loans status[$ne]', '/api/v1/loans?status[$ne]=X', staff.ADMIN.cookie],
    ['loans page[$gt]', '/api/v1/loans?page[$gt]=0', staff.ADMIN.cookie],
    ['loans status duplicated', '/api/v1/loans?status=APPLIED&status=SANCTIONED', staff.ADMIN.cookie],
    ['loans limit 1000', '/api/v1/loans?limit=1000', staff.ADMIN.cookie],
    ['loans page 0', '/api/v1/loans?page=0', staff.ADMIN.cookie],
    ['loans page -1', '/api/v1/loans?page=-1', staff.ADMIN.cookie],
    ['loans page 1.5', '/api/v1/loans?page=1.5', staff.ADMIN.cookie],
    ['admin search[$regex]', '/api/v1/admin/users?search[$regex]=.*', staff.ADMIN.cookie],
    ['admin role[$ne]', '/api/v1/admin/users?role[$ne]=ADMIN', staff.ADMIN.cookie],
    ['admin search duplicated', '/api/v1/admin/users?search=a&search=b', staff.ADMIN.cookie],
    ['admin __proto__[role]', '/api/v1/admin/users?__proto__[role]=ADMIN', staff.ADMIN.cookie],
    ['admin __proto__', '/api/v1/admin/users?__proto__=x', staff.ADMIN.cookie],
    ['leads page[$gt]', '/api/v1/leads?page[$gt]=0', staff.SALES.cookie],
    ['borrower loans limit[$gt]', '/api/v1/borrower/loans?limit[$gt]=1', applied.borrower.cookie],
    ['payments page[$ne]', `/api/v1/loans/${disbursed.loanId}/payments?page[$ne]=1`, staff.COLLECTION.cookie],
    ['sanction status=DISBURSED', '/api/v1/loans?status=DISBURSED', staff.SANCTION.cookie],
  ];
  for (const [name, url, cookie] of queryCases) {
    const res = await get(url, cookie);
    const expected = name.startsWith('sanction') ? 403 : 400;
    check(`query ${name} -> ${expected}`, res.status === expected, `${res.status} ${res.body?.error?.code}`);
  }
  const literal = await get('/api/v1/admin/users?search=.*', staff.ADMIN.cookie);
  check('search ".*" is literal (0 matches)', literal.status === 200 && literal.body.data.pagination.totalItems === 0, literal.body?.data?.pagination);
  const hugePage = await get('/api/v1/loans?page=9007199254740991', staff.ADMIN.cookie);
  note('loans page=2^53-1', `${hugePage.status} ${hugePage.body?.error?.code ?? ''}`);
  const hugePage2 = await get('/api/v1/leads?page=9007199254740991&limit=100', staff.SALES.cookie);
  note('leads page=2^53-1 limit=100', `${hugePage2.status} ${hugePage2.body?.error?.code ?? ''}`);
  const bigPage = await get('/api/v1/loans?page=99999999999&limit=100', staff.ADMIN.cookie);
  note('loans page=99999999999 limit=100', `${bigPage.status} ${bigPage.body?.error?.code ?? ''}`);

  // Params: ObjectId validation on every :id route.
  const badIds = ['abc', '{"$gt":""}', encodeURIComponent('{"$ne":null}'), 'aaaaaaaaaaaa', 'zzzzzzzzzzzzzzzzzzzzzzzz', `${applied.loanId}x`, '%24ne', '__proto__', 'constructor'];
  const idRoutes: [string, 'get' | 'post' | 'patch', (id: string) => string, string, object?][] = [
    ['GET /loans/:id', 'get', (id) => `/api/v1/loans/${id}`, staff.ADMIN.cookie],
    ['GET /loans/:id/salary-slip', 'get', (id) => `/api/v1/loans/${id}/salary-slip`, staff.ADMIN.cookie],
    ['GET /loans/:id/payments', 'get', (id) => `/api/v1/loans/${id}/payments`, staff.ADMIN.cookie],
    ['POST /loans/:id/payments', 'post', (id) => `/api/v1/loans/${id}/payments`, staff.ADMIN.cookie, { utr: 'IDCHECK123', amount: 100, paymentDate: '2026-01-01' }],
    ['POST /loans/:id/approve', 'post', (id) => `/api/v1/loans/${id}/approve`, staff.ADMIN.cookie, {}],
    ['POST /loans/:id/reject', 'post', (id) => `/api/v1/loans/${id}/reject`, staff.ADMIN.cookie, { reason: 'invalid id test' }],
    ['POST /loans/:id/disburse', 'post', (id) => `/api/v1/loans/${id}/disburse`, staff.ADMIN.cookie, {}],
    ['GET /borrower/loans/:id', 'get', (id) => `/api/v1/borrower/loans/${id}`, applied.borrower.cookie],
    ['PATCH /admin/users/:id/role', 'patch', (id) => `/api/v1/admin/users/${id}/role`, staff.ADMIN.cookie, { role: 'SALES' }],
  ];
  for (const [name, method, path, cookie, body] of idRoutes) {
    const statuses: string[] = [];
    let ok = true;
    for (const id of badIds) {
      let call = request(app)[method](path(id)).set('Cookie', cookie).set('Origin', ORIGIN);
      if (body) call = call.send(body);
      const res = await call;
      statuses.push(String(res.status));
      if (!(res.status === 400 || res.status === 404)) ok = false;
      if (res.status === 404 && res.body?.error?.message !== 'Route not found') ok = false; // must not reach a lookup
    }
    const missing = '0123456789abcdef01234567';
    let call = request(app)[method](path(missing)).set('Cookie', cookie).set('Origin', ORIGIN);
    if (body) call = call.send(body);
    const res = await call;
    check(`${name}: bad ids -> 400 (or route 404), valid missing id -> 404`, ok && res.status === 404, `bad=[${statuses.join(',')}] missing=${res.status}`);
  }
  check('loan unchanged after injection attempts', (await LoanModel.findById(applied.loanId))?.status === 'APPLIED', '');

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
