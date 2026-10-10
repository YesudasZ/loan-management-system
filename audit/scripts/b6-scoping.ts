// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B6: executive scoping — reads outside the module's status → 404, wrong-state actions → 409.
import { call, setup, teardown, type Recorded } from './b-harness.js';
import {
  createAppliedLoan,
  createDisbursedLoan,
  createSanctionedLoan,
  createStaff,
  type StaffUsers,
} from '../tests/helpers/loans.js';
import type { Express } from 'express';
import { toBusinessDate } from '../src/utils/dates.js';

const OUT = '/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad';
const app = await setup();
const staff = await createStaff();
type Status = 'APPLIED' | 'SANCTIONED' | 'REJECTED' | 'DISBURSED' | 'CLOSED';
const STATUSES: Status[] = ['APPLIED', 'SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED'];
const UNKNOWN = '0123456789abcdef01234567';
let utr = 0;

async function loanIn(app: Express, staff: StaffUsers, status: Status): Promise<{ loanId: string; totalRepayment: number }> {
  if (status === 'APPLIED') return createAppliedLoan(app);
  if (status === 'SANCTIONED') return createSanctionedLoan(app, staff);
  if (status === 'DISBURSED') return createDisbursedLoan(app, staff);
  if (status === 'REJECTED') {
    const loan = await createAppliedLoan(app);
    await call(app, 'post', `/api/v1/loans/${loan.loanId}/reject`, { label: 'setup reject', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: { reason: 'Setup rejection' } });
    return loan;
  }
  const loan = await createDisbursedLoan(app, staff);
  utr += 1;
  const r = await call(app, 'post', `/api/v1/loans/${loan.loanId}/payments`, { label: 'setup close', identity: 'COLLECTION', cookie: staff.COLLECTION.cookie, body: { utr: `CLOSEUTR${utr}000`, amount: loan.totalRepayment, paymentDate: toBusinessDate() } });
  if ((r.json as { data: { loan: { status: string } } }).data.loan.status !== 'CLOSED') throw new Error('close setup failed');
  return loan;
}

const loans = {} as Record<Status, { loanId: string; totalRepayment: number }>;
for (const s of STATUSES) loans[s] = await loanIn(app, staff, s);

const results: { label: string; exp: number; got: number; code: string; msg: string }[] = [];
const rec = (label: string, exp: number, r: Recorded) => {
  const err = (r.json as { error?: { code: string; message: string } } | null)?.error;
  results.push({ label, exp, got: r.status, code: err?.code ?? '', msg: err?.message ?? '' });
};
const owned: Record<string, Status | null> = { SANCTION: 'APPLIED', DISBURSEMENT: 'SANCTIONED', COLLECTION: 'DISBURSED', ADMIN: null };

// Reads.
for (const role of ['SANCTION', 'DISBURSEMENT', 'COLLECTION', 'ADMIN'] as const) {
  const cookie = staff[role].cookie;
  for (const s of STATUSES) {
    const canSee = role === 'ADMIN' || owned[role] === s;
    rec(`${role} GET /loans/:${s}`, canSee ? 200 : 404, await call(app, 'get', `/api/v1/loans/${loans[s].loanId}`, { label: 'read', identity: role, cookie }));
    if (role === 'SANCTION' || role === 'ADMIN') {
      rec(`${role} GET /loans/:${s}/salary-slip`, canSee ? 200 : 404, await call(app, 'get', `/api/v1/loans/${loans[s].loanId}/salary-slip`, { label: 'slip', identity: role, cookie }));
    }
    if (role === 'COLLECTION' || role === 'ADMIN') {
      rec(`${role} GET /loans/:${s}/payments`, canSee ? 200 : 404, await call(app, 'get', `/api/v1/loans/${loans[s].loanId}/payments`, { label: 'payments', identity: role, cookie }));
    }
    const list = await call(app, 'get', `/api/v1/loans?status=${s}`, { label: 'list', identity: role, cookie });
    rec(`${role} GET /loans?status=${s}`, canSee ? 200 : 403, list);
    if (list.status === 200) {
      const statuses = (list.json as { data: { items: { status: string }[] } }).data.items.map((i) => i.status);
      if (statuses.some((x) => x !== s)) results.push({ label: `${role} list ?status=${s} returned other statuses`, exp: 0, got: 1, code: statuses.join(','), msg: '' });
    }
  }
  const all = await call(app, 'get', '/api/v1/loans', { label: 'list all', identity: role, cookie });
  const statuses = [...new Set((all.json as { data: { items: { status: string }[] } }).data.items.map((i) => i.status))].sort();
  const expected = role === 'ADMIN' ? [...STATUSES].sort() : [owned[role] as string];
  results.push({ label: `${role} GET /loans (no filter) statuses=${statuses.join(',')}`, exp: 1, got: JSON.stringify(statuses) === JSON.stringify(expected) ? 1 : 0, code: '', msg: '' });
}

// Wrong-state actions (each executive and ADMIN), and unknown ids.
const actions = [
  { name: 'approve', roles: ['SANCTION', 'ADMIN'] as const, from: 'APPLIED', body: { note: 'ok' } },
  { name: 'reject', roles: ['SANCTION', 'ADMIN'] as const, from: 'APPLIED', body: { reason: 'Not eligible now' } },
  { name: 'disburse', roles: ['DISBURSEMENT', 'ADMIN'] as const, from: 'SANCTIONED', body: undefined },
];
for (const action of actions) {
  for (const role of action.roles) {
    for (const s of STATUSES.filter((x) => x !== action.from)) {
      rec(`${role} ${action.name} ${s} loan`, 409, await call(app, 'post', `/api/v1/loans/${loans[s].loanId}/${action.name}`, { label: action.name, identity: role, cookie: staff[role].cookie, body: action.body }));
    }
    rec(`${role} ${action.name} unknown id`, 404, await call(app, 'post', `/api/v1/loans/${UNKNOWN}/${action.name}`, { label: action.name, identity: role, cookie: staff[role].cookie, body: action.body }));
  }
}
for (const role of ['COLLECTION', 'ADMIN'] as const) {
  for (const s of STATUSES.filter((x) => x !== 'DISBURSED')) {
    utr += 1;
    rec(`${role} pay ${s} loan`, 409, await call(app, 'post', `/api/v1/loans/${loans[s].loanId}/payments`, { label: 'pay', identity: role, cookie: staff[role].cookie, body: { utr: `WRONGUTR${utr}000`, amount: 100, paymentDate: toBusinessDate() } }));
  }
  utr += 1;
  rec(`${role} pay unknown id`, 404, await call(app, 'post', `/api/v1/loans/${UNKNOWN}/payments`, { label: 'pay', identity: role, cookie: staff[role].cookie, body: { utr: `WRONGUTR${utr}000`, amount: 100, paymentDate: toBusinessDate() } }));
}

// Double actions: sequential and concurrent.
const dbl = await createAppliedLoan(app);
rec('SANCTION approve #1', 200, await call(app, 'post', `/api/v1/loans/${dbl.loanId}/approve`, { label: 'a1', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: {} }));
rec('SANCTION approve #2 (double)', 409, await call(app, 'post', `/api/v1/loans/${dbl.loanId}/approve`, { label: 'a2', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: {} }));
rec('DISBURSEMENT disburse #1', 200, await call(app, 'post', `/api/v1/loans/${dbl.loanId}/disburse`, { label: 'd1', identity: 'DISBURSEMENT', cookie: staff.DISBURSEMENT.cookie }));
rec('DISBURSEMENT disburse #2 (double)', 409, await call(app, 'post', `/api/v1/loans/${dbl.loanId}/disburse`, { label: 'd2', identity: 'DISBURSEMENT', cookie: staff.DISBURSEMENT.cookie }));
const race = await createAppliedLoan(app);
const [r1, r2] = await Promise.all([
  call(app, 'post', `/api/v1/loans/${race.loanId}/approve`, { label: 'race approve', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: {} }),
  call(app, 'post', `/api/v1/loans/${race.loanId}/reject`, { label: 'race reject', identity: 'ADMIN', cookie: staff.ADMIN.cookie, body: { reason: 'Racing reject' } }),
]);
results.push({ label: `concurrent approve+reject → ${r1.status},${r2.status}`, exp: 1, got: [r1.status, r2.status].sort().join() === '200,409' ? 1 : 0, code: '', msg: '' });

// State unchanged after the 409s.
for (const s of STATUSES) {
  const r = await call(app, 'get', `/api/v1/loans/${loans[s].loanId}`, { label: 'after', identity: 'ADMIN', cookie: staff.ADMIN.cookie });
  const now = (r.json as { data: { loan: { status: string } } }).data.loan.status;
  results.push({ label: `${s} loan still ${s} after wrong-state attempts (is ${now})`, exp: 1, got: now === s ? 1 : 0, code: '', msg: '' });
}

for (const r of results) console.log(`${r.exp === r.got ? 'PASS' : 'FAIL'}  ${r.label.padEnd(52)} exp ${r.exp} got ${r.got} ${r.code} ${r.msg}`);
console.log(`\n${results.filter((r) => r.exp === r.got).length}/${results.length} passed`);
await teardown(`${OUT}/b6.json`);
