// Lens A: requirement-by-requirement walkthrough against createApp() + an in-memory replica set.
// Run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused \
//   JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 \
//   TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-a/a-req.ts
import request from 'supertest';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME } from '../src/config/constants.js';
import { UserModel } from '../src/models/user.model.js';
import { seedDemoData } from '../src/scripts/seed-demo.js';
import { startTestDatabase, stopTestDatabase } from '../tests/helpers/test-database.js';
import { SAMPLE_FILES } from '../tests/helpers/borrower.js';

const ORIGIN = 'http://localhost:3000';
let failures = 0;
function check(id: string, name: string, ok: boolean, detail: unknown = ''): void {
  if (!ok) failures += 1;
  const extra = detail === '' ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} [${id}] ${name}${extra}\n`);
}
function cookieOf(res: request.Response): string {
  const line = ((res.get('Set-Cookie') ?? []) as string[]).find((l) => l.startsWith(`${AUTH_COOKIE_NAME}=`));
  return line ? (line.split(';')[0] ?? '') : '';
}
const api = (p: string) => `/api/v1${p}`;

async function signup(app: Express, email: string) {
  const res = await request(app).post(api('/auth/signup')).set('Origin', ORIGIN)
    .send({ name: 'Audit A', email, password: 'Audit@12345' });
  return { res, cookie: cookieOf(res) };
}
async function login(app: Express, email: string, password: string) {
  const res = await request(app).post(api('/auth/login')).set('Origin', ORIGIN).send({ email, password });
  return { res, cookie: cookieOf(res) };
}
const put = (app: Express, p: string, c: string, b: object) =>
  request(app).put(api(p)).set('Cookie', c).set('Origin', ORIGIN).send(b);
const post = (app: Express, p: string, c: string, b: object = {}) =>
  request(app).post(api(p)).set('Cookie', c).set('Origin', ORIGIN).send(b);
const get = (app: Express, p: string, c: string) => request(app).get(api(p)).set('Cookie', c);
const upload = (app: Express, c: string, buf: Buffer, filename: string, contentType: string) =>
  request(app).post(api('/borrower/salary-slip')).set('Cookie', c).set('Origin', ORIGIN)
    .attach('file', buf, { filename, contentType });

function dobForAge(age: number, today = new Date()): string {
  // IST calendar date minus `age` years (birthday today).
  const ist = new Date(today.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear() - age;
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`).getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
const okProfile = { fullName: 'Audit Applicant', pan: 'ABCDE1234F', dateOfBirth: dobForAge(30), monthlySalary: 4_500_000, employmentMode: 'SALARIED' };

async function main(): Promise<void> {
  await startTestDatabase();
  const app = createApp();

  // ---------- Seed: one account per role, known credentials ----------
  const seeded = await seedDemoData();
  const roleAccounts: Record<string, string> = {
    ADMIN: 'admin@lms.dev', SALES: 'sales@lms.dev', SANCTION: 'sanction@lms.dev',
    DISBURSEMENT: 'disbursement@lms.dev', COLLECTION: 'collection@lms.dev', BORROWER: 'borrower@lms.dev',
  };
  const staff: Record<string, string> = {};
  for (const [role, email] of Object.entries(roleAccounts)) {
    const { res, cookie } = await login(app, email, 'Password@123');
    staff[role] = cookie;
    check('A0.53', `seed login ${email} → ${role}`, res.status === 200 && res.body.data.user.role === role, { status: res.status, role: res.body?.data?.user?.role });
  }
  check('A0.53', `seed result`, seeded.accounts >= 6, seeded);
  const roles = (await UserModel.distinct('role')).sort();
  check('A0.47', 'all 6 roles exist in users after seed', roles.length === 6, roles);

  // ---------- Step 1: sign up / login / hashing ----------
  const s1 = await signup(app, 'a-borrower@audit.dev');
  check('A0.9', 'signup → 201 BORROWER + session cookie', s1.res.status === 201 && s1.res.body.data.user.role === 'BORROWER' && s1.cookie !== '', { status: s1.res.status });
  const stored = await UserModel.findOne({ email: 'a-borrower@audit.dev' }).select('+passwordHash').lean();
  check('A0.10', 'password stored as bcrypt hash (cost 10)', typeof stored?.passwordHash === 'string' && stored.passwordHash.startsWith('$2b$10$'), stored?.passwordHash?.slice(0, 7));
  check('A0.10', 'signup response has no hash', !JSON.stringify(s1.res.body).includes('$2b$'));
  const l1 = await login(app, 'a-borrower@audit.dev', 'Audit@12345');
  check('A0.9', 'login → 200', l1.res.status === 200);
  const lbad = await login(app, 'a-borrower@audit.dev', 'wrong-pass-1');
  check('A0.9', 'wrong password → 401 generic', lbad.res.status === 401 && lbad.res.body.error.message === 'Invalid email or password', lbad.res.body);
  const sRole = await request(app).post(api('/auth/signup')).set('Origin', ORIGIN).send({ name: 'X', email: 'x-admin@audit.dev', password: 'Audit@12345', role: 'ADMIN' });
  check('A0.47', 'signup with role=ADMIN rejected', sRole.status === 400, sRole.status);
  const c = s1.cookie;

  // ---------- Step 2: personal details + BRE ----------
  const all4 = await put(app, '/borrower/profile', c, { fullName: 'Audit Applicant', pan: 'ABC123', dateOfBirth: dobForAge(21), monthlySalary: 2_000_000, employmentMode: 'UNEMPLOYED' });
  const rules = (all4.body?.error?.details?.failures ?? []).map((f: { rule: string }) => f.rule);
  check('A0.13/A0.18', 'all-4-fail profile → 422 BRE_FAILED listing every rule', all4.status === 422 && all4.body.error.code === 'BRE_FAILED' && rules.join() === 'AGE,SALARY,PAN,EMPLOYMENT', { status: all4.status, rules });
  process.stdout.write(`  · messages: ${JSON.stringify(all4.body?.error?.details?.failures?.map((f: { message: string }) => f.message))}\n`);
  const slipBlocked = await upload(app, c, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');
  check('A0.18', 'after BRE fail, slip upload is blocked (409)', slipBlocked.status === 409, slipBlocked.body?.error?.code);
  const applyBlocked = await post(app, '/borrower/loans', c, { principal: 10_000_000, tenureDays: 90 });
  check('A0.18', 'after BRE fail, apply is blocked (409)', applyBlocked.status === 409, applyBlocked.body?.error?.code);

  const single: Array<[string, string, object, string[]]> = [
    ['A0.14', 'age 22 (one day short of 23)', { dateOfBirth: addDays(dobForAge(23), 1) }, ['AGE']],
    ['A0.14', 'age exactly 23', { dateOfBirth: dobForAge(23) }, []],
    ['A0.14', 'age 50 (day before 51st birthday)', { dateOfBirth: addDays(dobForAge(51), 1) }, []],
    ['A0.14', 'age exactly 51', { dateOfBirth: dobForAge(51) }, ['AGE']],
    ['A0.15', 'salary ₹24,999.99', { monthlySalary: 2_499_999 }, ['SALARY']],
    ['A0.15', 'salary ₹25,000', { monthlySalary: 2_500_000 }, []],
    ['A0.16', 'PAN ABCDE12345 (digit last)', { pan: 'ABCDE12345' }, ['PAN']],
    ['A0.16', 'PAN ABCD1234EF', { pan: 'ABCD1234EF' }, ['PAN']],
    ['A0.16', 'PAN lowercase abcde1234f (normalised)', { pan: 'abcde1234f' }, []],
    ['A0.17', 'employment UNEMPLOYED', { employmentMode: 'UNEMPLOYED' }, ['EMPLOYMENT']],
    ['A0.12', 'employment SELF_EMPLOYED', { employmentMode: 'SELF_EMPLOYED' }, []],
  ];
  for (const [id, label, patch, expected] of single) {
    const r = await put(app, '/borrower/profile', c, { ...okProfile, ...patch });
    const got = r.status === 200 ? [] : (r.body?.error?.details?.failures ?? []).map((f: { rule: string }) => f.rule);
    check(id, `BRE ${label} → ${expected.length ? expected.join() : 'eligible'}`, got.join() === expected.join() && (expected.length ? r.status === 422 : r.status === 200), { status: r.status, got });
  }
  const missing = await put(app, '/borrower/profile', c, { pan: 'ABCDE1234F', dateOfBirth: dobForAge(30), monthlySalary: 4_500_000, employmentMode: 'SALARIED' });
  check('A0.12', 'fullName is required (400)', missing.status === 400, missing.status);
  const badMode = await put(app, '/borrower/profile', c, { ...okProfile, employmentMode: 'STUDENT' });
  check('A0.12', 'employment mode limited to the 3 options (400)', badMode.status === 400, badMode.status);
  const ok = await put(app, '/borrower/profile', c, okProfile);
  check('A0.20', 'all checks pass → 200, isEligible', ok.status === 200 && ok.body.data.profile.breResult.isEligible === true, ok.status);

  // ---------- Step 3: upload ----------
  const bigOk = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 - 9)]);
  const bigBad = Buffer.concat([bigOk, Buffer.from('x')]);
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
  const cases: Array<[string, Buffer, string, string, number]> = [
    ['PDF', SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf', 201],
    ['JPG', SAMPLE_FILES.jpg, 'slip.jpg', 'image/jpeg', 201],
    ['PNG', SAMPLE_FILES.png, 'slip.png', 'image/png', 201],
    ['GIF', gif, 'slip.gif', 'image/gif', 415],
    ['HTML as .pdf', SAMPLE_FILES.text, 'slip.pdf', 'application/pdf', 415],
    ['exactly 5 MB PDF', bigOk, 'big.pdf', 'application/pdf', 201],
    ['5 MB + 1 byte PDF', bigBad, 'big.pdf', 'application/pdf', 413],
  ];
  for (const [label, buf, name, type, expected] of cases) {
    const r = await upload(app, c, buf, name, type);
    check('A0.22', `upload ${label} (${buf.length} B) → ${expected}`, r.status === expected, { status: r.status, code: r.body?.error?.code });
  }
  const finalSlip = await upload(app, c, SAMPLE_FILES.png, 'slip.png', 'image/png');
  check('A0.23', 'final slip PNG stored', finalSlip.status === 201, finalSlip.body);
  const progress = await get(app, '/borrower/progress', c);
  check('A0.23', 'slip linked to the borrower profile (progress.profile.salarySlip)', progress.body.data.profile.salarySlip?.contentType === 'image/png' && progress.body.data.currentStep === 'LOAN', progress.body.data.profile.salarySlip);

  // ---------- Step 4: loan config & apply ----------
  const bad: Array<[string, object]> = [
    ['₹49,999', { principal: 4_999_900, tenureDays: 90 }],
    ['₹5,00,001', { principal: 50_000_100, tenureDays: 90 }],
    ['29 days', { principal: 10_000_000, tenureDays: 29 }],
    ['366 days', { principal: 10_000_000, tenureDays: 366 }],
    ['client-sent totalRepayment', { principal: 10_000_000, tenureDays: 90, totalRepayment: 1 }],
    ['client-sent annualInterestRate', { principal: 10_000_000, tenureDays: 90, annualInterestRate: 1 }],
  ];
  for (const [label, body] of bad) {
    const r = await post(app, '/borrower/loans', c, body);
    check('A0.24', `apply ${label} → 400`, r.status === 400, r.status);
  }
  const P = 25_000_000; const T = 200; // ₹2,50,000 for 200 days
  const applied = await post(app, '/borrower/loans', c, { principal: P, tenureDays: T });
  const loan = applied.body?.data?.loan;
  const exactSi = (P * 12 * T) / (365 * 100);
  check('A0.29', 'apply → 201, status APPLIED (pending)', applied.status === 201 && loan?.status === 'APPLIED', { status: applied.status, s: loan?.status });
  check('A0.25', 'annualInterestRate = 12', loan?.annualInterestRate === 12, loan?.annualInterestRate);
  check('A0.27', `SI = (P×R×T)/(365×100) = ${exactSi} paise → stored ${loan?.simpleInterest} (rounded to the paisa)`, loan?.simpleInterest === Math.round(exactSi));
  check('A0.28', 'Total = P + SI', loan?.totalRepayment === P + loan?.simpleInterest, loan?.totalRepayment);
  check('A0.46', 'outstanding = total, totalPaid = 0 on apply', loan?.outstanding === loan?.totalRepayment && loan?.totalPaid === 0);
  const again = await post(app, '/borrower/loans', c, { principal: P, tenureDays: T });
  check('A0.29', 'second apply while active → 409', again.status === 409, again.body?.error?.code);

  // ---------- Sales: leads ----------
  const lead = await signup(app, 'a-lead@audit.dev');
  const leads = await get(app, '/leads?limit=100', staff.SALES);
  const leadEmails = (leads.body?.data?.items ?? []).map((l: { email: string }) => l.email);
  check('A0.33', 'Sales /leads lists a registered user who has not applied', leads.status === 200 && leadEmails.includes('a-lead@audit.dev'), leads.status);
  check('A0.33', 'Sales /leads excludes a borrower who applied', !leadEmails.includes('a-borrower@audit.dev'));
  process.stdout.write(`  · lead fields: ${Object.keys(leads.body.data.items[0] ?? {}).join(',')}; stages: ${[...new Set(leads.body.data.items.map((l: { stage: string }) => l.stage))].join(',')}\n`);
  void lead;

  // ---------- Sanction ----------
  const queue = await get(app, '/loans?limit=100', staff.SANCTION);
  const qIds = (queue.body?.data?.items ?? []).map((l: { id: string; status: string }) => l.id);
  check('A0.35', 'Sanction queue holds the APPLIED loan, only APPLIED', qIds.includes(loan.id) && queue.body.data.items.every((l: { status: string }) => l.status === 'APPLIED'));
  const detail = await get(app, `/loans/${loan.id}`, staff.SANCTION);
  process.stdout.write(`  · sanction detail keys: ${Object.keys(detail.body?.data?.loan ?? {}).join(',')}\n`);
  const slipBytes = await get(app, `/loans/${loan.id}/salary-slip`, staff.SANCTION).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (d: Buffer) => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
  check('A0.23', 'slip linked to the application: SANCTION downloads the loan\'s slip (same bytes as uploaded)', slipBytes.status === 200 && Buffer.compare(slipBytes.body as Buffer, SAMPLE_FILES.png) === 0, slipBytes.status);
  const noReason = await post(app, `/loans/${loan.id}/reject`, staff.SANCTION, {});
  check('A0.36', 'reject without reason → 400', noReason.status === 400, noReason.status);

  // second borrower to reject
  const b2 = await signup(app, 'a-borrower2@audit.dev');
  await put(app, '/borrower/profile', b2.cookie, { ...okProfile, pan: 'PQRSX6789Z' });
  await upload(app, b2.cookie, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');
  const loan2 = (await post(app, '/borrower/loans', b2.cookie, { principal: 5_000_000, tenureDays: 30 })).body.data.loan;
  const rej = await post(app, `/loans/${loan2.id}/reject`, staff.SANCTION, { reason: 'Salary slip unreadable' });
  check('A0.36', 'reject with reason → REJECTED + reason stored', rej.status === 200 && rej.body.data.loan.status === 'REJECTED' && rej.body.data.loan.rejectionReason === 'Salary slip unreadable', rej.body?.data?.loan?.status);
  const b2view = await get(app, `/borrower/loans/${loan2.id}`, b2.cookie);
  check('A0.36', 'borrower sees the rejection reason', b2view.body?.data?.loan?.rejectionReason === 'Salary slip unreadable');
  const appr = await post(app, `/loans/${loan.id}/approve`, staff.SANCTION, {});
  check('A0.37', 'approve → SANCTIONED', appr.status === 200 && appr.body.data.loan.status === 'SANCTIONED', appr.status);

  // ---------- Disbursement ----------
  const dq = await get(app, '/loans?limit=100', staff.DISBURSEMENT);
  check('A0.38', 'Disbursement queue holds the SANCTIONED loan, only SANCTIONED', dq.body.data.items.some((l: { id: string }) => l.id === loan.id) && dq.body.data.items.every((l: { status: string }) => l.status === 'SANCTIONED'));
  const wrong = await post(app, `/loans/${loan.id}/disburse`, staff.SANCTION, {});
  check('A0.48', 'SANCTION cannot disburse (403)', wrong.status === 403, wrong.status);
  const disb = await post(app, `/loans/${loan.id}/disburse`, staff.DISBURSEMENT, {});
  check('A0.39/A0.40', 'disburse → DISBURSED with disbursedAt', disb.status === 200 && disb.body.data.loan.status === 'DISBURSED' && Boolean(disb.body.data.loan.disbursedAt), disb.status);

  // ---------- Collection ----------
  const cq = await get(app, '/loans?limit=100', staff.COLLECTION);
  check('A0.41', 'Collection queue holds the DISBURSED loan, only DISBURSED', cq.body.data.items.some((l: { id: string }) => l.id === loan.id) && cq.body.data.items.every((l: { status: string }) => l.status === 'DISBURSED'));
  const today = dobForAge(0);
  const total = loan.totalRepayment as number;
  const p1 = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0001', amount: 10_000_000, paymentDate: today });
  check('A0.42/A0.44', 'payment with UTR, amount, date → 201', p1.status === 201, p1.body);
  process.stdout.write(`  · payment response: ${JSON.stringify(p1.body?.data?.payment ?? p1.body?.data)?.slice(0, 300)}\n`);
  const l1d = await get(app, `/loans/${loan.id}`, staff.COLLECTION);
  check('A0.46', 'outstanding tracked: total − paid', l1d.body.data.loan.outstanding === total - 10_000_000 && l1d.body.data.loan.totalPaid === 10_000_000, { o: l1d.body.data.loan.outstanding });
  const dup = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'auditutr0001', amount: 100, paymentDate: today });
  check('A0.43', 'duplicate UTR (other case) → 409 DUPLICATE_UTR', dup.status === 409 && dup.body.error.code === 'DUPLICATE_UTR', dup.body?.error?.code);
  const noUtr = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { amount: 100, paymentDate: today });
  const noAmt = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0009', paymentDate: today });
  const noDate = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0009', amount: 100 });
  check('A0.44', 'UTR, amount and date each required (400)', noUtr.status === 400 && noAmt.status === 400 && noDate.status === 400, [noUtr.status, noAmt.status, noDate.status]);
  const zero = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0010', amount: 0, paymentDate: today });
  const over = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0011', amount: total, paymentDate: today });
  const fut = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0012', amount: 100, paymentDate: addDays(today, 1) });
  check('A0.46', 'amount 0 → 400, overpay → 422, future date → 422', zero.status === 400 && over.status === 422 && fut.status === 422, [zero.status, over.status, fut.status]);
  const rest = total - 10_000_000;
  const p2 = await post(app, `/loans/${loan.id}/payments`, staff.COLLECTION, { utr: 'AUDITUTR0002', amount: rest, paymentDate: today });
  check('A0.45', 'paying exactly the remainder → loan auto-CLOSED, outstanding 0', p2.status === 201 && (p2.body.data.loan?.status ?? '') === 'CLOSED' && p2.body.data.loan?.outstanding === 0, { status: p2.status, loan: p2.body?.data?.loan?.status });
  const bview = await get(app, `/borrower/loans/${loan.id}`, c);
  check('A0.8', 'status history APPLIED→SANCTIONED→DISBURSED→CLOSED', (bview.body.data.loan.statusHistory ?? []).map((h: { to: string }) => h.to).join('>') === 'APPLIED>SANCTIONED>DISBURSED>CLOSED', bview.body.data.loan.statusHistory?.map((h: { to: string }) => h.to));
  const after = await post(app, `/loans/${loan.id}/payments`, staff.ADMIN, { utr: 'AUDITUTR0003', amount: 1, paymentDate: today });
  check('A0.45', 'no payment accepted on a CLOSED loan (409)', after.status === 409, after.body?.error?.code);

  // ---------- RBAC ----------
  const anon = await request(app).get(api('/loans'));
  check('A0.11/A0.52', 'anonymous → 401 on a protected API', anon.status === 401, anon.status);
  const borrowerDash = await get(app, '/loans', c);
  check('A0.50', 'borrower → 403 on dashboard API /loans', borrowerDash.status === 403, borrowerDash.status);
  const salesSanction = await get(app, '/loans', staff.SALES);
  check('A0.48', 'SALES → 403 on loan queues', salesSanction.status === 403, salesSanction.status);
  const sanctionLeads = await get(app, '/leads', staff.SANCTION);
  check('A0.48', 'SANCTION → 403 on /leads', sanctionLeads.status === 403);
  const adminAll = await Promise.all(['/leads', '/loans?status=APPLIED', '/loans?status=SANCTIONED', '/loans?status=DISBURSED', '/dashboard/summary'].map((p) => get(app, p, staff.ADMIN)));
  check('A0.49', 'ADMIN → 200 on every module list', adminAll.every((r) => r.status === 200), adminAll.map((r) => r.status));

  await mongoose.connection.db?.collection('users').countDocuments();
  await stopTestDatabase();
  process.stdout.write(`\nfailures=${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error: unknown) => {
  process.stdout.write(`CRASH ${String(error)}\n${(error as Error)?.stack ?? ''}\n`);
  await stopTestDatabase().catch(() => undefined);
  process.exit(2);
});
