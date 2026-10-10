// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B3: middleware order probes (verifyOrigin → authenticate → requireRole → upload → validate).
import { call, setup, teardown } from './b-harness.js';
import { SAMPLE_FILES } from '../tests/helpers/borrower.js';
import { createAppliedLoan, createStaff } from '../tests/helpers/loans.js';

const app = await setup();
const staff = await createStaff();
const loan = await createAppliedLoan(app);
const show = (r: { label: string; status: number; json: unknown }) =>
  console.log(`${r.label.padEnd(70)} ${r.status} ${JSON.stringify((r.json as { error?: unknown } | null)?.error ?? '')}`);

const bigFile = { buffer: SAMPLE_FILES.oversizedPdf, filename: 'slip.pdf', contentType: 'application/pdf' };
const htmlFile = { buffer: SAMPLE_FILES.text, filename: 'slip.html', contentType: 'text/html' };

async function safe(label: string, fn: () => Promise<{ label: string; status: number; json: unknown }>) {
  try {
    show(await fn());
  } catch (error) {
    console.log(`${label.padEnd(70)} transport error: ${(error as Error).message}`);
  }
}

await safe('anon upload 5MB+ file', () =>
  call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'anon upload 5MB+ file', identity: 'ANON', attach: bigFile }));
await safe('anon upload html file', () =>
  call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'anon upload html file', identity: 'ANON', attach: htmlFile }));
await safe('SANCTION upload 5MB+ file', () =>
  call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'SANCTION upload 5MB+ file', identity: 'SANCTION', cookie: staff.SANCTION.cookie, attach: bigFile }));
await safe('ADMIN upload html file', () =>
  call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'ADMIN upload html file', identity: 'ADMIN', cookie: staff.ADMIN.cookie, attach: htmlFile }));
await safe('BORROWER(with active loan) upload html file', () =>
  call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'BORROWER(with active loan) upload html file', identity: 'BORROWER', cookie: loan.borrower.cookie, attach: htmlFile }));

show(await call(app, 'post', '/api/v1/loans/not-an-id/approve', { label: 'anon approve bad id + bad body', identity: 'ANON', body: { evil: true } }));
show(await call(app, 'post', '/api/v1/loans/not-an-id/approve', { label: 'BORROWER approve bad id + bad body', identity: 'BORROWER', cookie: loan.borrower.cookie, body: { evil: true } }));
show(await call(app, 'post', '/api/v1/loans/not-an-id/disburse', { label: 'SANCTION disburse bad id + bad body', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: { evil: true } }));
show(await call(app, 'post', '/api/v1/admin/users', { label: 'BORROWER create staff with bad body', identity: 'BORROWER', cookie: loan.borrower.cookie, body: { role: 'ADMIN' } }));
show(await call(app, 'patch', '/api/v1/admin/users/xyz/role', { label: 'SALES change role bad id + bad body', identity: 'SALES', cookie: staff.SALES.cookie, body: { role: 'GOD' } }));
show(await call(app, 'get', '/api/v1/loans?limit=1000&evil=1', { label: 'BORROWER list loans bad query', identity: 'BORROWER', cookie: loan.borrower.cookie }));
show(await call(app, 'get', '/api/v1/admin/users?limit=1000', { label: 'anon list users bad query', identity: 'ANON' }));
show(await call(app, 'post', `/api/v1/loans/${loan.loanId}/approve`, { label: 'anon approve, Origin evil.com', identity: 'ANON', headers: { Origin: 'https://evil.com' }, body: {} }));
show(await call(app, 'post', `/api/v1/loans/${loan.loanId}/approve`, { label: 'SANCTION approve, Origin evil.com', identity: 'SANCTION', cookie: staff.SANCTION.cookie, headers: { Origin: 'https://evil.com' }, body: {} }));
show(await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'BORROWER upload, Origin evil.com', identity: 'BORROWER', cookie: loan.borrower.cookie, headers: { Origin: 'https://evil.com' }, attach: htmlFile }));
show(await call(app, 'post', '/api/v1/auth/login', { label: 'login invalid JSON, Origin evil.com', identity: 'ANON', headers: { Origin: 'https://evil.com' }, rawBody: { data: '{bad', contentType: 'application/json' } }));
show(await call(app, 'post', `/api/v1/loans/${loan.loanId}/approve`, { label: 'SANCTION approve invalid JSON, Origin evil.com', identity: 'SANCTION', cookie: staff.SANCTION.cookie, headers: { Origin: 'https://evil.com' }, rawBody: { data: '{bad', contentType: 'application/json' } }));
show(await call(app, 'post', '/api/v1/loans/not-an-id/approve', { label: 'ADMIN approve bad id + bad body (which errors?)', identity: 'ADMIN', cookie: staff.ADMIN.cookie, body: { evil: true } }));
show(await call(app, 'get', `/api/v1/loans/${loan.loanId}`, { label: 'SANCTION GET loan still APPLIED (nothing changed)', identity: 'SANCTION', cookie: staff.SANCTION.cookie }));
await teardown('/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad/b3.json');
