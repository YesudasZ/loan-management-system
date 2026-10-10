// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c4-csrf.ts
// C4: Origin check on every state-changing route; variants of bad Origin values.
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LoanModel } from '../src/models/loan.model.js';
import { UserModel } from '../src/models/user.model.js';
import { BorrowerProfileModel } from '../src/models/borrower-profile.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { ELIGIBLE_PROFILE, SAMPLE_FILES, saveEligibleProfile } from '../tests/helpers/borrower.js';
import { createAppliedLoan, createDisbursedLoan, createSanctionedLoan, createStaff } from '../tests/helpers/loans.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const BIG = { windowMs: 60_000, limit: 10_000 };

async function main() {
  await startTestDatabase();
  const app = createApp({ authRateLimits: { login: BIG, signup: BIG, session: BIG } });
  const staff = await createStaff();
  const applied = await createAppliedLoan(app);
  const sanctioned = await createSanctionedLoan(app, staff);
  const disbursed = await createDisbursedLoan(app, staff);
  const fresh = await createTestUser('BORROWER', 'fresh@audit.dev');
  await saveEligibleProfile(app, fresh.cookie);
  const target = await createTestUser('BORROWER', 'target@audit.dev');

  type Route = { name: string; method: 'post' | 'put' | 'patch'; path: string; cookie?: string; body?: object; multipart?: boolean };
  const routes: Route[] = [
    { name: 'signup', method: 'post', path: '/api/v1/auth/signup', body: { name: 'Csrf Victim', email: 'csrf-new@audit.dev', password: 'Test@1234' } },
    { name: 'login', method: 'post', path: '/api/v1/auth/login', body: { email: 'fresh@audit.dev', password: 'Password@123' } },
    { name: 'logout', method: 'post', path: '/api/v1/auth/logout', cookie: fresh.cookie, body: {} },
    { name: 'profile PUT', method: 'put', path: '/api/v1/borrower/profile', cookie: fresh.cookie, body: { ...ELIGIBLE_PROFILE, fullName: 'Changed By Csrf' } },
    { name: 'slip upload (multipart)', method: 'post', path: '/api/v1/borrower/salary-slip', cookie: fresh.cookie, multipart: true },
    { name: 'apply', method: 'post', path: '/api/v1/borrower/loans', cookie: fresh.cookie, body: { principal: 10_000_000, tenureDays: 90 } },
    { name: 'approve', method: 'post', path: `/api/v1/loans/${applied.loanId}/approve`, cookie: staff.SANCTION.cookie, body: {} },
    { name: 'reject', method: 'post', path: `/api/v1/loans/${applied.loanId}/reject`, cookie: staff.SANCTION.cookie, body: { reason: 'csrf reject' } },
    { name: 'disburse', method: 'post', path: `/api/v1/loans/${sanctioned.loanId}/disburse`, cookie: staff.DISBURSEMENT.cookie, body: {} },
    { name: 'payment', method: 'post', path: `/api/v1/loans/${disbursed.loanId}/payments`, cookie: staff.COLLECTION.cookie, body: { utr: 'CSRFUTR123', amount: 100, paymentDate: new Date().toISOString().slice(0, 10) } },
    { name: 'admin create staff', method: 'post', path: '/api/v1/admin/users', cookie: staff.ADMIN.cookie, body: { name: 'Csrf Admin', email: 'csrf-admin@audit.dev', password: 'Test@1234', role: 'ADMIN' } },
    { name: 'admin change role', method: 'patch', path: `/api/v1/admin/users/${target.id}/role`, cookie: staff.ADMIN.cookie, body: { role: 'ADMIN' } },
    { name: 'unknown POST route', method: 'post', path: '/api/v1/does-not-exist', body: {} },
  ];

  const send = (route: Route, origin: string | null) => {
    let call = request(app)[route.method](route.path);
    if (origin !== null) call = call.set('Origin', origin);
    if (route.cookie) call = call.set('Cookie', route.cookie);
    if (route.multipart) return call.attach('file', SAMPLE_FILES.pdf, { filename: 'slip.pdf', contentType: 'application/pdf' });
    return call.send(route.body ?? {});
  };

  const badOrigins = ['https://evil.example', 'null', 'http://localhost:3000/', 'HTTP://LOCALHOST:3000', 'http://localhost:3000.evil.example', 'http://localhost', 'http://localhost:3001', 'https://localhost:3000'];
  for (const origin of badOrigins) {
    const results: string[] = [];
    let allBlocked = true;
    for (const route of routes) {
      const res = await send(route, origin);
      const ok = res.status === 403 && res.body?.error?.code === 'INVALID_ORIGIN';
      if (!ok) allBlocked = false;
      results.push(`${route.name}=${res.status}`);
    }
    check(`Origin "${origin}" -> 403 INVALID_ORIGIN on all ${routes.length} state-changing routes`, allBlocked, allBlocked ? '' : results.join(', '));
  }

  // Nothing changed after all the blocked attempts.
  const appliedLoan = await LoanModel.findById(applied.loanId);
  const sanctionedLoan = await LoanModel.findById(sanctioned.loanId);
  const freshProfile = await BorrowerProfileModel.findOne({ userId: fresh.id });
  check('state unchanged: APPLIED loan still APPLIED', appliedLoan?.status === 'APPLIED', appliedLoan?.status);
  check('state unchanged: SANCTIONED loan still SANCTIONED', sanctionedLoan?.status === 'SANCTIONED', sanctionedLoan?.status);
  check('state unchanged: no payment recorded', (await PaymentModel.countDocuments({})) === 0, '');
  check('state unchanged: no csrf users created', (await UserModel.countDocuments({ email: mongoose.trusted({ $in: ['csrf-new@audit.dev', 'csrf-admin@audit.dev'] }) })) === 0, '');
  check('state unchanged: target still BORROWER', (await UserModel.findById(target.id))?.role === 'BORROWER', '');
  check('state unchanged: profile name, no slip', freshProfile?.fullName === 'Riya Sharma' && !freshProfile.salarySlip, freshProfile?.fullName);
  check('state unchanged: fresh has no loan', (await LoanModel.countDocuments({ borrowerId: fresh.id })) === 0, '');

  // Allowed origin works (sanity) and no-Origin is allowed by design.
  const allowed = await send(routes[6] as Route, ORIGIN);
  check('allowed Origin approve -> 200', allowed.status === 200, allowed.status);
  const noOrigin = await send(routes[8] as Route, null);
  note('no Origin header disburse (allowed by design, documented)', noOrigin.status);
  const getForeign = await request(app).get('/api/v1/auth/me').set('Origin', 'https://evil.example').set('Cookie', fresh.cookie);
  check('GET with foreign Origin is not blocked but gets no ACAO', getForeign.status === 200 && getForeign.get('Access-Control-Allow-Origin') === undefined, { status: getForeign.status, acao: getForeign.get('Access-Control-Allow-Origin') });
  const preflight = await request(app).options('/api/v1/borrower/loans').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
  check('preflight from foreign Origin has no ACAO', preflight.get('Access-Control-Allow-Origin') === undefined, { status: preflight.status, acao: preflight.get('Access-Control-Allow-Origin') });
  const preflightOk = await request(app).options('/api/v1/borrower/loans').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
  note('preflight from allowed Origin', { status: preflightOk.status, acao: preflightOk.get('Access-Control-Allow-Origin'), acac: preflightOk.get('Access-Control-Allow-Credentials') });
  // Methods not in the list.
  for (const method of ['delete'] as const) {
    const res = await request(app)[method]('/api/v1/admin/users').set('Origin', 'https://evil.example').set('Cookie', staff.ADMIN.cookie);
    check(`${method.toUpperCase()} with foreign Origin -> 403`, res.status === 403 && res.body?.error?.code === 'INVALID_ORIGIN', res.status);
  }

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
