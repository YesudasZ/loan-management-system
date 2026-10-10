// Lens D5: wizard resume via GET /borrower/progress at each stage, across logout/login,
// and "Apply again" after REJECTED and CLOSED. Writes progress snapshots for d5-wizard-fe.ts.
import { writeFileSync } from 'node:fs';
import type { Express } from 'express';
import { toBusinessDate } from '../src/utils/dates.js';
import { createStaff } from '../tests/helpers/loans.js';
import { check, cookieFrom, get, login, note, post, put, request, signup, start, stop, summary, uploadPdf, ORIGIN } from './harness.js';

const OUT = process.env.D5_OUT ?? '/tmp/d5-progress.json';
const snapshots: Record<string, unknown> = {};
const PASSWORD = 'Audit@12345';
const eligible = { fullName: 'Wizard User', pan: 'ABCDE1234F', dateOfBirth: '1995-06-15', monthlySalary: 4_500_000, employmentMode: 'SALARIED' };

async function relogin(app: Express, cookie: string, email: string): Promise<string> {
  const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN).send({});
  if (out.status !== 200 && out.status !== 204) throw new Error(`logout ${out.status}`);
  const res = await login(app, email, PASSWORD);
  if (res.status !== 200) throw new Error(`login ${res.status}`);
  return cookieFrom(res);
}

async function expectStep(app: Express, cookie: string, email: string, label: string, step: string): Promise<string> {
  const p1 = await get(app, '/borrower/progress', cookie);
  const fresh = await relogin(app, cookie, email);
  const p2 = await get(app, '/borrower/progress', fresh);
  snapshots[label] = p2.body.data;
  check(`${label}: currentStep ${step} (and the same after logout/login)`, p1.body.data.currentStep === step && p2.body.data.currentStep === step, { before: p1.body.data?.currentStep, after: p2.body.data?.currentStep });
  return fresh;
}

const app = await start();
try {
  const staff = await createStaff();
  const email = 'wizard@audit.dev';
  let cookie = await signup(app, email, PASSWORD);
  cookie = await expectStep(app, cookie, email, 'new user', 'PROFILE');

  const fail = await put(app, '/borrower/profile', cookie, { ...eligible, monthlySalary: 1_000_000 });
  check('BRE-failing profile → 422', fail.status === 422);
  cookie = await expectStep(app, cookie, email, 'BRE failed', 'PROFILE');
  const slipWhenFailed = await uploadPdf(app, cookie);
  check('slip upload while BRE failed → 409 PROFILE_INCOMPLETE', slipWhenFailed.status === 409, slipWhenFailed.body);

  await put(app, '/borrower/profile', cookie, eligible);
  cookie = await expectStep(app, cookie, email, 'eligible, no slip', 'SALARY_SLIP');
  const applyNoSlip = await post(app, '/borrower/loans', cookie, { principal: 10_000_000, tenureDays: 90 });
  check('apply without slip → 409 PROFILE_INCOMPLETE', applyNoSlip.status === 409 && applyNoSlip.body.error.code === 'PROFILE_INCOMPLETE', applyNoSlip.body);

  await uploadPdf(app, cookie);
  cookie = await expectStep(app, cookie, email, 'eligible with slip', 'LOAN');

  // Eligible + slip, then the profile is edited to fail the BRE again → back to PROFILE.
  await put(app, '/borrower/profile', cookie, { ...eligible, employmentMode: 'UNEMPLOYED' });
  cookie = await expectStep(app, cookie, email, 'slip uploaded, then BRE failed', 'PROFILE');
  await put(app, '/borrower/profile', cookie, eligible);
  cookie = await expectStep(app, cookie, email, 'fixed again (slip kept)', 'LOAN');

  const applied = await post(app, '/borrower/loans', cookie, { principal: 10_000_000, tenureDays: 90 });
  check('apply → 201 APPLIED', applied.status === 201 && applied.body.data.loan.status === 'APPLIED');
  const firstLoanId = applied.body.data.loan.id as string;
  cookie = await expectStep(app, cookie, email, 'applied', 'STATUS');
  const locked = await put(app, '/borrower/profile', cookie, eligible);
  const lockedSlip = await uploadPdf(app, cookie);
  const twice = await post(app, '/borrower/loans', cookie, { principal: 10_000_000, tenureDays: 90 });
  check('while APPLIED: profile edit 409, slip upload 409, second apply 409 ACTIVE_LOAN_EXISTS', locked.status === 409 && lockedSlip.status === 409 && twice.status === 409 && twice.body.error.code === 'ACTIVE_LOAN_EXISTS', [locked.status, lockedSlip.status, twice.status]);

  // REJECTED → apply again.
  await post(app, `/loans/${firstLoanId}/reject`, staff.SANCTION.cookie, { reason: 'Audit rejection' });
  cookie = await expectStep(app, cookie, email, 'after REJECTED', 'STATUS');
  const editAfterReject = await put(app, '/borrower/profile', cookie, eligible);
  check('profile editable after REJECTED → 200', editAfterReject.status === 200);
  const again = await post(app, '/borrower/loans', cookie, { principal: 20_000_000, tenureDays: 180 });
  check('apply again after REJECTED → 201', again.status === 201, again.body);
  const secondLoanId = again.body.data.loan.id as string;
  const prog2 = await get(app, '/borrower/progress', cookie);
  snapshots['re-applied after REJECTED'] = prog2.body.data;
  check('progress.latestLoan is the new APPLIED loan', prog2.body.data.latestLoan.id === secondLoanId && prog2.body.data.latestLoan.status === 'APPLIED' && prog2.body.data.currentStep === 'STATUS');
  const list1 = await get(app, '/borrower/loans', cookie);
  check('GET /borrower/loans lists both (new APPLIED first, old REJECTED kept)', list1.body.data.items.length === 2 && list1.body.data.items[0].id === secondLoanId && list1.body.data.items[1].id === firstLoanId && list1.body.data.items[1].status === 'REJECTED', list1.body.data.items.map((l: { id: string; status: string }) => l.status));
  const oldDetail = await get(app, `/borrower/loans/${firstLoanId}`, cookie);
  check('old REJECTED loan still readable with its reason', oldDetail.status === 200 && oldDetail.body.data.loan.rejectionReason === 'Audit rejection');

  // CLOSED → apply again.
  await post(app, `/loans/${secondLoanId}/approve`, staff.SANCTION.cookie);
  await post(app, `/loans/${secondLoanId}/disburse`, staff.DISBURSEMENT.cookie);
  const total = prog2.body.data.latestLoan.totalRepayment as number;
  const paid = await post(app, `/loans/${secondLoanId}/payments`, staff.COLLECTION.cookie, { utr: 'D5CLOSE0001', amount: total, paymentDate: toBusinessDate() });
  check('full payment closes loan 2', paid.status === 201 && paid.body.data.loan.status === 'CLOSED');
  cookie = await expectStep(app, cookie, email, 'after CLOSED', 'STATUS');
  const newSlip = await uploadPdf(app, cookie);
  check('slip re-upload allowed after CLOSED → 201', newSlip.status === 201);
  const third = await post(app, '/borrower/loans', cookie, { principal: 5_000_000, tenureDays: 30 });
  check('apply again after CLOSED → 201', third.status === 201, third.body);
  const list2 = await get(app, '/borrower/loans', cookie);
  check('GET /borrower/loans lists 3 loans: APPLIED, CLOSED, REJECTED (newest first)', list2.body.data.items.map((l: { status: string }) => l.status).join(',') === 'APPLIED,CLOSED,REJECTED', list2.body.data.items.map((l: { status: string }) => l.status));
  const closedDetail = await get(app, `/borrower/loans/${secondLoanId}`, cookie);
  check('old CLOSED loan keeps its full history (4 entries) and totals', closedDetail.body.data.loan.statusHistory.length === 4 && closedDetail.body.data.loan.outstanding === 0);
  note(`old loans still downloadable? slip of loan 2 referenced by the loan: ${Boolean(closedDetail.body.data.loan)}`);
} finally {
  writeFileSync(OUT, JSON.stringify(snapshots, null, 2));
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
