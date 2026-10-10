// Lens D4: payments and auto-close (partials, exact payoff, overpay, duplicate UTR rollback,
// concurrency, CLOSED loan, date rules) and the totalPaid == sum(payments) invariant.
import type { Express } from 'express';
import { LoanModel } from '../src/models/loan.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { toBusinessDate } from '../src/utils/dates.js';
import { createDisbursedLoan, createStaff, type StaffUsers } from '../tests/helpers/loans.js';
import { check, get, note, post, start, stop, summary } from './harness.js';

const today = toBusinessDate();
function pay(app: Express, staff: StaffUsers, loanId: string, utr: string, amount: number, paymentDate = today) {
  return post(app, `/loans/${loanId}/payments`, staff.COLLECTION.cookie, { utr, amount, paymentDate });
}
async function state(loanId: string) {
  const loan = await LoanModel.findById(loanId).lean();
  const payments = await PaymentModel.find({ loanId }).lean();
  return { loan, payments, sum: payments.reduce((s, p) => s + p.amount, 0) };
}

const app = await start();
try {
  const staff = await createStaff();

  // Partials then exact payoff.
  const l1 = await createDisbursedLoan(app, staff);
  const total = l1.totalRepayment; // 10,295,890
  const parts = [3_000_000, 2_500_050, 1];
  let paid = 0;
  for (const [i, amount] of parts.entries()) {
    const r = await pay(app, staff, l1.loanId, `D4PART${i}0001`, amount);
    paid += amount;
    check(`partial ${i + 1} (${amount}) → 201, totalPaid ${paid}, outstanding ${total - paid}, still DISBURSED`, r.status === 201 && r.body.data.loan.totalPaid === paid && r.body.data.loan.outstanding === total - paid && r.body.data.loan.status === 'DISBURSED', r.body);
  }
  const over = await pay(app, staff, l1.loanId, 'D4OVER0001', total - paid + 1);
  const s1 = await state(l1.loanId);
  check('overpay by 1 paisa → 422 PAYMENT_RULES_FAILED [AMOUNT_EXCEEDS_OUTSTANDING], nothing recorded', over.status === 422 && over.body.error.code === 'PAYMENT_RULES_FAILED' && over.body.error.details.failures[0].rule === 'AMOUNT_EXCEEDS_OUTSTANDING' && s1.payments.length === 3 && s1.loan?.totalPaid === paid, over.body);
  note(`overpay message: "${over.body.error.details.failures[0].message}"`);
  const exact = await pay(app, staff, l1.loanId, 'D4EXACT0001', total - paid);
  const s2 = await state(l1.loanId);
  const last = s2.loan?.statusHistory.at(-1);
  check('exact remaining → 201, CLOSED, outstanding 0, closedAt set', exact.status === 201 && exact.body.data.loan.status === 'CLOSED' && exact.body.data.loan.outstanding === 0 && Boolean(s2.loan?.closedAt), exact.body.data.loan);
  check('CLOSED history entry DISBURSED→CLOSED byRole COLLECTION note "Auto-closed: fully repaid"', last?.from === 'DISBURSED' && last?.to === 'CLOSED' && last?.byRole === 'COLLECTION' && last?.note === 'Auto-closed: fully repaid', last);
  check('invariant totalPaid == sum(payments) == totalRepayment', s2.loan?.totalPaid === s2.sum && s2.sum === total, s2.sum);
  const afterClose = await pay(app, staff, l1.loanId, 'D4AFTER0001', 100);
  check('payment on CLOSED → 409 LOAN_NOT_DISBURSED', afterClose.status === 409 && afterClose.body.error.code === 'LOAN_NOT_DISBURSED', afterClose.body);
  const list = await get(app, `/loans/${l1.loanId}/payments`, staff.ADMIN.cookie);
  check('ADMIN can list the 4 payments of the CLOSED loan; amounts sum to the total', list.status === 200 && list.body.data.items.length === 4 && list.body.data.items.reduce((s: number, p: { amount: number }) => s + p.amount, 0) === total, list.body);
  const listByCollection = await get(app, `/loans/${l1.loanId}/payments`, staff.COLLECTION.cookie);
  note(`COLLECTION listing payments of the CLOSED loan → ${listByCollection.status}`);

  // Duplicate UTR rollback, incl. a duplicate that would have closed the loan, case/space variants, cross-loan.
  const l2 = await createDisbursedLoan(app, staff);
  const first = await pay(app, staff, l2.loanId, 'DUPUTR0001', 1_000_000);
  check('first payment DUPUTR0001 → 201', first.status === 201, first.body);
  const before = await state(l2.loanId);
  const dupClose = await pay(app, staff, l2.loanId, 'DUPUTR0001', l2.totalRepayment - 1_000_000);
  const afterDup = await state(l2.loanId);
  check('duplicate UTR whose amount would close the loan → 409 DUPLICATE_UTR; no payment, totalPaid unchanged, still DISBURSED, no history entry', dupClose.status === 409 && dupClose.body.error.code === 'DUPLICATE_UTR' && afterDup.payments.length === before.payments.length && afterDup.loan?.totalPaid === before.loan?.totalPaid && afterDup.loan?.status === 'DISBURSED' && afterDup.loan?.statusHistory.length === before.loan?.statusHistory.length && !afterDup.loan?.closedAt, { dupClose: dupClose.body, afterDup: afterDup.loan?.status });
  const dupCase = await pay(app, staff, l2.loanId, '  duputr0001 ', 100);
  check('duplicate UTR in lowercase with spaces → 409 DUPLICATE_UTR', dupCase.status === 409 && dupCase.body.error.code === 'DUPLICATE_UTR', dupCase.body);
  const l3 = await createDisbursedLoan(app, staff);
  const dupOther = await pay(app, staff, l3.loanId, 'DUPUTR0001', 100);
  const l3State = await state(l3.loanId);
  check('duplicate UTR on a different loan → 409, nothing recorded there', dupOther.status === 409 && l3State.payments.length === 0 && l3State.loan?.totalPaid === 0, dupOther.body);
  const totalPayments = await PaymentModel.countDocuments({ utr: 'DUPUTR0001' });
  check('exactly one payment with UTR DUPUTR0001 exists', totalPayments === 1, totalPayments);

  // Amount / date validation.
  for (const [label, body, code] of [
    ['amount 0', { utr: 'D4VAL0001', amount: 0, paymentDate: today }, 400],
    ['amount negative', { utr: 'D4VAL0002', amount: -100, paymentDate: today }, 400],
    ['amount fractional paise', { utr: 'D4VAL0003', amount: 100.5, paymentDate: today }, 400],
    ['amount as string', { utr: 'D4VAL0004', amount: '100', paymentDate: today }, 400],
    ['UTR too short', { utr: 'AB12', amount: 100, paymentDate: today }, 400],
    ['UTR with symbols', { utr: 'ABC-123-XYZ', amount: 100, paymentDate: today }, 400],
    ['date not ISO', { utr: 'D4VAL0005', amount: 100, paymentDate: '10/10/2026' }, 400],
    ['date in the future', { utr: 'D4VAL0006', amount: 100, paymentDate: '2099-01-01' }, 422],
    ['date before disbursal', { utr: 'D4VAL0007', amount: 100, paymentDate: '2020-01-01' }, 422],
    ['missing date', { utr: 'D4VAL0008', amount: 100 }, 400],
  ] as [string, object, number][]) {
    const r = await post(app, `/loans/${l3.loanId}/payments`, staff.COLLECTION.cookie, body);
    check(`${label} → ${code}`, r.status === code, r.body);
  }
  const l3After = await state(l3.loanId);
  check('no payment recorded by any invalid attempt', l3After.payments.length === 0 && l3After.loan?.totalPaid === 0);

  // Concurrency: two payments of the full outstanding at once → exactly one wins.
  const l4 = await createDisbursedLoan(app, staff);
  const [c1, c2] = await Promise.all([
    pay(app, staff, l4.loanId, 'CONC0000001', l4.totalRepayment),
    pay(app, staff, l4.loanId, 'CONC0000002', l4.totalRepayment),
  ]);
  const s4 = await state(l4.loanId);
  check('2 concurrent full payments: one 201, the other 409/422; one payment; CLOSED; totalPaid == total', [c1.status, c2.status].filter((s) => s === 201).length === 1 && s4.payments.length === 1 && s4.loan?.status === 'CLOSED' && s4.loan?.totalPaid === l4.totalRepayment, { c1: [c1.status, c1.body?.error?.code], c2: [c2.status, c2.body?.error?.code] });
  note(`concurrent full payments: ${c1.status} ${c1.body?.error?.code ?? ''} / ${c2.status} ${c2.body?.error?.code ?? ''}`);

  // 10 concurrent payments of 30% each: at most 3 can fit.
  const l5 = await createDisbursedLoan(app, staff);
  const share = Math.floor(l5.totalRepayment * 0.3);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => pay(app, staff, l5.loanId, `CONCB${String(i).padStart(6, '0')}`, share)),
  );
  const s5 = await state(l5.loanId);
  const okCount = results.filter((r) => r.status === 201).length;
  check(`10 concurrent 30% payments: ${okCount} succeeded (expect 3), totalPaid ${s5.loan?.totalPaid} ≤ total, == sum(payments)`, okCount === 3 && (s5.loan?.totalPaid ?? 0) <= l5.totalRepayment && s5.loan?.totalPaid === s5.sum && s5.payments.length === 3, results.map((r) => `${r.status}:${r.body?.error?.code ?? ''}`));
  note(`statuses: ${results.map((r) => `${r.status}${r.body?.error ? `:${r.body.error.code}` : ''}`).join(', ')}`);

  // Concurrent: the final payment and an extra one racing; and the same new UTR on two loans at once.
  const l6 = await createDisbursedLoan(app, staff);
  const l7 = await createDisbursedLoan(app, staff);
  const [u1, u2] = await Promise.all([
    pay(app, staff, l6.loanId, 'SAMEUTR00001', 100_000),
    pay(app, staff, l7.loanId, 'SAMEUTR00001', 100_000),
  ]);
  const s6 = await state(l6.loanId);
  const s7 = await state(l7.loanId);
  check('same new UTR on two loans concurrently: one 201, one 409 DUPLICATE_UTR; only one loan changed', [u1.status, u2.status].sort().join(',') === '201,409' && s6.loan!.totalPaid + s7.loan!.totalPaid === 100_000 && s6.sum + s7.sum === 100_000, [u1.status, u1.body?.error?.code, u2.status, u2.body?.error?.code]);

  // Global invariant on everything recorded in this run.
  const loans = await LoanModel.find({}).lean();
  let broken = 0;
  for (const loan of loans) {
    const sum = (await PaymentModel.find({ loanId: loan._id }).lean()).reduce((s, p) => s + p.amount, 0);
    const closedOk = loan.status === 'CLOSED' ? loan.totalPaid === loan.totalRepayment && Boolean(loan.closedAt) : loan.totalPaid < loan.totalRepayment || loan.status !== 'DISBURSED';
    if (sum !== loan.totalPaid || loan.totalPaid > loan.totalRepayment || !closedOk) broken += 1;
  }
  check(`invariants over ${loans.length} loans: totalPaid == sum(payments) ≤ totalRepayment; CLOSED ⇔ fully paid`, broken === 0, broken);
} finally {
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
