// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c7-mass-assignment.ts
// C7: mass assignment. Every write body must reject server-owned fields with 400.
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LoanModel } from '../src/models/loan.model.js';
import { UserModel } from '../src/models/user.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { BorrowerProfileModel } from '../src/models/borrower-profile.model.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, prepareBorrowerToApply } from '../tests/helpers/borrower.js';
import { createAppliedLoan, createDisbursedLoan, createSanctionedLoan, createStaff } from '../tests/helpers/loans.js';
import { check, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const BIG = { windowMs: 60_000, limit: 10_000 };
const FORBIDDEN = {
  role: 'ADMIN',
  status: 'CLOSED',
  totalPaid: 999,
  totalRepayment: 1,
  simpleInterest: 0,
  annualInterestRate: 0,
  breResult: { isEligible: true, failures: [], checkedAt: '2026-01-01' },
  userId: '0123456789abcdef01234567',
  borrowerId: '0123456789abcdef01234567',
  recordedBy: '0123456789abcdef01234567',
  roleHistory: [],
  passwordHash: '$2b$04$abcdefghijklmnopqrstuv',
  _id: '0123456789abcdef01234567',
  salarySlip: null,
  applicant: { fullName: 'X' },
  statusHistory: [],
  disbursedAt: '2020-01-01',
  disbursedBy: '0123456789abcdef01234567',
  closedAt: '2020-01-01',
  rejectionReason: 'x',
  loanId: '0123456789abcdef01234567',
  createdAt: '2020-01-01',
  'applicant.fullName': 'Dotted',
  isEligible: true,
};

async function main() {
  await startTestDatabase();
  const app = createApp({ authRateLimits: { login: BIG, signup: BIG, session: BIG } });
  const staff = await createStaff();
  const applied = await createAppliedLoan(app);
  const sanctioned = await createSanctionedLoan(app, staff);
  const disbursed = await createDisbursedLoan(app, staff);
  const ready = await createTestUser('BORROWER', 'ready@audit.dev');
  await prepareBorrowerToApply(app, ready.cookie);
  const target = await createTestUser('BORROWER', 'target@audit.dev');
  const today = new Date().toISOString().slice(0, 10);

  type Route = { name: string; method: 'post' | 'put' | 'patch'; path: string; cookie?: string; base: object };
  const routes: Route[] = [
    { name: 'signup', method: 'post', path: '/api/v1/auth/signup', base: { name: 'Mass Assign', email: 'mass@audit.dev', password: 'Test@1234' } },
    { name: 'login', method: 'post', path: '/api/v1/auth/login', base: { email: 'ready@audit.dev', password: 'Password@123' } },
    { name: 'logout', method: 'post', path: '/api/v1/auth/logout', cookie: ready.cookie, base: {} },
    { name: 'profile', method: 'put', path: '/api/v1/borrower/profile', cookie: target.cookie, base: ELIGIBLE_PROFILE },
    { name: 'apply', method: 'post', path: '/api/v1/borrower/loans', cookie: ready.cookie, base: LOAN_REQUEST },
    { name: 'approve', method: 'post', path: `/api/v1/loans/${applied.loanId}/approve`, cookie: staff.SANCTION.cookie, base: { note: 'ok' } },
    { name: 'reject', method: 'post', path: `/api/v1/loans/${applied.loanId}/reject`, cookie: staff.SANCTION.cookie, base: { reason: 'not good enough' } },
    { name: 'disburse', method: 'post', path: `/api/v1/loans/${sanctioned.loanId}/disburse`, cookie: staff.DISBURSEMENT.cookie, base: {} },
    { name: 'payment', method: 'post', path: `/api/v1/loans/${disbursed.loanId}/payments`, cookie: staff.COLLECTION.cookie, base: { utr: 'MASSUTR001', amount: 100, paymentDate: today } },
    { name: 'admin create', method: 'post', path: '/api/v1/admin/users', cookie: staff.ADMIN.cookie, base: { name: 'Mass Staff', email: 'mass-staff@audit.dev', password: 'Test@1234', role: 'SALES' } },
    { name: 'admin role', method: 'patch', path: `/api/v1/admin/users/${target.id}/role`, cookie: staff.ADMIN.cookie, base: { role: 'BORROWER' } },
  ];

  for (const route of routes) {
    const leaks: string[] = [];
    for (const [field, value] of Object.entries(FORBIDDEN)) {
      if (field in route.base) continue; // e.g. admin create legitimately has `role`
      let call = request(app)[route.method](route.path).set('Origin', ORIGIN);
      if (route.cookie) call = call.set('Cookie', route.cookie);
      const res = await call.send({ ...route.base, [field]: value });
      const rejected = res.status === 400 && JSON.stringify(res.body).includes('Unrecognized key');
      if (!rejected) leaks.push(`${field}=${res.status}`);
    }
    check(`${route.name}: every server-owned field -> 400 Unrecognized key`, leaks.length === 0, leaks.join(', '));
  }

  // Signup role variants (case, array) and nothing changed.
  for (const roleValue of ['admin', ['ADMIN'], 'BORROWER']) {
    const res = await request(app).post('/api/v1/auth/signup').set('Origin', ORIGIN).send({ name: 'Role Try', email: `roletry${String(roleValue).length}@audit.dev`, password: 'Test@1234', role: roleValue });
    check(`signup with role=${JSON.stringify(roleValue)} -> 400`, res.status === 400, res.status);
  }
  check('admin create rejects role BORROWER', (await request(app).post('/api/v1/admin/users').set('Origin', ORIGIN).set('Cookie', staff.ADMIN.cookie).send({ name: 'Bor Row', email: 'bor@audit.dev', password: 'Test@1234', role: 'BORROWER' })).status === 400, '');

  check('no user created by any mass-assignment attempt', (await UserModel.countDocuments({ email: /^(mass|roletry|bor@)/ })) === 0, '');
  check('applied loan still APPLIED', (await LoanModel.findById(applied.loanId))?.status === 'APPLIED', '');
  check('sanctioned loan still SANCTIONED', (await LoanModel.findById(sanctioned.loanId))?.status === 'SANCTIONED', '');
  check('no payments recorded', (await PaymentModel.countDocuments({})) === 0, '');
  check('ready borrower has no loan', (await LoanModel.countDocuments({ borrowerId: ready.id })) === 0, '');
  check('target has no profile', (await BorrowerProfileModel.countDocuments({ userId: target.id })) === 0, '');
  check('target still BORROWER with empty roleHistory', (await UserModel.findById(target.id))?.roleHistory.length === 0, '');

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
