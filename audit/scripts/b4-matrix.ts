// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B4: independent route × identity matrix (anonymous, 6 roles, a second borrower), in-process.
// Expected: 401 anonymous · 403 wrong role · 404 unknown/out-of-scope id · 400 malformed id ·
// the route's success status for allowed roles with valid data in the right state.
import { writeFileSync } from 'node:fs';
import { call, createTestUser, setup, teardown, type Recorded } from './b-harness.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, SAMPLE_FILES } from '../tests/helpers/borrower.js';
import {
  createAppliedLoan,
  createDisbursedLoan,
  createSanctionedLoan,
  createStaff,
} from '../tests/helpers/loans.js';
import { toBusinessDate } from '../src/utils/dates.js';

const OUT = '/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad';
type Identity = 'ANON' | 'ADMIN' | 'SALES' | 'SANCTION' | 'DISBURSEMENT' | 'COLLECTION' | 'BORROWER' | 'BORROWER2';
const IDS: Identity[] = ['ANON', 'ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION', 'BORROWER', 'BORROWER2'];
const STAFF_READ: Identity[] = ['SANCTION', 'DISBURSEMENT', 'COLLECTION', 'ADMIN'];
const BORROWERS: Identity[] = ['BORROWER', 'BORROWER2'];
const UNKNOWN_ID = '0123456789abcdef01234567';

const app = await setup();
const staff = await createStaff();
const borrowerA = await createTestUser('BORROWER', 'matrix.a@test.dev');
const borrowerB = await createTestUser('BORROWER', 'matrix.b@test.dev');
const convertTarget = await createTestUser('BORROWER', 'convert.me@test.dev');
const readApplied = await createAppliedLoan(app);
const readSanctioned = await createSanctionedLoan(app, staff);
const readDisbursed = await createDisbursedLoan(app, staff);
const approveLoans = { SANCTION: await createAppliedLoan(app), ADMIN: await createAppliedLoan(app) };
const rejectLoans = { SANCTION: await createAppliedLoan(app), ADMIN: await createAppliedLoan(app) };
const disburseLoans = {
  DISBURSEMENT: await createSanctionedLoan(app, staff),
  ADMIN: await createSanctionedLoan(app, staff),
};

const cookieOf = (id: Identity): string | undefined =>
  id === 'ANON' ? undefined : id === 'BORROWER' ? borrowerA.cookie : id === 'BORROWER2' ? borrowerB.cookie : staff[id].cookie;
const emailOf = (id: Identity): string =>
  id === 'ANON' || id === 'BORROWER' ? borrowerA.email : id === 'BORROWER2' ? borrowerB.email : staff[id].email;
const ownLoan: Partial<Record<Identity, string>> = {};
const profiles: Record<string, object> = {
  BORROWER: ELIGIBLE_PROFILE,
  BORROWER2: { ...ELIGIBLE_PROFILE, fullName: 'Kabir Second', pan: 'PQRSX5678Z' },
};
/** A loan id for denied cells: a borrower's own loan when they have one (shows ownership doesn't help). */
const anyLoanFor = (id: Identity) => ownLoan[id] ?? readApplied.loanId;
const staffReadLoan = (id: Identity) =>
  id === 'SANCTION' ? readApplied.loanId : id === 'DISBURSEMENT' ? readSanctioned.loanId : id === 'COLLECTION' ? readDisbursed.loanId : id === 'ADMIN' ? readDisbursed.loanId : anyLoanFor(id);

interface Row {
  key: string;
  method: 'get' | 'post' | 'put' | 'patch';
  path: (id: Identity) => string;
  body?: (id: Identity) => object;
  pdf?: boolean;
  allowed: Identity[] | 'PUBLIC' | 'ANY_AUTH';
  success: number;
  /** Status for allowed identities when it isn't `success` (unknown/out-of-scope rows). */
  allowedStatus?: number;
}

let paymentCounter = 0;
const today = toBusinessDate();
const rows: Row[] = [
  { key: '1 GET /health', method: 'get', path: () => '/health', allowed: 'PUBLIC', success: 200 },
  { key: '2 POST /auth/signup', method: 'post', path: () => '/api/v1/auth/signup', body: (id) => ({ name: 'Matrix Signup', email: `signup.${id.toLowerCase()}@test.dev`, password: 'Test@1234' }), allowed: 'PUBLIC', success: 201 },
  { key: '3 POST /auth/login', method: 'post', path: () => '/api/v1/auth/login', body: (id) => ({ email: emailOf(id), password: 'Password@123' }), allowed: 'PUBLIC', success: 200 },
  { key: '4 POST /auth/logout', method: 'post', path: () => '/api/v1/auth/logout', allowed: 'PUBLIC', success: 200 },
  { key: '5 GET /auth/me', method: 'get', path: () => '/api/v1/auth/me', allowed: 'ANY_AUTH', success: 200 },
  { key: '6 GET /borrower/progress', method: 'get', path: () => '/api/v1/borrower/progress', allowed: BORROWERS, success: 200 },
  { key: '7 PUT /borrower/profile', method: 'put', path: () => '/api/v1/borrower/profile', body: (id) => profiles[id] ?? ELIGIBLE_PROFILE, allowed: BORROWERS, success: 200 },
  { key: '8 POST /borrower/salary-slip', method: 'post', path: () => '/api/v1/borrower/salary-slip', pdf: true, allowed: BORROWERS, success: 201 },
  { key: '9 GET /borrower/salary-slip', method: 'get', path: () => '/api/v1/borrower/salary-slip', allowed: BORROWERS, success: 200 },
  { key: '11 POST /borrower/loans', method: 'post', path: () => '/api/v1/borrower/loans', body: () => LOAN_REQUEST, allowed: BORROWERS, success: 201 },
  { key: '12 GET /borrower/loans', method: 'get', path: () => '/api/v1/borrower/loans', allowed: BORROWERS, success: 200 },
  { key: '13 GET /borrower/loans/:own', method: 'get', path: (id) => `/api/v1/borrower/loans/${anyLoanFor(id)}`, allowed: BORROWERS, success: 200 },
  { key: '13a GET /borrower/loans/:otherBorrower', method: 'get', path: (id) => `/api/v1/borrower/loans/${id === 'BORROWER' ? ownLoan.BORROWER2 : ownLoan.BORROWER}`, allowed: BORROWERS, success: 200, allowedStatus: 404 },
  { key: '13b GET /borrower/loans/:unknown', method: 'get', path: () => `/api/v1/borrower/loans/${UNKNOWN_ID}`, allowed: BORROWERS, success: 200, allowedStatus: 404 },
  { key: '13c GET /borrower/loans/:malformed', method: 'get', path: () => '/api/v1/borrower/loans/123', allowed: BORROWERS, success: 200, allowedStatus: 400 },
  { key: '10 GET /loans/:id/salary-slip', method: 'get', path: (id) => `/api/v1/loans/${id === 'SANCTION' || id === 'ADMIN' ? readApplied.loanId : anyLoanFor(id)}/salary-slip`, allowed: ['SANCTION', 'ADMIN'], success: 200 },
  { key: '10a GET /loans/:unknown/salary-slip', method: 'get', path: () => `/api/v1/loans/${UNKNOWN_ID}/salary-slip`, allowed: ['SANCTION', 'ADMIN'], success: 200, allowedStatus: 404 },
  { key: '14 GET /loans', method: 'get', path: () => '/api/v1/loans', allowed: STAFF_READ, success: 200 },
  { key: '15 GET /loans/:id', method: 'get', path: (id) => `/api/v1/loans/${staffReadLoan(id)}`, allowed: STAFF_READ, success: 200 },
  { key: '15a GET /loans/:outOfScope', method: 'get', path: (id) => `/api/v1/loans/${id === 'SANCTION' ? readDisbursed.loanId : id === 'DISBURSEMENT' ? readApplied.loanId : id === 'COLLECTION' ? readSanctioned.loanId : UNKNOWN_ID}`, allowed: STAFF_READ, success: 200, allowedStatus: 404 },
  { key: '15b GET /loans/:unknown', method: 'get', path: () => `/api/v1/loans/${UNKNOWN_ID}`, allowed: STAFF_READ, success: 200, allowedStatus: 404 },
  { key: '15c GET /loans/:malformed', method: 'get', path: () => '/api/v1/loans/zzz', allowed: STAFF_READ, success: 200, allowedStatus: 400 },
  { key: '16 POST /loans/:id/approve', method: 'post', path: (id) => `/api/v1/loans/${id === 'SANCTION' || id === 'ADMIN' ? approveLoans[id].loanId : anyLoanFor(id)}/approve`, body: () => ({ note: 'Looks good' }), allowed: ['SANCTION', 'ADMIN'], success: 200 },
  { key: '16a POST /loans/:unknown/approve', method: 'post', path: () => `/api/v1/loans/${UNKNOWN_ID}/approve`, body: () => ({}), allowed: ['SANCTION', 'ADMIN'], success: 200, allowedStatus: 404 },
  { key: '17 POST /loans/:id/reject', method: 'post', path: (id) => `/api/v1/loans/${id === 'SANCTION' || id === 'ADMIN' ? rejectLoans[id].loanId : anyLoanFor(id)}/reject`, body: () => ({ reason: 'Salary slip unreadable' }), allowed: ['SANCTION', 'ADMIN'], success: 200 },
  { key: '17a POST /loans/:unknown/reject', method: 'post', path: () => `/api/v1/loans/${UNKNOWN_ID}/reject`, body: () => ({ reason: 'Salary slip unreadable' }), allowed: ['SANCTION', 'ADMIN'], success: 200, allowedStatus: 404 },
  { key: '18 POST /loans/:id/disburse', method: 'post', path: (id) => `/api/v1/loans/${id === 'DISBURSEMENT' || id === 'ADMIN' ? disburseLoans[id].loanId : anyLoanFor(id)}/disburse`, allowed: ['DISBURSEMENT', 'ADMIN'], success: 200 },
  { key: '18a POST /loans/:unknown/disburse', method: 'post', path: () => `/api/v1/loans/${UNKNOWN_ID}/disburse`, allowed: ['DISBURSEMENT', 'ADMIN'], success: 200, allowedStatus: 404 },
  { key: '19 GET /loans/:id/payments', method: 'get', path: (id) => `/api/v1/loans/${id === 'COLLECTION' || id === 'ADMIN' ? readDisbursed.loanId : anyLoanFor(id)}/payments`, allowed: ['COLLECTION', 'ADMIN'], success: 200 },
  { key: '19a GET /loans/:unknown/payments', method: 'get', path: () => `/api/v1/loans/${UNKNOWN_ID}/payments`, allowed: ['COLLECTION', 'ADMIN'], success: 200, allowedStatus: 404 },
  { key: '20 POST /loans/:id/payments', method: 'post', path: (id) => `/api/v1/loans/${id === 'COLLECTION' || id === 'ADMIN' ? readDisbursed.loanId : anyLoanFor(id)}/payments`, body: () => { paymentCounter += 1; return { utr: `MATRIXUTR${paymentCounter}00`, amount: 100_000, paymentDate: today }; }, allowed: ['COLLECTION', 'ADMIN'], success: 201 },
  { key: '20a POST /loans/:unknown/payments', method: 'post', path: () => `/api/v1/loans/${UNKNOWN_ID}/payments`, body: () => { paymentCounter += 1; return { utr: `MATRIXUTR${paymentCounter}00`, amount: 100_000, paymentDate: today }; }, allowed: ['COLLECTION', 'ADMIN'], success: 201, allowedStatus: 404 },
  { key: '21 GET /leads', method: 'get', path: () => '/api/v1/leads', allowed: ['SALES', 'ADMIN'], success: 200 },
  { key: '22 GET /dashboard/summary', method: 'get', path: () => '/api/v1/dashboard/summary', allowed: ['ADMIN'], success: 200 },
  { key: '23 GET /admin/users', method: 'get', path: () => '/api/v1/admin/users', allowed: ['ADMIN'], success: 200 },
  { key: '24 POST /admin/users', method: 'post', path: () => '/api/v1/admin/users', body: (id) => ({ name: 'New Staff', email: `new.staff.${id.toLowerCase()}@test.dev`, password: 'Test@1234', role: 'SANCTION' }), allowed: ['ADMIN'], success: 201 },
  { key: '25 PATCH /admin/users/:id/role', method: 'patch', path: () => `/api/v1/admin/users/${convertTarget.id}/role`, body: () => ({ role: 'SALES' }), allowed: ['ADMIN'], success: 200 },
  { key: '25a PATCH /admin/users/:unknown/role', method: 'patch', path: () => `/api/v1/admin/users/${UNKNOWN_ID}/role`, body: () => ({ role: 'SALES' }), allowed: ['ADMIN'], success: 200, allowedStatus: 404 },
];

function expectedFor(row: Row, id: Identity): number {
  if (row.allowed === 'PUBLIC') return row.success;
  if (id === 'ANON') return 401;
  if (row.allowed === 'ANY_AUTH') return row.success;
  return row.allowed.includes(id) ? (row.allowedStatus ?? row.success) : 403;
}

const results: { row: string; id: Identity; expected: number; actual: number; code: string; rec: Recorded }[] = [];
for (const row of rows) {
  for (const id of IDS) {
    const rec = await call(app, row.method, row.path(id), {
      label: row.key,
      identity: id,
      cookie: cookieOf(id),
      body: row.body?.(id),
      attach: row.pdf ? { buffer: SAMPLE_FILES.pdf, filename: 'slip.pdf', contentType: 'application/pdf' } : undefined,
    });
    if (row.key.startsWith('11 ') && rec.status === 201) {
      ownLoan[id] = (rec.json as { data: { loan: { id: string } } }).data.loan.id;
    }
    const code = (rec.json as { error?: { code?: string } } | null)?.error?.code ?? '';
    results.push({ row: row.key, id, expected: expectedFor(row, id), actual: rec.status, code, rec });
  }
}

const mismatches = results.filter((r) => r.expected !== r.actual);
const header = `| Route | ${IDS.join(' | ')} |\n| --- | ${IDS.map(() => '---').join(' | ')} |`;
const lines = rows.map((row) => {
  const cells = IDS.map((id) => {
    const r = results.find((x) => x.row === row.key && x.id === id);
    if (!r) return '?';
    return r.expected === r.actual ? `${r.actual}` : `**exp ${r.expected} / got ${r.actual}**`;
  });
  return `| ${row.key.replace(/^\S+ /, (m) => m)} | ${cells.join(' | ')} |`;
});
const table = `${header}\n${lines.join('\n')}`;
writeFileSync(`${OUT}/b4-table.md`, table);
console.log(table);
console.log(`\ncells: ${results.length}, mismatches: ${mismatches.length}`);
for (const m of mismatches) console.log('MISMATCH', m.row, m.id, 'expected', m.expected, 'got', m.actual, m.code, m.rec.text.slice(0, 200));
await teardown(`${OUT}/b4.json`);
