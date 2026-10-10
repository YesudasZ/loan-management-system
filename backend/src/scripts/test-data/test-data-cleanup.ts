import mongoose, { type Types } from 'mongoose';
import { BorrowerProfileModel } from '../../models/borrower-profile.model.js';
import { LoanModel } from '../../models/loan.model.js';
import { PaymentModel } from '../../models/payment.model.js';
import { UserModel } from '../../models/user.model.js';
import { deleteSalarySlipFilesOwnedBy } from '../../modules/uploads/salary-slip-storage.js';
import { TEST_EMAIL_DOMAIN } from './test-accounts.js';

/** Matches only `…@test.lms.dev`; the demo accounts (`…@lms.dev`) never match. */
const TEST_EMAIL_PATTERN = new RegExp(`@${TEST_EMAIL_DOMAIN.replaceAll('.', '\\.')}$`);

/** How many test documents a run created or removed. */
export interface TestDataCounts {
  users: number;
  profiles: number;
  salarySlips: number;
  loans: number;
  payments: number;
}

export async function findTestUserIds(): Promise<Types.ObjectId[]> {
  // A server-built operator, so it is marked trusted for sanitizeFilter.
  const users = await UserModel.find({
    email: mongoose.trusted({ $regex: TEST_EMAIL_PATTERN }),
  }).select('_id');
  return users.map((user) => user._id);
}

/** Deletes everything the given users own: payments on their loans, loans, slips, profiles. */
export async function deleteDataOwnedBy(
  userIds: Types.ObjectId[],
): Promise<Omit<TestDataCounts, 'users'>> {
  const loans = await LoanModel.find({ borrowerId: mongoose.trusted({ $in: userIds }) }).select(
    '_id',
  );
  const payments = await PaymentModel.deleteMany({
    loanId: mongoose.trusted({ $in: loans.map((loan) => loan._id) }),
  });
  const deletedLoans = await LoanModel.deleteMany({
    borrowerId: mongoose.trusted({ $in: userIds }),
  });
  const salarySlips = await deleteSalarySlipFilesOwnedBy(userIds);
  const profiles = await BorrowerProfileModel.deleteMany({
    userId: mongoose.trusted({ $in: userIds }),
  });
  return {
    profiles: profiles.deletedCount,
    salarySlips,
    loans: deletedLoans.deletedCount,
    payments: payments.deletedCount,
  };
}

/**
 * Deletes every `@test.lms.dev` user and everything they own. Nothing else is touched: the
 * `@lms.dev` demo accounts and real users stay exactly as they are.
 */
export async function removeTestData(): Promise<TestDataCounts> {
  const userIds = await findTestUserIds();
  const owned = await deleteDataOwnedBy(userIds);
  const users = await UserModel.deleteMany({ _id: mongoose.trusted({ $in: userIds }) });
  return { users: users.deletedCount, ...owned };
}
