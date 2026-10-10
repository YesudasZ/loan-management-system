// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B9: error envelope on every error, status codes vs docs/API.md, pagination limits on every list.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { badEnvelopes, call, createTestUser, log, scanForHashes, setup, teardown, type Recorded } from './b-harness.js';
import { createDisbursedLoan, createStaff } from '../tests/helpers/loans.js';
import { ELIGIBLE_PROFILE, SAMPLE_FILES } from '../tests/helpers/borrower.js';
import { toBusinessDate } from '../src/utils/dates.js';

const OUT = '/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad';
const app = await setup();
const staff = await createStaff();
const results: { label: string; exp: string; got: string }[] = [];
const code = (r: Recorded) => (r.json as { error?: { code: string } } | null)?.error?.code ?? '';
const check = (label: string, expStatus: number, r: Recorded, expCode = '') =>
  results.push({ label, exp: `${expStatus} ${expCode}`.trim(), got: `${r.status} ${expCode ? code(r) : ''}`.trim() + (expCode ? '' : ` (${code(r)})`).replace(' ()', '') });

// ---- data so every list has something in it
const disbursed = await createDisbursedLoan(app, staff);
await call(app, 'post', `/api/v1/loans/${disbursed.loanId}/payments`, { label: 'pay', identity: 'COLLECTION', cookie: staff.COLLECTION.cookie, body: { utr: 'B9UTR000001', amount: 100_000, paymentDate: toBusinessDate() } });
const lead = await createTestUser('BORROWER', 'lead.b9@test.dev');
void lead;

// ---- 1. pagination on all 5 list endpoints
const lists: { name: string; path: string; cookie: string }[] = [
  { name: 'BORROWER GET /borrower/loans', path: '/api/v1/borrower/loans', cookie: disbursed.borrower.cookie },
  { name: 'ADMIN GET /loans', path: '/api/v1/loans', cookie: staff.ADMIN.cookie },
  { name: 'COLLECTION GET /loans', path: '/api/v1/loans', cookie: staff.COLLECTION.cookie },
  { name: 'COLLECTION GET /loans/:id/payments', path: `/api/v1/loans/${disbursed.loanId}/payments`, cookie: staff.COLLECTION.cookie },
  { name: 'SALES GET /leads', path: '/api/v1/leads', cookie: staff.SALES.cookie },
  { name: 'ADMIN GET /admin/users', path: '/api/v1/admin/users', cookie: staff.ADMIN.cookie },
];
const bad = ['limit=101', 'limit=0', 'limit=-1', 'limit=abc', 'limit=1.5', 'limit=', 'limit=%20', 'limit=1&limit=2',
  'page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=', 'unknownParam=1', 'limit[$gt]=0', 'PAGE=1'];
const good = ['', 'limit=100', 'page=1&limit=1', 'page=2&limit=1', 'limit=1e2', 'page=9007199254740991'];
const paginationRows: string[] = [];
for (const list of lists) {
  const cells: string[] = [];
  for (const q of bad) {
    const r = await call(app, 'get', `${list.path}?${q}`, { label: `pg ${q}`, identity: list.name, cookie: list.cookie });
    check(`${list.name} ?${q}`, 400, r, 'VALIDATION_ERROR');
    cells.push(String(r.status));
  }
  for (const q of good) {
    const r = await call(app, 'get', `${list.path}${q ? `?${q}` : ''}`, { label: `pg ${q}`, identity: list.name, cookie: list.cookie });
    check(`${list.name} ?${q}`, 200, r);
    const p = (r.json as { data?: { pagination?: { page: number; limit: number } } } | null)?.data?.pagination;
    cells.push(`${r.status}${p ? ` p${p.page}/l${p.limit}` : ''}`);
  }
  paginationRows.push(`| ${list.name} | ${cells.join(' | ')} |`);
}
const defaults = log.filter((e) => e.label === 'pg ' && e.status === 200).map((e) => (e.json as { data: { pagination: { page: number; limit: number } } }).data.pagination);
results.push({ label: 'defaults are page 1, limit 20 on every list', exp: 'true', got: String(defaults.length === lists.length && defaults.every((p) => p.page === 1 && p.limit === 20)) });
// GET /loans also takes ?status
check('ADMIN GET /loans?status=PENDING', 400, await call(app, 'get', '/api/v1/loans?status=PENDING', { label: 'status', identity: 'ADMIN', cookie: staff.ADMIN.cookie }), 'VALIDATION_ERROR');
check('ADMIN GET /admin/users?role=GOD', 400, await call(app, 'get', '/api/v1/admin/users?role=GOD', { label: 'role', identity: 'ADMIN', cookie: staff.ADMIN.cookie }), 'VALIDATION_ERROR');
check('ADMIN GET /admin/users?search=<101 chars>', 400, await call(app, 'get', `/api/v1/admin/users?search=${'a'.repeat(101)}`, { label: 'search', identity: 'ADMIN', cookie: staff.ADMIN.cookie }), 'VALIDATION_ERROR');

// ---- 2. one request per documented error code / transport error
const adminCookie = staff.ADMIN.cookie;
check('unknown route GET /api/v1/nope', 404, await call(app, 'get', '/api/v1/nope', { label: '404', identity: 'ANON' }), 'NOT_FOUND');
check('unknown method DELETE /api/v1/loans', 404, await call(app, 'delete', '/api/v1/loans', { label: '404m', identity: 'ADMIN', cookie: adminCookie }), 'NOT_FOUND');
check('unknown route outside /api', 404, await call(app, 'get', '/nope', { label: '404o', identity: 'ANON' }), 'NOT_FOUND');
check('invalid JSON', 400, await call(app, 'post', '/api/v1/auth/login', { label: 'badjson', identity: 'ANON', rawBody: { data: '{bad', contentType: 'application/json' } }), 'INVALID_JSON');
check('JSON body over 100 kb', 413, await call(app, 'post', '/api/v1/auth/login', { label: 'big', identity: 'ANON', rawBody: { data: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(110_000) }), contentType: 'application/json' } }), 'PAYLOAD_TOO_LARGE');
check('JSON with charset=utf-7 (body-parser 415 charset.unsupported)', 415, await call(app, 'post', '/api/v1/auth/login', { label: 'charset', identity: 'ANON', rawBody: { data: '{}', contentType: 'application/json; charset=utf-7' } }));
check('JSON with Content-Encoding: x-unknown (415 encoding.unsupported)', 415, await call(app, 'post', '/api/v1/auth/login', { label: 'enc', identity: 'ANON', headers: { 'Content-Encoding': 'x-unknown' }, rawBody: { data: '{}', contentType: 'application/json' } }));
check('JSON with Content-Encoding: gzip but plain bytes', 400, await call(app, 'post', '/api/v1/auth/login', { label: 'gzipbad', identity: 'ANON', headers: { 'Content-Encoding': 'gzip' }, rawBody: { data: '{"email":"a@b.co"}', contentType: 'application/json' } }));
const gz = gzipSync(Buffer.from(JSON.stringify({ email: 'nobody@test.dev', password: 'Password@123' }))).toString('latin1');
check('valid gzip JSON login (unknown user)', 401, await call(app, 'post', '/api/v1/auth/login', { label: 'gzipok', identity: 'ANON', headers: { 'Content-Encoding': 'gzip' }, rawBody: { data: gz, contentType: 'application/json' } }), 'INVALID_CREDENTIALS');
check('malformed %-encoding in a path param', 400, await call(app, 'get', '/api/v1/borrower/loans/%E0%A4%A', { label: 'pct', identity: 'BORROWER', cookie: disbursed.borrower.cookie }));
check('malformed %-encoding in a path param (anonymous)', 401, await call(app, 'get', '/api/v1/loans/%E0%A4%A', { label: 'pct anon', identity: 'ANON' }));
check('malformed %-encoding in the query string', 400, await call(app, 'get', '/api/v1/admin/users?search=%E0%A4%A', { label: 'pctq', identity: 'ADMIN', cookie: adminCookie }));
check('text/plain body on login', 400, await call(app, 'post', '/api/v1/auth/login', { label: 'text', identity: 'ANON', rawBody: { data: 'email=a', contentType: 'text/plain' } }), 'VALIDATION_ERROR');
check('JSON array body on login', 400, await call(app, 'post', '/api/v1/auth/login', { label: 'array', identity: 'ANON', rawBody: { data: '[]', contentType: 'application/json' } }), 'VALIDATION_ERROR');
check('JSON null body on login (strict mode rejects non-objects)', 400, await call(app, 'post', '/api/v1/auth/login', { label: 'null', identity: 'ANON', rawBody: { data: 'null', contentType: 'application/json' } }));
check('no cookie', 401, await call(app, 'get', '/api/v1/auth/me', { label: '401', identity: 'ANON' }), 'UNAUTHENTICATED');
const badCookie = await call(app, 'get', '/api/v1/auth/me', { label: '401b', identity: 'ANON', cookie: 'lms_token=not.a.jwt' });
check('invalid cookie', 401, badCookie, 'UNAUTHENTICATED');
check('wrong password', 401, await call(app, 'post', '/api/v1/auth/login', { label: 'wrongpw', identity: 'ANON', body: { email: 'admin@test.dev', password: 'Wrong@1234' } }), 'INVALID_CREDENTIALS');
check('wrong role', 403, await call(app, 'get', '/api/v1/dashboard/summary', { label: '403', identity: 'SALES', cookie: staff.SALES.cookie }), 'FORBIDDEN');
check('bad Origin', 403, await call(app, 'post', '/api/v1/auth/logout', { label: 'origin', identity: 'ANON', headers: { Origin: 'https://evil.example' }, body: {} }), 'INVALID_ORIGIN');
check('duplicate signup email', 409, await call(app, 'post', '/api/v1/auth/signup', { label: 'dup', identity: 'ANON', body: { name: 'Dup User', email: 'admin@test.dev', password: 'Test@1234' } }), 'EMAIL_ALREADY_REGISTERED');
// borrower-side errors
const fresh = await createTestUser('BORROWER', 'fresh.b9@test.dev');
check('slip before profile', 409, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'slip-noprof', identity: 'BORROWER', cookie: fresh.cookie, attach: { buffer: SAMPLE_FILES.pdf, filename: 's.pdf', contentType: 'application/pdf' } }), 'PROFILE_INCOMPLETE');
check('apply before profile', 409, await call(app, 'post', '/api/v1/borrower/loans', { label: 'apply-noprof', identity: 'BORROWER', cookie: fresh.cookie, body: { principal: 10_000_000, tenureDays: 90 } }), 'PROFILE_INCOMPLETE');
check('own slip before upload', 404, await call(app, 'get', '/api/v1/borrower/salary-slip', { label: 'slip404', identity: 'BORROWER', cookie: fresh.cookie }), 'NOT_FOUND');
const brefail = await call(app, 'put', '/api/v1/borrower/profile', { label: 'bre', identity: 'BORROWER', cookie: fresh.cookie, body: { ...ELIGIBLE_PROFILE, monthlySalary: 100, employmentMode: 'UNEMPLOYED' } });
check('profile failing the BRE', 422, brefail, 'BRE_FAILED');
const breDetails = (brefail.json as { error?: { details?: { failures?: { rule: string; message: string }[] } } }).error?.details;
results.push({ label: 'BRE_FAILED details = { failures: [{ rule, message }] }', exp: 'true', got: String(Array.isArray(breDetails?.failures) && breDetails.failures.length >= 2 && breDetails.failures.every((f) => typeof f.rule === 'string' && typeof f.message === 'string')) });
await call(app, 'put', '/api/v1/borrower/profile', { label: 'ok profile', identity: 'BORROWER', cookie: fresh.cookie, body: ELIGIBLE_PROFILE });
check('upload without a file', 400, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'nofile', identity: 'BORROWER', cookie: fresh.cookie, rawBody: { data: '', contentType: 'multipart/form-data; boundary=x' } }));
check('upload, empty multipart', 400, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'nofile2', identity: 'BORROWER', cookie: fresh.cookie, rawBody: { data: '--x--\r\n', contentType: 'multipart/form-data; boundary=x' } }));
check('upload, JSON instead of multipart', 400, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'nofile3', identity: 'BORROWER', cookie: fresh.cookie, body: {} }), 'FILE_REQUIRED');
const wrongField = '--x\r\nContent-Disposition: form-data; name="doc"; filename="s.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n%%EOF\n\r\n--x--\r\n';
check('upload in the wrong field', 400, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'field', identity: 'BORROWER', cookie: fresh.cookie, rawBody: { data: wrongField, contentType: 'multipart/form-data; boundary=x' } }), 'INVALID_UPLOAD');
check('upload over 5 MB', 413, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'big', identity: 'BORROWER', cookie: fresh.cookie, attach: { buffer: SAMPLE_FILES.oversizedPdf, filename: 's.pdf', contentType: 'application/pdf' } }), 'FILE_TOO_LARGE');
check('upload HTML', 415, await call(app, 'post', '/api/v1/borrower/salary-slip', { label: 'html', identity: 'BORROWER', cookie: fresh.cookie, attach: { buffer: SAMPLE_FILES.text, filename: 's.pdf', contentType: 'application/pdf' } }), 'UNSUPPORTED_FILE_TYPE');
check('apply without a slip', 409, await call(app, 'post', '/api/v1/borrower/loans', { label: 'apply-noslip', identity: 'BORROWER', cookie: fresh.cookie, body: { principal: 10_000_000, tenureDays: 90 } }), 'PROFILE_INCOMPLETE');
check('second apply while active', 409, await call(app, 'post', '/api/v1/borrower/loans', { label: 'apply2', identity: 'BORROWER', cookie: disbursed.borrower.cookie, body: { principal: 10_000_000, tenureDays: 90 } }), 'ACTIVE_LOAN_EXISTS');
check('profile edit while active', 409, await call(app, 'put', '/api/v1/borrower/profile', { label: 'prof-active', identity: 'BORROWER', cookie: disbursed.borrower.cookie, body: ELIGIBLE_PROFILE }), 'ACTIVE_LOAN_EXISTS');
check('principal below the minimum', 400, await call(app, 'post', '/api/v1/borrower/loans', { label: 'minp', identity: 'BORROWER', cookie: fresh.cookie, body: { principal: 1, tenureDays: 90 } }), 'VALIDATION_ERROR');
// staff-side errors
check('approve a DISBURSED loan', 409, await call(app, 'post', `/api/v1/loans/${disbursed.loanId}/approve`, { label: 'approve409', identity: 'ADMIN', cookie: adminCookie, body: {} }), 'INVALID_STATUS_TRANSITION');
check('reject with a 2-char reason', 400, await call(app, 'post', `/api/v1/loans/${disbursed.loanId}/reject`, { label: 'reason', identity: 'ADMIN', cookie: adminCookie, body: { reason: 'no' } }), 'VALIDATION_ERROR');
check('duplicate UTR', 409, await call(app, 'post', `/api/v1/loans/${disbursed.loanId}/payments`, { label: 'dupUTR', identity: 'COLLECTION', cookie: staff.COLLECTION.cookie, body: { utr: 'b9utr000001', amount: 100, paymentDate: toBusinessDate() } }), 'DUPLICATE_UTR');
const overpay = await call(app, 'post', `/api/v1/loans/${disbursed.loanId}/payments`, { label: 'overpay', identity: 'COLLECTION', cookie: staff.COLLECTION.cookie, body: { utr: 'B9UTR000002', amount: 999_999_999, paymentDate: '2999-01-01' } });
check('overpay + future date', 422, overpay, 'PAYMENT_RULES_FAILED');
const payDetails = (overpay.json as { error?: { details?: { failures?: unknown[] } } }).error?.details;
results.push({ label: 'PAYMENT_RULES_FAILED details.failures lists both rules', exp: 'true', got: String(Array.isArray(payDetails?.failures) && payDetails.failures.length === 2) });
check('PATCH own role', 409, await call(app, 'patch', `/api/v1/admin/users/${staff.ADMIN.id}/role`, { label: 'own', identity: 'ADMIN', cookie: adminCookie, body: { role: 'SALES' } }), 'CANNOT_CHANGE_OWN_ROLE');
check('PATCH unknown user', 404, await call(app, 'patch', `/api/v1/admin/users/${'0'.repeat(24)}/role`, { label: 'unk', identity: 'ADMIN', cookie: adminCookie, body: { role: 'SALES' } }), 'NOT_FOUND');

// ---- 3. 429 on a second app with tiny limits
const tiny = { windowMs: 60_000, limit: 1 };
const limitedApp = createApp({ authRateLimits: { login: tiny, signup: tiny, session: tiny } });
await call(limitedApp, 'post', '/api/v1/auth/login', { label: 'rl1', identity: 'ANON', body: { email: 'x@test.dev', password: 'Wrong@1234' } });
check('second failed login with limit 1', 429, await call(limitedApp, 'post', '/api/v1/auth/login', { label: 'rl2', identity: 'ANON', body: { email: 'x@test.dev', password: 'Wrong@1234' } }), 'RATE_LIMITED');
await call(limitedApp, 'get', '/api/v1/auth/me', { label: 'rl3', identity: 'ADMIN', cookie: adminCookie });
check('second /auth/me with limit 1', 429, await call(limitedApp, 'get', '/api/v1/auth/me', { label: 'rl4', identity: 'ADMIN', cookie: adminCookie }), 'RATE_LIMITED');

// ---- 4. database down
await mongoose.disconnect();
check('GET /health with the database down', 503, await call(app, 'get', '/health', { label: 'h503', identity: 'ANON' }), 'DATABASE_UNAVAILABLE');
const t0 = Date.now();
const meDown = await call(app, 'get', '/api/v1/auth/me', { label: 'me-down', identity: 'ADMIN', cookie: adminCookie });
const meDownMs = Date.now() - t0;
check(`GET /auth/me with the database down (valid cookie, ${meDownMs} ms)`, 500, meDown);
const cleared = log.at(-1);
void cleared;

// ---- results
const prior: Recorded[] = [];
for (const name of ['b2', 'b3', 'b4', 'b5', 'b6', 'b7']) {
  const file = `${OUT}/${name}.json`;
  if (existsSync(file)) prior.push(...(JSON.parse(readFileSync(file, 'utf8')) as Recorded[]));
}
const all = [...prior, ...log];
const errors = all.filter((e) => e.status >= 400);
const envelopeFails = badEnvelopes(all);
const statusCounts = new Map<string, number>();
for (const e of errors) statusCounts.set(`${e.status} ${code(e)}`, (statusCounts.get(`${e.status} ${code(e)}`) ?? 0) + 1);

for (const r of results) console.log(`${r.exp === r.got ? 'PASS' : 'FAIL'}  ${r.label.padEnd(72)} exp ${r.exp} got ${r.got}`);
console.log(`\n${results.filter((r) => r.exp === r.got).length}/${results.length} passed`);
console.log(`\nenvelope: ${errors.length} error responses (b2–b7 + b9), ${envelopeFails.length} not matching`);
for (const e of envelopeFails) console.log('  BAD', e.identity, e.method, e.path, e.status, e.contentType, e.text.slice(0, 150));
console.log('error status/code counts:', JSON.stringify([...statusCounts].sort()));
console.log(`hash scan over b9: ${scanForHashes(log).length} hits`);
console.log('\npagination rows (bad: ' + bad.join(' , ') + ' | good: ' + good.map((g) => g || '(none)').join(' , ') + ')');
console.log(paginationRows.join('\n'));
console.log('\nme-down response:', meDown.status, meDown.text.slice(0, 200));
for (const e of log.filter((x) => ['charset', 'enc', 'gzipbad', 'pct', 'pct anon', 'pctq', 'null', 'nofile', 'nofile2'].includes(x.label))) console.log(`${e.label}: ${e.status} ${e.text.slice(0, 160)}`);
await teardown(`${OUT}/b9.json`).catch(() => undefined);
process.exit(0);
