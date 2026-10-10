// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B2: docs/API.md:11 says unknown query fields → 400. Check routes that never parse req.query.
import { call, setup, teardown } from './b-harness.js';
import { createAppliedLoan, createStaff } from '../tests/helpers/loans.js';

const app = await setup();
const staff = await createStaff();
const loan = await createAppliedLoan(app);
const q = '?unknownField=1&role=ADMIN';
const cases: [string, string, string | undefined][] = [
  ['GET /health', `/health${q}`, undefined],
  ['GET /auth/me', `/api/v1/auth/me${q}`, loan.borrower.cookie],
  ['GET /borrower/progress', `/api/v1/borrower/progress${q}`, loan.borrower.cookie],
  ['GET /borrower/salary-slip', `/api/v1/borrower/salary-slip${q}`, loan.borrower.cookie],
  ['GET /borrower/loans/:id', `/api/v1/borrower/loans/${loan.loanId}${q}`, loan.borrower.cookie],
  ['GET /loans/:id', `/api/v1/loans/${loan.loanId}${q}`, staff.ADMIN.cookie],
  ['GET /loans/:id/salary-slip', `/api/v1/loans/${loan.loanId}/salary-slip${q}`, staff.ADMIN.cookie],
  ['GET /dashboard/summary', `/api/v1/dashboard/summary${q}`, staff.ADMIN.cookie],
  ['GET /borrower/loans (list)', `/api/v1/borrower/loans${q}`, loan.borrower.cookie],
  ['GET /loans (list)', `/api/v1/loans${q}`, staff.ADMIN.cookie],
  ['GET /leads (list)', `/api/v1/leads${q}`, staff.ADMIN.cookie],
  ['GET /admin/users (list)', `/api/v1/admin/users?unknownField=1`, staff.ADMIN.cookie],
  ['GET /loans/:id/payments (list)', `/api/v1/loans/${loan.loanId}/payments${q}`, staff.ADMIN.cookie],
];
for (const [label, path, cookie] of cases) {
  const r = await call(app, 'get', path, { label, identity: 'x', cookie });
  const code = (r.json as { error?: { code?: string } } | null)?.error?.code ?? '';
  console.log(`${label.padEnd(32)} ${r.status} ${code}`);
}
await teardown('/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad/b2.json');
