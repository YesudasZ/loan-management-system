import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { BCRYPT_COST, type Role } from '../config/constants.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { initModels } from '../models/index.js';
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

function assertSafeToRun(): void {
  const isForced = process.argv.includes('--force');
  if (env.NODE_ENV === 'production' && !isForced) {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. Re-run with --force if you mean it.',
    );
  }
}

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

/**
 * Idempotent: every run ends in the same state. Only the seed accounts listed here are touched;
 * anyone who signed up on their own is left alone.
 */
async function seed(): Promise<void> {
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

  logger.info(
    { accounts: ALL_ACCOUNTS.length, demoBorrowers: DEMO_BORROWERS.length },
    'Seed complete',
  );
}

async function main(): Promise<void> {
  assertSafeToRun();
  await connectToDatabase(env.MONGODB_URI);
  try {
    await initModels();
    await seed();
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Seed failed');
  process.exitCode = 1;
});
