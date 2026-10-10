// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B5: IDOR — borrower B tries to read/change borrower A's profile, slip, loans, payments.
import { call, createTestUser, setup, teardown, type Recorded } from './b-harness.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, SAMPLE_FILES } from '../tests/helpers/borrower.js';
import { createStaff } from '../tests/helpers/loans.js';
import { toBusinessDate } from '../src/utils/dates.js';

const OUT = '/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad';
const app = await setup();
const staff = await createStaff();
const A = await createTestUser('BORROWER', 'idor.alice@test.dev');
const B = await createTestUser('BORROWER', 'idor.bob@test.dev');
const PROFILE_A = { ...ELIGIBLE_PROFILE, fullName: 'Alice Owner', pan: 'AAAAA1111A' };
const PROFILE_B = { ...ELIGIBLE_PROFILE, fullName: 'Bob Intruder', pan: 'BBBBB2222B' };
const png = { buffer: SAMPLE_FILES.png, filename: 'slip.png', contentType: 'image/png' };
const pdf = { buffer: SAMPLE_FILES.pdf, filename: 'slip.pdf', contentType: 'application/pdf' };

const results: { label: string; expected: string; ok: boolean; status: number; note: string }[] = [];
const check = (label: string, r: Recorded, expectedStatus: number, extra: (r: Recorded) => [boolean, string] = () => [true, '']) => {
  const [extraOk, note] = extra(r);
  const ok = r.status === expectedStatus && extraOk;
  results.push({ label, expected: String(expectedStatus), ok, status: r.status, note });
};
const asA = (label: string, method: 'get' | 'post' | 'put', path: string, o: object = {}) => call(app, method, path, { label, identity: 'A', cookie: A.cookie, ...o });
const asB = (label: string, method: 'get' | 'post' | 'put' | 'patch', path: string, o: object = {}) => call(app, method, path, { label, identity: 'B', cookie: B.cookie, ...o });

// A: profile + PNG slip + apply, then sanction, disburse and one payment.
await asA('A profile', 'put', '/api/v1/borrower/profile', { body: PROFILE_A });
await asA('A slip', 'post', '/api/v1/borrower/salary-slip', { attach: png });
const applyA = await asA('A apply', 'post', '/api/v1/borrower/loans', { body: LOAN_REQUEST });
const loanA = (applyA.json as { data: { loan: { id: string } } }).data.loan.id;
await call(app, 'post', `/api/v1/loans/${loanA}/approve`, { label: 'approve A', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: {} });
await call(app, 'post', `/api/v1/loans/${loanA}/disburse`, { label: 'disburse A', identity: 'DISBURSEMENT', cookie: staff.DISBURSEMENT.cookie });
await call(app, 'post', `/api/v1/loans/${loanA}/payments`, { label: 'pay A', identity: 'COLLECTION', cookie: staff.COLLECTION.cookie, body: { utr: 'ALICEUTR0001', amount: 123_456, paymentDate: toBusinessDate() } });
const aBefore = await asA('A progress before', 'get', '/api/v1/borrower/progress');

// B: writes that try to target A.
check('B PUT profile with userId=A', await asB('B PUT profile + userId', 'put', '/api/v1/borrower/profile', { body: { ...PROFILE_B, userId: A.id } }), 400);
check('B PUT profile with borrowerId=A', await asB('B PUT profile + borrowerId', 'put', '/api/v1/borrower/profile', { body: { ...PROFILE_B, borrowerId: A.id } }), 400);
check('B PUT profile with _id=A', await asB('B PUT profile + _id', 'put', '/api/v1/borrower/profile', { body: { ...PROFILE_B, _id: A.id } }), 400);
check('B PUT own profile (no ids)', await asB('B PUT profile', 'put', '/api/v1/borrower/profile', { body: PROFILE_B }), 200);
check('B upload slip with extra field userId=A', await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'B slip + field', identity: 'B', cookie: B.cookie, attach: pdf, headers: {} }).then(async () => {
  // supertest: attach + field needs the raw API; emulate by a second request with a field
  const request = (await import('supertest')).default;
  const res = await request(app).post('/api/v1/borrower/salary-slip').set('Cookie', B.cookie).field('userId', A.id).attach('file', pdf.buffer, { filename: 'slip.pdf', contentType: 'application/pdf' });
  return { label: 'B slip + userId field', identity: 'B', method: 'POST', path: '/api/v1/borrower/salary-slip', status: res.status, contentType: String(res.headers['content-type']), text: JSON.stringify(res.body), json: res.body } as Recorded;
}), 400);
check('B POST /borrower/loans with borrowerId=A', await asB('B apply + borrowerId', 'post', '/api/v1/borrower/loans', { body: { ...LOAN_REQUEST, borrowerId: A.id } }), 400);
const applyB = await asB('B apply', 'post', '/api/v1/borrower/loans', { body: LOAN_REQUEST });
check('B apply own loan', applyB, 201);
const loanB = (applyB.json as { data: { loan: { id: string } } }).data.loan.id;

// B: reads that try to reach A.
const leaks = (r: Recorded): [boolean, string] => {
  const hits = [A.id, loanA, 'AAAAA1111A', 'Alice Owner', A.email, 'ALICEUTR0001', '123456'].filter((s) => r.text.includes(s));
  return [hits.length === 0, hits.length ? `LEAK: ${hits.join(',')}` : 'no A data'];
};
check('B GET progress', await asB('B progress', 'get', '/api/v1/borrower/progress'), 200, leaks);
check('B GET progress?userId=A&borrowerId=A', await asB('B progress ?userId', 'get', `/api/v1/borrower/progress?userId=${A.id}&borrowerId=${A.id}`), 200, leaks);
const slipB = await asB('B slip', 'get', '/api/v1/borrower/salary-slip');
check('B GET slip returns B\'s PDF, not A\'s PNG', slipB, 200, (r) => [r.contentType.startsWith('application/pdf') && r.text.startsWith('%PDF'), r.contentType]);
const slipB2 = await asB('B slip ?userId', 'get', `/api/v1/borrower/salary-slip?userId=${A.id}&loanId=${loanA}`);
check('B GET slip?userId=A&loanId=A still B\'s PDF', slipB2, 200, (r) => [r.contentType.startsWith('application/pdf'), r.contentType]);
check('B GET /borrower/loans', await asB('B loans', 'get', '/api/v1/borrower/loans'), 200, (r) => {
  const items = (r.json as { data: { items: { id: string }[] } }).data.items;
  const [ok, note] = leaks(r);
  return [ok && items.length === 1 && items[0]?.id === loanB, `${items.length} item(s); ${note}`];
});
check('B GET /borrower/loans?borrowerId=A', await asB('B loans ?borrowerId', 'get', `/api/v1/borrower/loans?borrowerId=${A.id}`), 400);
check('B GET /borrower/loans/:loanA', await asB('B loan A', 'get', `/api/v1/borrower/loans/${loanA}`), 404, leaks);
check('B GET /borrower/loans/:LOANA (uppercase hex)', await asB('B loan A upper', 'get', `/api/v1/borrower/loans/${loanA.toUpperCase()}`), 404, leaks);
check('A GET /borrower/loans/:LOANA (uppercase hex, own) — control', await asA('A loan A upper', 'get', `/api/v1/borrower/loans/${loanA.toUpperCase()}`), 200);
check('B GET /loans/:loanA (staff route)', await asB('B staff loan A', 'get', `/api/v1/loans/${loanA}`), 403, leaks);
check('B GET /loans/:loanA/salary-slip', await asB('B staff slip A', 'get', `/api/v1/loans/${loanA}/salary-slip`), 403, leaks);
check('B GET /loans/:loanA/payments', await asB('B payments A', 'get', `/api/v1/loans/${loanA}/payments`), 403, leaks);
check('B POST /loans/:loanA/payments', await asB('B pay A', 'post', `/api/v1/loans/${loanA}/payments`, { body: { utr: 'BOBUTR000001', amount: 100, paymentDate: toBusinessDate() } }), 403);
check('B GET /loans (staff list)', await asB('B staff list', 'get', '/api/v1/loans'), 403, leaks);
check('B GET /leads', await asB('B leads', 'get', '/api/v1/leads'), 403, leaks);
check('B GET /admin/users?search=alice', await asB('B users', 'get', '/api/v1/admin/users?search=alice'), 403, leaks);
check('B PATCH /admin/users/:A/role', await asB('B role A', 'patch', `/api/v1/admin/users/${A.id}/role`, { body: { role: 'SALES' } }), 403);
check('B GET /borrower/loans/:loanB (own) has no staff ids', await asB('B own loan', 'get', `/api/v1/borrower/loans/${loanB}`), 200, (r) => {
  const keys = (r.json as { data: { loan: { statusHistory: object[] } } }).data.loan.statusHistory.flatMap((e) => Object.keys(e));
  return [!keys.includes('by') && !r.text.includes(B.id) && !r.text.includes(staff.SANCTION.id), [...new Set(keys)].join(',')];
});

// A's data unchanged after all of B's attempts.
const aAfter = await asA('A progress after', 'get', '/api/v1/borrower/progress');
const strip = (r: Recorded) => JSON.stringify((r.json as { data: unknown }).data);
check('A progress unchanged after B\'s attempts', aAfter, 200, () => [strip(aBefore) === strip(aAfter), 'identical JSON']);
const aSlip = await asA('A slip', 'get', '/api/v1/borrower/salary-slip');
check('A slip is still A\'s PNG', aSlip, 200, (r) => [r.contentType.startsWith('image/png'), r.contentType]);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(58)} exp ${r.expected} got ${r.status}  ${r.note}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
await teardown(`${OUT}/b5.json`);
