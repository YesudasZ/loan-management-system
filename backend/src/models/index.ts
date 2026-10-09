import { BorrowerProfileModel } from './borrower-profile.model.js';
import { LoanModel } from './loan.model.js';
import { UserModel } from './user.model.js';

const ALL_MODELS = [UserModel, BorrowerProfileModel, LoanModel];

/**
 * Creates every collection and builds its indexes (for example the unique email index and the
 * one-active-loan index) before the app serves requests. Rejects if an index can't be built, so
 * startup fails loudly instead of running without a uniqueness guarantee.
 */
export async function initModels(): Promise<void> {
  await Promise.all(ALL_MODELS.map((model) => model.init()));
}
