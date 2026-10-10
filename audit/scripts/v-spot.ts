// P1 verifier evidence copy. To re-run: mkdir backend/audit-tmp-v && cp audit/scripts/v-*.ts backend/audit-tmp-v/ && cp audit/scripts/d-harness.ts backend/audit-tmp-v/harness.ts, then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-v/<file>.ts
// P1 verifier: spot-checks B-05, B-06, C-07, C-09, C-05, C-06, C-10/B-07 in-process.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { start, stop, check, note, summary, request, ORIGIN } from './harness.js';
import { createStaff } from '../tests/helpers/loans.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, prepareBorrowerToApply } from '../tests/helpers/borrower.js';
import { UserModel } from '../src/models/user.model.js';
import { BorrowerProfileModel } from '../src/models/borrower-profile.model.js';
import { LoanModel } from '../src/models/loan.model.js';

const app = await start();
const staff = await createStaff();
const admin = staff.ADMIN;
const code = (r: { body?: { error?: { code?: string } } }) => r.body?.error?.code;

// ---------- B-05
const create2 = await request(app).post('/api/v1/admin/users').set('Cookie', admin.cookie).set('Origin', ORIGIN)
  .send({ name: 'Second Admin', email: 'admin2@test.dev', password: 'Test@1234', role: 'ADMIN' });
note(`B-05 create second admin → ${create2.status}`);
const lower = await request(app).patch(`/api/v1/admin/users/${admin.id}/role`).set('Cookie', admin.cookie).set('Origin', ORIGIN).send({ role: 'SALES' });
check('B-05 own id lower-case → 409 CANNOT_CHANGE_OWN_ROLE', lower.status === 409 && code(lower) === 'CANNOT_CHANGE_OWN_ROLE', [lower.status, code(lower)]);
const upper = await request(app).patch(`/api/v1/admin/users/${admin.id.toUpperCase()}/role`).set('Cookie', admin.cookie).set('Origin', ORIGIN).send({ role: 'SALES' });
const dbRole = (await UserModel.findById(admin.id))?.role;
note(`B-05 own id UPPER-case → ${upper.status} ${JSON.stringify(upper.body).slice(0, 160)}; db role now ${dbRole}`);
check('B-05 reproduces: upper-case self id → 200 and role SALES', upper.status === 200 && dbRole === 'SALES');
// restore admin for later checks
await UserModel.updateOne({ _id: admin.id }, { $set: { role: 'ADMIN' } });

// ---------- raw HTTP helper (supertest may normalise paths)
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as AddressInfo).port;
function raw(method: string, path: string, headers: Record<string, string>, body?: Buffer | string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// ---------- B-06 (bad % in path, anonymous) and charset
const b06a = await raw('GET', '/api/v1/loans/%E0%A4%A', {});
note(`B-06 GET /api/v1/loans/%E0%A4%A (anon) → ${b06a.status} ${b06a.body}`);
check('B-06 bad %-encoding (anon) → 500 INTERNAL_ERROR', b06a.status === 500 && b06a.body.includes('INTERNAL_ERROR'));
const b06b = await raw('POST', '/api/v1/auth/login', { 'Content-Type': 'application/json; charset=latin1', Origin: ORIGIN }, '{"email":"a@b.co","password":"x"}');
note(`B-06 login with charset=latin1 → ${b06b.status} ${b06b.body}`);
check('B-06 unsupported charset → 500', b06b.status === 500);

// ---------- C-09 Content-Encoding compress
const c09 = await raw('POST', '/api/v1/auth/login', { 'Content-Type': 'application/json', 'Content-Encoding': 'compress', Origin: ORIGIN }, '{}');
note(`C-09 login with Content-Encoding: compress → ${c09.status} ${c09.body}`);
check('C-09 unsupported Content-Encoding → 500', c09.status === 500);

// ---------- C-07 multipart without boundary (borrower)
const borrowerU = await createTestUser('BORROWER', 'b-upload@test.dev');
const c07 = await raw('POST', '/api/v1/borrower/salary-slip', { 'Content-Type': 'multipart/form-data', Cookie: borrowerU.cookie, Origin: ORIGIN }, 'abc');
note(`C-07 multipart without boundary → ${c07.status} ${c07.body}`);
check('C-07 malformed multipart → 500', c07.status === 500);

// ---------- C-05 NUL in staff search
const c05 = await raw('GET', '/api/v1/admin/users?search=a%00b', { Cookie: admin.cookie });
note(`C-05 GET /admin/users?search=a%00b → ${c05.status} ${c05.body}`);
check('C-05 NUL in search → 500', c05.status === 500);
server.close();

// ---------- C-06 race profile edit vs apply
let raceHits = 0;
for (let i = 0; i < 10; i++) {
  const b = await createTestUser('BORROWER', `race${i}@test.dev`);
  await prepareBorrowerToApply(app, b.cookie);
  const [apply, edit] = await Promise.all([
    request(app).post('/api/v1/borrower/loans').set('Cookie', b.cookie).set('Origin', ORIGIN).send(LOAN_REQUEST),
    request(app).put('/api/v1/borrower/profile').set('Cookie', b.cookie).set('Origin', ORIGIN).send({ ...ELIGIBLE_PROFILE, monthlySalary: 100 }),
  ]);
  const profile = await BorrowerProfileModel.findOne({ userId: b.id });
  const loans = await LoanModel.countDocuments({ borrowerId: b.id, status: 'APPLIED' });
  const drift = apply.status === 201 && loans === 1 && profile?.monthlySalary === 100;
  if (drift) raceHits++;
  if (i === 0) note(`C-06 run 1: apply ${apply.status}, edit ${edit.status} ${code(edit)}; stored salary ${profile?.monthlySalary}; APPLIED loans ${loans}`);
}
note(`C-06 profile changed after the lock while an APPLIED loan exists: ${raceHits}/10`);
check('C-06 race reproduces at least once', raceHits > 0, raceHits);
// sequential control: edit after apply is refused
const ctl = await createTestUser('BORROWER', 'ctl@test.dev');
await prepareBorrowerToApply(app, ctl.cookie);
await request(app).post('/api/v1/borrower/loans').set('Cookie', ctl.cookie).set('Origin', ORIGIN).send(LOAN_REQUEST);
const ctlEdit = await request(app).put('/api/v1/borrower/profile').set('Cookie', ctl.cookie).set('Origin', ORIGIN).send({ ...ELIGIBLE_PROFILE, monthlySalary: 100 });
note(`C-06 control: sequential edit after apply → ${ctlEdit.status} ${code(ctlEdit)}`);

// ---------- C-10 / B-07 DB outage during authenticate (last: breaks the DB)
await mongoose.connection.close();
const me = await request(app).get('/api/v1/auth/me').set('Cookie', admin.cookie);
const setCookie = (me.get('Set-Cookie') ?? []).join(' | ');
note(`C-10 DB closed, valid ADMIN cookie: GET /auth/me → ${me.status} ${JSON.stringify(me.body)}; Set-Cookie: ${setCookie}`);
check('C-10/B-07 DB outage → 401 + cookie cleared', me.status === 401 && /lms_token=;/.test(setCookie) && /1970/.test(setCookie));
const health = await request(app).get('/health');
note(`/health with DB closed → ${health.status} ${JSON.stringify(health.body)}`);
summary();
await stop().catch(() => undefined);
process.exit(0);
