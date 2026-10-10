// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c8-business-logic.ts
// C8: business-logic abuse through the API (amounts, dates, double actions, races, UTR, apply).
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LoanModel } from '../src/models/loan.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, prepareBorrowerToApply, SAMPLE_FILES } from '../tests/helpers/borrower.js';
import { createAppliedLoan, createDisbursedLoan, createSanctionedLoan, createStaff } from '../tests/helpers/loans.js';
import { toBusinessDate } from '../src/utils/dates.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

async function main() {
  await startTestDatabase();
  const app = createApp();
  const staff = await createStaff();
  const today = toBusinessDate();
  const tomorrow = toBusinessDate(new Date(Date.now() + 86_400_000));
  const yesterday = toBusinessDate(new Date(Date.now() - 86_400_000));

  const pay = (loanId: string, body: unknown) =>
    request(app).post(`/api/v1/loans/${loanId}/payments`).set('Origin', ORIGIN).set('Cookie', staff.COLLECTION.cookie)
      .set('Content-Type', 'application/json').send(typeof body === 'string' ? body : JSON.stringify(body));

  // Amounts.
  const loan = await createDisbursedLoan(app, staff);
  const amountCases: [string, unknown, number][] = [
    ['negative', -100, 400], ['zero', 0, 400], ['fractional paise 100.5', 100.5, 400], ['numeric string', '100', 400],
    ['null', null, 400], ['boolean', true, 400], ['1e21', 1e21, 400], ['over outstanding by 1', loan.totalRepayment + 1, 422],
    ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER, 422],
  ];
  for (const [name, amount, expected] of amountCases) {
    const res = await pay(loan.loanId, { utr: `AMT${Math.abs(String(name).length * 7919)}X`, amount, paymentDate: today });
    check(`payment amount ${name} -> ${expected}`, res.status === expected, `${res.status} ${JSON.stringify(res.body?.error?.details ?? res.body?.error?.code)}`.slice(0, 200));
  }
  const infinity = await pay(loan.loanId, `{"utr":"INFINITY01","amount":1e400,"paymentDate":"${today}"}`);
  check('payment amount 1e400 (Infinity) -> 400', infinity.status === 400, infinity.status);

  // Dates.
  const dateCases: [string, string, number, string?][] = [
    ['before disbursal (yesterday)', yesterday, 422, 'DATE_BEFORE_DISBURSAL'], ['future (tomorrow)', tomorrow, 422, 'DATE_IN_FUTURE'],
    ['2026-02-30', '2026-02-30', 400], ['2025-02-29 (not leap)', '2025-02-29', 400], ['2026-13-01', '2026-13-01', 400],
    ['2026-1-1', '2026-1-1', 400], ['ISO datetime', `${today}T00:00:00Z`, 400], ['empty', '', 400], ['year 0000', '0000-01-01', 422],
  ];
  for (const [name, paymentDate, expected, rule] of dateCases) {
    const res = await pay(loan.loanId, { utr: `DATE${name.length}${expected}X`, amount: 100, paymentDate });
    const ruleOk = !rule || JSON.stringify(res.body).includes(rule);
    check(`payment date ${name} -> ${expected}${rule ? ` ${rule}` : ''}`, res.status === expected && ruleOk, `${res.status} ${JSON.stringify(res.body?.error?.details ?? '')}`.slice(0, 200));
  }
  check('no payment stored after the invalid attempts', (await PaymentModel.countDocuments({ loanId: loan.loanId })) === 0, '');

  // UTR normalisation.
  const first = await pay(loan.loanId, { utr: 'utrcase123', amount: 100, paymentDate: today });
  check('payment utrcase123 -> 201 stored as UTRCASE123', first.status === 201 && first.body.data.payment.utr === 'UTRCASE123', first.body?.data?.payment?.utr);
  for (const variant of ['UTRCASE123', ' UTRCASE123 ', '\tUtRcAsE123\n']) {
    const res = await pay(loan.loanId, { utr: variant, amount: 100, paymentDate: today });
    check(`duplicate UTR variant ${JSON.stringify(variant)} -> 409 DUPLICATE_UTR`, res.status === 409 && res.body.error.code === 'DUPLICATE_UTR', res.status);
  }
  const inner = await pay(loan.loanId, { utr: 'UTR CASE123', amount: 100, paymentDate: today });
  check('UTR with inner space -> 400', inner.status === 400, inner.status);
  const ligature = await pay(loan.loanId, { utr: 'utrﬀ1234', amount: 100, paymentDate: today });
  const ligature2 = await pay(loan.loanId, { utr: 'UTRFF1234', amount: 100, paymentDate: today });
  note('UTR "utrﬀ1234" (ligature uppercases to FF) then "UTRFF1234"', `${ligature.status} stored=${ligature.body?.data?.payment?.utr} then ${ligature2.status}`);
  const afterDup = await LoanModel.findById(loan.loanId);
  const paidSum = (await PaymentModel.find({ loanId: loan.loanId })).reduce((sum, p) => sum + p.amount, 0);
  check('rollback: loan.totalPaid equals the sum of stored payments', afterDup?.totalPaid === paidSum, { totalPaid: afterDup?.totalPaid, paidSum });

  // Concurrent payments: 5 x full outstanding at once.
  const raceLoan = await createDisbursedLoan(app, staff);
  const fullRace = await Promise.all([1, 2, 3, 4, 5].map((i) => pay(raceLoan.loanId, { utr: `RACEFULL${i}0`, amount: raceLoan.totalRepayment, paymentDate: today })));
  const fullStatuses = fullRace.map((r) => r.status);
  const raceDoc = await LoanModel.findById(raceLoan.loanId);
  check('5 concurrent full payoffs: exactly one 201, loan CLOSED, totalPaid == total', fullStatuses.filter((s) => s === 201).length === 1 && raceDoc?.status === 'CLOSED' && raceDoc.totalPaid === raceLoan.totalRepayment, { fullStatuses, status: raceDoc?.status, totalPaid: raceDoc?.totalPaid });
  check('one CLOSED history entry only', raceDoc?.statusHistory.filter((h) => h.to === 'CLOSED').length === 1, '');

  // Concurrent partial payments that together exceed the balance.
  const raceLoan2 = await createDisbursedLoan(app, staff);
  const chunk = Math.floor(raceLoan2.totalRepayment / 3) + 1; // 3 chunks overshoot, 2 fit
  const partialRace = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => pay(raceLoan2.loanId, { utr: `RACEPART${i}0`, amount: chunk, paymentDate: today })));
  const raceDoc2 = await LoanModel.findById(raceLoan2.loanId);
  const sum2 = (await PaymentModel.find({ loanId: raceLoan2.loanId })).reduce((s, p) => s + p.amount, 0);
  check('6 concurrent 1/3+1 payments: exactly 2 succeed, totalPaid == stored sum <= total', partialRace.filter((r) => r.status === 201).length === 2 && raceDoc2?.totalPaid === sum2 && sum2 <= raceLoan2.totalRepayment, { statuses: partialRace.map((r) => r.status), totalPaid: raceDoc2?.totalPaid, sum2, total: raceLoan2.totalRepayment });
  const afterClose = await pay(raceLoan.loanId, { utr: 'AFTERCLOSE1', amount: 1, paymentDate: today });
  check('payment on CLOSED loan -> 409', afterClose.status === 409, afterClose.status);

  // Same UTR raced on two different loans.
  const loanA = await createDisbursedLoan(app, staff);
  const loanB = await createDisbursedLoan(app, staff);
  const utrRace = await Promise.all([pay(loanA.loanId, { utr: 'SAMEUTR777', amount: 100, paymentDate: today }), pay(loanB.loanId, { utr: 'sameutr777', amount: 100, paymentDate: today })]);
  const aDoc = await LoanModel.findById(loanA.loanId);
  const bDoc = await LoanModel.findById(loanB.loanId);
  check('same UTR on two loans concurrently: one 201, one 409; loser loan totalPaid 0', utrRace.map((r) => r.status).sort().join() === '201,409' && (aDoc?.totalPaid ?? 0) + (bDoc?.totalPaid ?? 0) === 100, utrRace.map((r) => r.status));

  // Double / concurrent approve, reject, disburse.
  const act = (loanId: string, action: string, cookie: string, body: object = {}) =>
    request(app).post(`/api/v1/loans/${loanId}/${action}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const a1 = await createAppliedLoan(app);
  const firstApprove = await act(a1.loanId, 'approve', staff.SANCTION.cookie);
  const secondApprove = await act(a1.loanId, 'approve', staff.SANCTION.cookie);
  check('double approve: 200 then 409', firstApprove.status === 200 && secondApprove.status === 409, [firstApprove.status, secondApprove.status]);
  const rejectAfter = await act(a1.loanId, 'reject', staff.SANCTION.cookie, { reason: 'too late now' });
  check('reject after approve -> 409', rejectAfter.status === 409, rejectAfter.status);
  const d1 = await act(a1.loanId, 'disburse', staff.DISBURSEMENT.cookie);
  const d2 = await act(a1.loanId, 'disburse', staff.DISBURSEMENT.cookie);
  check('double disburse: 200 then 409', d1.status === 200 && d2.status === 409, [d1.status, d2.status]);

  const a2 = await createAppliedLoan(app);
  const concurrentApprove = await Promise.all([
    ...[1, 2, 3, 4].map(() => act(a2.loanId, 'approve', staff.SANCTION.cookie)),
    act(a2.loanId, 'approve', staff.ADMIN.cookie),
    act(a2.loanId, 'reject', staff.SANCTION.cookie, { reason: 'racing reject' }),
    act(a2.loanId, 'reject', staff.ADMIN.cookie, { reason: 'racing reject 2' }),
  ]);
  const a2Doc = await LoanModel.findById(a2.loanId);
  check('7 concurrent approve/reject: exactly one 200, one history transition', concurrentApprove.filter((r) => r.status === 200).length === 1 && a2Doc?.statusHistory.length === 2, { statuses: concurrentApprove.map((r) => r.status), status: a2Doc?.status, history: a2Doc?.statusHistory.length });

  const s1 = await createSanctionedLoan(app, staff);
  const concurrentDisburse = await Promise.all([1, 2, 3, 4, 5].map((i) => act(s1.loanId, 'disburse', i === 5 ? staff.ADMIN.cookie : staff.DISBURSEMENT.cookie)));
  const s1Doc = await LoanModel.findById(s1.loanId);
  check('5 concurrent disburse: exactly one 200', concurrentDisburse.filter((r) => r.status === 200).length === 1 && s1Doc?.statusHistory.length === 3, { statuses: concurrentDisburse.map((r) => r.status), history: s1Doc?.statusHistory.length });
  const blankReason = await act((await createAppliedLoan(app)).loanId, 'reject', staff.SANCTION.cookie, { reason: '       ' });
  check('reject with whitespace-only reason -> 400', blankReason.status === 400, blankReason.status);

  // Apply: tampered totals, invalid values, twice, concurrently.
  const b1 = await createTestUser('BORROWER', 'apply1@audit.dev');
  await prepareBorrowerToApply(app, b1.cookie);
  const apply = (cookie: string, body: object) => request(app).post('/api/v1/borrower/loans').set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const tamperCases: [string, object][] = [
    ['totalRepayment', { ...LOAN_REQUEST, totalRepayment: 1 }], ['simpleInterest', { ...LOAN_REQUEST, simpleInterest: 0 }],
    ['annualInterestRate', { ...LOAN_REQUEST, annualInterestRate: 0 }], ['principal not whole rupees', { principal: 10_000_050, tenureDays: 90 }],
    ['principal below min', { principal: 4_999_900, tenureDays: 90 }], ['principal above max', { principal: 50_000_100, tenureDays: 90 }],
    ['tenure 29', { principal: 10_000_000, tenureDays: 29 }], ['tenure 366', { principal: 10_000_000, tenureDays: 366 }],
    ['tenure 30.5', { principal: 10_000_000, tenureDays: 30.5 }], ['principal as string', { principal: '10000000', tenureDays: 90 }],
  ];
  for (const [name, body] of tamperCases) {
    const res = await apply(b1.cookie, body);
    check(`apply ${name} -> 400`, res.status === 400, res.status);
  }
  const ok = await apply(b1.cookie, LOAN_REQUEST);
  check('apply with server-side math: SI for 1,00,000 x 90d = 295,890 paise', ok.status === 201 && ok.body.data.loan.simpleInterest === 295_890 && ok.body.data.loan.totalRepayment === 10_295_890, ok.body?.data?.loan && { si: ok.body.data.loan.simpleInterest, total: ok.body.data.loan.totalRepayment });
  const again = await apply(b1.cookie, LOAN_REQUEST);
  check('apply twice -> 409 ACTIVE_LOAN_EXISTS', again.status === 409 && again.body.error.code === 'ACTIVE_LOAN_EXISTS', again.status);
  const profileLocked = await request(app).put('/api/v1/borrower/profile').set('Origin', ORIGIN).set('Cookie', b1.cookie).send({ ...ELIGIBLE_PROFILE, monthlySalary: 100 });
  check('profile edit during active loan -> 409', profileLocked.status === 409 && profileLocked.body.error.code === 'ACTIVE_LOAN_EXISTS', profileLocked.status);
  const slipLocked = await request(app).post('/api/v1/borrower/salary-slip').set('Origin', ORIGIN).set('Cookie', b1.cookie).attach('file', SAMPLE_FILES.pdf, { filename: 'new.pdf', contentType: 'application/pdf' });
  check('slip upload during active loan -> 409', slipLocked.status === 409 && slipLocked.body.error.code === 'ACTIVE_LOAN_EXISTS', slipLocked.status);

  const b2 = await createTestUser('BORROWER', 'apply2@audit.dev');
  await prepareBorrowerToApply(app, b2.cookie);
  const concurrentApply = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => apply(b2.cookie, LOAN_REQUEST)));
  const b2Loans = await LoanModel.countDocuments({ borrowerId: b2.id });
  check('8 concurrent applies: exactly one 201, others 409, one loan stored', concurrentApply.filter((r) => r.status === 201).length === 1 && concurrentApply.filter((r) => r.status === 409).length === 7 && b2Loans === 1, concurrentApply.map((r) => r.status));

  // Race: profile PUT (ineligible) racing an apply.
  let inconsistent = 0;
  for (let i = 0; i < 10; i += 1) {
    const b = await createTestUser('BORROWER', `race-profile${i}@audit.dev`);
    await prepareBorrowerToApply(app, b.cookie);
    const [applyRes, profileRes] = await Promise.all([
      apply(b.cookie, LOAN_REQUEST),
      request(app).put('/api/v1/borrower/profile').set('Origin', ORIGIN).set('Cookie', b.cookie).send({ ...ELIGIBLE_PROFILE, monthlySalary: 100 }),
    ]);
    if (applyRes.status === 201 && profileRes.status === 422) inconsistent += 1;
  }
  note('apply racing an ineligible profile edit: both accepted (loan created AND profile changed) in N/10 runs', inconsistent);

  // Race: slip replacement racing an apply (documented known limitation).
  let orphaned = 0;
  for (let i = 0; i < 10; i += 1) {
    const b = await createTestUser('BORROWER', `race-slip${i}@audit.dev`);
    await prepareBorrowerToApply(app, b.cookie);
    const [applyRes] = await Promise.all([
      apply(b.cookie, LOAN_REQUEST),
      request(app).post('/api/v1/borrower/salary-slip').set('Origin', ORIGIN).set('Cookie', b.cookie).attach('file', SAMPLE_FILES.png, { filename: 'new.png', contentType: 'image/png' }),
    ]);
    if (applyRes.status === 201) {
      const created = await LoanModel.findById(applyRes.body.data.loan.id);
      const exists = await mongoose.connection.db?.collection('salary_slips.files').countDocuments({ _id: created?.salarySlip.fileId });
      if (!exists) orphaned += 1;
    }
  }
  note('apply racing a slip replacement: loan points at a deleted slip in N/10 runs (documented limitation)', orphaned);

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
