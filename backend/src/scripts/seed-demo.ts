import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { BCRYPT_COST, type Role } from '../config/constants.js';
import { UserModel } from '../models/user.model.js';
import { DEMO_BORROWERS, resetDemoBorrowerData, seedDemoBorrower } from './seed-borrowers.js';
import { advanceDemoLoan, loadSeedStaff } from './seed-loan-outcomes.js';

// Shared demo password, published in the README so the evaluator can log in as every role.
const SEED_PASSWORD = 'Password@123';

interface SeedAccount {
  email: string;
  name: string;
  role: Role;
}

const STAFF_ACCOUNTS: SeedAccount[] = [
  { email: 'admin@lms.dev', name: 'Asha Admin', role: 'ADMIN' },
  { email: 'sales@lms.dev', name: 'Sahil Sales', role: 'SALES' },
  { email: 'sanction@lms.dev', name: 'Sanjana Sanction', role: 'SANCTION' },
  { email: 'disbursement@lms.dev', name: 'Dev Disbursement', role: 'DISBURSEMENT' },
  { email: 'collection@lms.dev', name: 'Kavya Collection', role: 'COLLECTION' },
];

const ALL_ACCOUNTS: SeedAccount[] = [
  ...STAFF_ACCOUNTS,
  ...DEMO_BORROWERS.map(({ email, name }) => ({ email, name, role: 'BORROWER' as const })),
];

/** Upserts every seed account by email, resetting name, role and password each run. */
async function seedAccounts(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);
  for (const account of ALL_ACCOUNTS) {
    await UserModel.updateOne(
      { email: account.email },
      { $set: { name: account.name, role: account.role, passwordHash } },
      { upsert: true },
    );
  }
}

export interface DemoSeedResult {
  accounts: number;
  demoBorrowers: number;
}

/**
 * The @lms.dev demo accounts and their data. Idempotent: every run ends in the same state.
 * Only the accounts listed here are touched; anyone who signed up on their own is left alone.
 */
export async function seedDemoData(): Promise<DemoSeedResult> {
  await seedAccounts();

  const demoEmails = DEMO_BORROWERS.map((demo) => demo.email);
  const demoUsers = await UserModel.find({ email: mongoose.trusted({ $in: demoEmails }) });
  await resetDemoBorrowerData(demoUsers.map((user) => user._id));
  const staff = await loadSeedStaff();
  for (const demo of DEMO_BORROWERS) {
    const loanId = await seedDemoBorrower(demo);
    if (loanId && demo.loan) {
      await advanceDemoLoan(loanId, demo.loan, staff);
    }
  }

  return { accounts: ALL_ACCOUNTS.length, demoBorrowers: DEMO_BORROWERS.length };
}
