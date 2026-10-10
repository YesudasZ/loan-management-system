import mongoose, { type Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANNUAL_INTEREST_RATE_PERCENT } from '../../src/config/constants.js';
import { BorrowerProfileModel } from '../../src/models/borrower-profile.model.js';
import { LoanModel, type LoanDocument } from '../../src/models/loan.model.js';
import { PaymentModel, type PaymentDocument } from '../../src/models/payment.model.js';
import { UserModel } from '../../src/models/user.model.js';
import { AUTO_CLOSE_NOTE } from '../../src/modules/payments/payments.service.js';
import { seedDemoData } from '../../src/scripts/seed-demo.js';
import { TEST_BORROWERS, TEST_STAFF } from '../../src/scripts/test-data/test-accounts.js';
import { removeTestData } from '../../src/scripts/test-data/test-data-cleanup.js';
import { seedTestData } from '../../src/scripts/test-data/test-data-seed.js';
import { toBusinessDate, utcMidnightToCalendarDate } from '../../src/utils/dates.js';
import { calculateLoanQuote } from '../../src/utils/loan-math.js';
import { getNextStatus, type LoanAction } from '../../src/utils/loan-state-machine.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const isTestEmail = (email: string) => email.endsWith('@test.lms.dev');
const isDemoEmail = (email: string) => email.endsWith('@lms.dev') && !isTestEmail(email);

/** The action that produces each transition, to replay a loan's history through the machine. */
const ACTION_FOR_STATUS: Record<string, LoanAction> = {
  SANCTIONED: 'APPROVE',
  REJECTED: 'REJECT',
  DISBURSED: 'DISBURSE',
  CLOSED: 'AUTO_CLOSE',
};

async function usersWhere(predicate: (email: string) => boolean) {
  const users = await UserModel.find().select('email role');
  return users.filter((user) => predicate(user.email));
}

async function countSlipFilesOwnedBy(ownerIds: Types.ObjectId[]): Promise<number> {
  const files = mongoose.connection.db?.collection('salary_slips.files');
  return (await files?.countDocuments({ 'metadata.ownerId': { $in: ownerIds } })) ?? 0;
}

/** Everything the @lms.dev demo seed owns, to prove the test data never touches it. */
async function snapshotDemoData() {
  const users = await usersWhere(isDemoEmail);
  const userIds = users.map((user) => user._id);
  const loans = await LoanModel.find({ borrowerId: mongoose.trusted({ $in: userIds }) }).sort({
    _id: 1,
  });
  const payments = await PaymentModel.countDocuments({
    loanId: mongoose.trusted({ $in: loans.map((loan) => loan._id) }),
  });
  return {
    userIds: userIds.map(String).sort(),
    loans: loans.map((loan) => `${loan.id}:${loan.status}:${loan.totalPaid}`),
    payments,
    profiles: await BorrowerProfileModel.countDocuments({
      userId: mongoose.trusted({ $in: userIds }),
    }),
    slips: await countSlipFilesOwnedBy(userIds),
  };
}

async function loadTestLoans(): Promise<{ loan: LoanDocument; payments: PaymentDocument[] }[]> {
  const borrowers = await usersWhere(isTestEmail);
  const loans = await LoanModel.find({
    borrowerId: mongoose.trusted({ $in: borrowers.map((user) => user._id) }),
  });
  const payments = await PaymentModel.find({
    loanId: mongoose.trusted({ $in: loans.map((loan) => loan._id) }),
  });
  return loans.map((loan) => ({
    loan,
    payments: payments.filter((payment) => payment.loanId.equals(loan._id)),
  }));
}

describe('test data seed (--test-data / --remove-test-data)', () => {
  let demoBefore: Awaited<ReturnType<typeof snapshotDemoData>>;
  let firstRun: Awaited<ReturnType<typeof seedTestData>>;
  const seededAt = new Date();

  beforeAll(async () => {
    await startTestDatabase();
    await seedDemoData();
    demoBefore = await snapshotDemoData();
    firstRun = await seedTestData();
  });
  afterAll(stopTestDatabase);

  it('creates 25 staff, 25 borrowers and 10 leads, all on @test.lms.dev', async () => {
    const users = await usersWhere(isTestEmail);
    const roles = users.map((user) => user.role);

    expect(firstRun).toMatchObject({ users: 60, loans: 125, profiles: 33, salarySlips: 27 });
    expect(users).toHaveLength(60);
    for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION']) {
      expect(roles.filter((candidate) => candidate === role)).toHaveLength(5);
    }
    expect(roles.filter((role) => role === 'BORROWER')).toHaveLength(35);
  });

  it('puts at least 5 test loans in every status', async () => {
    const statuses = (await loadTestLoans()).map(({ loan }) => loan.status);
    for (const status of ['APPLIED', 'SANCTIONED', 'DISBURSED']) {
      expect(statuses.filter((candidate) => candidate === status)).toHaveLength(5);
    }
    for (const status of ['CLOSED', 'REJECTED']) {
      expect(statuses.filter((candidate) => candidate === status).length).toBeGreaterThan(5);
    }
  });

  it('keeps every loan consistent: totals, payments, history and dates', async () => {
    const today = toBusinessDate();
    for (const { loan, payments } of await loadTestLoans()) {
      const quote = calculateLoanQuote({
        principal: loan.principal,
        tenureDays: loan.tenureDays,
        annualInterestRate: ANNUAL_INTEREST_RATE_PERCENT,
      });
      expect(loan.simpleInterest).toBe(quote.simpleInterest);
      expect(loan.totalRepayment).toBe(quote.totalRepayment);
      expect(payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(loan.totalPaid);

      // The history replays through the state machine and is in time order.
      const [applied, ...transitions] = loan.statusHistory;
      expect(applied).toMatchObject({ from: null, to: 'APPLIED', byRole: 'BORROWER' });
      expect(applied?.at).toEqual(loan.createdAt);
      let status = 'APPLIED' as const as LoanDocument['status'];
      let previousAt = loan.createdAt;
      for (const entry of transitions) {
        const action = ACTION_FOR_STATUS[entry.to];
        expect(action).toBeDefined();
        if (action) expect(getNextStatus(status, action)).toBe(entry.to);
        expect(entry.at.getTime()).toBeGreaterThan(previousAt.getTime());
        status = entry.to;
        previousAt = entry.at;
      }
      expect(status).toBe(loan.status);
      expect(loan.updatedAt.getTime()).toBeLessThan(seededAt.getTime() + 60_000);
      expect(seededAt.getTime() - loan.createdAt.getTime()).toBeLessThan(NINETY_DAYS_MS);

      if (loan.status === 'CLOSED') {
        expect(loan.totalPaid).toBe(loan.totalRepayment);
        expect(loan.closedAt).toBeInstanceOf(Date);
        expect(loan.statusHistory.at(-1)?.note).toBe(AUTO_CLOSE_NOTE);
        expect(payments.length).toBeGreaterThanOrEqual(1);
        expect(payments.length).toBeLessThanOrEqual(3);
      } else if (loan.status === 'DISBURSED') {
        expect(loan.totalPaid).toBeLessThan(loan.totalRepayment);
      } else {
        expect(loan.totalPaid).toBe(0);
      }
      if (loan.status === 'REJECTED') {
        expect(loan.rejectionReason?.length).toBeGreaterThan(10);
        expect(loan.statusHistory.at(-1)?.note).toBe(loan.rejectionReason);
      }
      for (const payment of payments) {
        expect(payment.utr).toMatch(/^TEST\d{8}$/);
        const paidOn = utcMidnightToCalendarDate(payment.paymentDate);
        expect(paidOn >= toBusinessDate(loan.disbursedAt)).toBe(true);
        expect(paidOn <= today).toBe(true);
      }
    }
  });

  it('gives each borrower 4 finished past loans, each older than the next', async () => {
    const loans = await loadTestLoans();
    const users = await usersWhere(isTestEmail);
    for (const borrower of TEST_BORROWERS) {
      const user = users.find((candidate) => candidate.email === borrower.email);
      const own = loans
        .map(({ loan }) => loan)
        .filter((loan) => user && loan.borrowerId.equals(user._id))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      expect(own).toHaveLength(5);
      expect(own.at(-1)?.status).toBe(borrower.group);
      for (const [index, loan] of own.slice(0, 4).entries()) {
        expect(['CLOSED', 'REJECTED']).toContain(loan.status);
        const next = own[index + 1];
        expect(next && next.createdAt > loan.updatedAt).toBe(true);
      }
    }
  });

  it('spreads the work across every test executive and includes admins', async () => {
    const loans = await loadTestLoans();
    const actors = new Set(
      loans.flatMap(({ loan }) => loan.statusHistory.map((e) => String(e.by))),
    );
    const recorders = new Set(
      loans.flatMap(({ payments }) => payments.map((payment) => String(payment.recordedBy))),
    );
    const users = await usersWhere(isTestEmail);
    const idOf = (email: string) => String(users.find((user) => user.email === email)?._id);

    for (const staff of TEST_STAFF) {
      if (staff.role === 'SANCTION' || staff.role === 'DISBURSEMENT') {
        expect(actors.has(idOf(staff.email))).toBe(true);
      }
      if (staff.role === 'COLLECTION') {
        expect(recorders.has(idOf(staff.email))).toBe(true);
      }
    }
    const adminIds = TEST_STAFF.filter((staff) => staff.role === 'ADMIN').map((s) => idOf(s.email));
    expect(adminIds.some((id) => actors.has(id))).toBe(true);
    expect(adminIds.some((id) => recorders.has(id))).toBe(true);
  });

  it('is idempotent: a second run ends in the same state with the same accounts', async () => {
    const idsBefore = (await usersWhere(isTestEmail)).map((user) => String(user._id)).sort();

    const secondRun = await seedTestData();

    expect(secondRun).toEqual(firstRun);
    expect((await usersWhere(isTestEmail)).map((user) => String(user._id)).sort()).toEqual(
      idsBefore,
    );
    expect(await loadTestLoans()).toHaveLength(125);
    expect(await PaymentModel.countDocuments({ utr: mongoose.trusted({ $regex: /^TEST/ }) })).toBe(
      firstRun.payments,
    );
    expect(await snapshotDemoData()).toEqual(demoBefore);
  });

  it('--remove-test-data deletes only the test accounts and everything they own', async () => {
    const testIds = (await usersWhere(isTestEmail)).map((user) => user._id);

    const removed = await removeTestData();

    expect(removed).toEqual({
      users: 60,
      profiles: 33,
      salarySlips: 27,
      loans: 125,
      payments: firstRun.payments,
    });
    expect(await usersWhere(isTestEmail)).toHaveLength(0);
    expect(await LoanModel.countDocuments({ borrowerId: mongoose.trusted({ $in: testIds }) })).toBe(
      0,
    );
    expect(await PaymentModel.countDocuments({ utr: mongoose.trusted({ $regex: /^TEST/ }) })).toBe(
      0,
    );
    expect(
      await BorrowerProfileModel.countDocuments({ userId: mongoose.trusted({ $in: testIds }) }),
    ).toBe(0);
    expect(await countSlipFilesOwnedBy(testIds)).toBe(0);
    expect(await snapshotDemoData()).toEqual(demoBefore);
  });
});
