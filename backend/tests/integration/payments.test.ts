import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { LoanModel } from '../../src/models/loan.model.js';
import { PaymentModel } from '../../src/models/payment.model.js';
import { toBusinessDate } from '../../src/utils/dates.js';
import {
  createDisbursedLoan,
  createSanctionedLoan,
  createStaff,
  type StaffUsers,
  type TestLoan,
} from '../helpers/loans.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('collection: payments and auto-close', () => {
  const app = createApp();
  let staff: StaffUsers;
  let loan: TestLoan;
  const today = toBusinessDate();

  beforeAll(startTestDatabase);
  beforeEach(async () => {
    staff = await createStaff();
    loan = await createDisbursedLoan(app, staff);
  });
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  function pay(body: object, cookie = staff.COLLECTION.cookie, loanId = loan.loanId) {
    return request(app).post(`/api/v1/loans/${loanId}/payments`).set('Cookie', cookie).send(body);
  }

  it('records a partial payment and lowers the outstanding balance', async () => {
    const response = await pay({ utr: 'UTR100001', amount: 5_000_000, paymentDate: today });

    expect(response.status).toBe(201);
    expect(response.body.data.payment).toMatchObject({
      utr: 'UTR100001',
      amount: 5_000_000,
      paymentDate: today,
      recordedBy: { name: 'Test COLLECTION' },
    });
    expect(response.body.data.loan).toMatchObject({
      status: 'DISBURSED',
      totalPaid: 5_000_000,
      outstanding: loan.totalRepayment - 5_000_000,
    });
  });

  it('closes the loan automatically when the balance reaches zero', async () => {
    await pay({ utr: 'UTR100001', amount: 5_000_000, paymentDate: today });

    const final = await pay({
      utr: 'UTR100002',
      amount: loan.totalRepayment - 5_000_000,
      paymentDate: today,
    });

    expect(final.status).toBe(201);
    expect(final.body.data.loan).toMatchObject({ status: 'CLOSED', outstanding: 0 });
    expect(final.body.data.loan.closedAt).toEqual(expect.any(String));
    expect(final.body.data.loan.statusHistory.at(-1)).toMatchObject({
      from: 'DISBURSED',
      to: 'CLOSED',
      note: 'Auto-closed: fully repaid',
    });
    const progress = await request(app)
      .get('/api/v1/borrower/progress')
      .set('Cookie', loan.borrower.cookie);
    expect(progress.body.data.latestLoan.status).toBe('CLOSED');
  });

  it('rejects a duplicate UTR (trimmed, any case) and writes nothing', async () => {
    await pay({ utr: 'UTR100001', amount: 1_000_000, paymentDate: today });

    const duplicate = await pay({ utr: '  utr100001 ', amount: 1_000_000, paymentDate: today });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_UTR');
    expect(await PaymentModel.countDocuments()).toBe(1);
    expect((await LoanModel.findById(loan.loanId))?.totalPaid).toBe(1_000_000);
  });

  it('rejects paying more than the outstanding balance', async () => {
    const response = await pay({
      utr: 'UTR100001',
      amount: loan.totalRepayment + 1,
      paymentDate: today,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PAYMENT_RULES_FAILED');
    expect(response.body.error.details.failures).toEqual([
      expect.objectContaining({ rule: 'AMOUNT_EXCEEDS_OUTSTANDING' }),
    ]);
    expect(await PaymentModel.countDocuments()).toBe(0);
  });

  it('rejects a payment dated in the future or before disbursal', async () => {
    const tomorrow = toBusinessDate(new Date(Date.now() + ONE_DAY_MS));
    const yesterday = toBusinessDate(new Date(Date.now() - ONE_DAY_MS));

    const future = await pay({ utr: 'UTR100001', amount: 1_000_000, paymentDate: tomorrow });
    const early = await pay({ utr: 'UTR100002', amount: 1_000_000, paymentDate: yesterday });

    expect(future.body.error.details.failures[0].rule).toBe('DATE_IN_FUTURE');
    expect(early.body.error.details.failures[0].rule).toBe('DATE_BEFORE_DISBURSAL');
  });

  it.each([
    ['a zero amount', { utr: 'UTR100001', amount: 0, paymentDate: '2026-01-01' }],
    ['a fractional amount', { utr: 'UTR100001', amount: 10.5, paymentDate: '2026-01-01' }],
    ['a UTR with symbols', { utr: 'UTR-1/2', amount: 100, paymentDate: '2026-01-01' }],
    ['an unknown field', { utr: 'UTR100001', amount: 100, paymentDate: '2026-01-01', x: 1 }],
  ])('rejects %s with 400', async (_case, body) => {
    expect((await pay(body)).status).toBe(400);
  });

  it('returns 409 for a loan that is not disbursed', async () => {
    const sanctioned = await createSanctionedLoan(app, staff);

    const response = await pay(
      { utr: 'UTR100001', amount: 1_000_000, paymentDate: today },
      staff.ADMIN.cookie,
      sanctioned.loanId,
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LOAN_NOT_DISBURSED');
  });

  it('never lets two simultaneous payments overpay the loan (transaction)', async () => {
    const sixtyPercent = Math.round(loan.totalRepayment * 0.6);

    const responses = await Promise.all([
      pay({ utr: 'UTRRACE0001', amount: sixtyPercent, paymentDate: today }),
      pay({ utr: 'UTRRACE0002', amount: sixtyPercent, paymentDate: today }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect((await LoanModel.findById(loan.loanId))?.totalPaid).toBe(sixtyPercent);
    expect(await PaymentModel.countDocuments()).toBe(1);
  });

  it('lists payments newest first for collection; 404 once the loan has closed', async () => {
    await pay({ utr: 'UTR100001', amount: 1_000_000, paymentDate: today });
    await pay({ utr: 'UTR100002', amount: 2_000_000, paymentDate: today });

    const list = await request(app)
      .get(`/api/v1/loans/${loan.loanId}/payments`)
      .set('Cookie', staff.COLLECTION.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((payment: { utr: string }) => payment.utr)).toEqual([
      'UTR100002',
      'UTR100001',
    ]);

    await pay({ utr: 'UTR100003', amount: loan.totalRepayment - 3_000_000, paymentDate: today });
    const afterClose = await request(app)
      .get(`/api/v1/loans/${loan.loanId}/payments`)
      .set('Cookie', staff.COLLECTION.cookie);
    const adminView = await request(app)
      .get(`/api/v1/loans/${loan.loanId}/payments`)
      .set('Cookie', staff.ADMIN.cookie);
    expect(afterClose.status).toBe(404);
    expect(adminView.body.data.pagination.totalItems).toBe(3);
  });

  it('returns 403 for roles other than COLLECTION and ADMIN', async () => {
    const body = { utr: 'UTR100001', amount: 1_000_000, paymentDate: today };
    for (const user of [staff.SANCTION, staff.DISBURSEMENT, staff.SALES, loan.borrower]) {
      expect((await pay(body, user.cookie)).status).toBe(403);
    }
    const anonymous = await request(app).post(`/api/v1/loans/${loan.loanId}/payments`).send(body);
    expect(anonymous.status).toBe(401);
  });
});
