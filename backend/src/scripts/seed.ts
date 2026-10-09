import bcrypt from 'bcrypt';
import { BCRYPT_COST, type Role } from '../config/constants.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { initModels } from '../models/index.js';
import { UserModel } from '../models/user.model.js';

// Shared demo password, published in the README so the evaluator can log in as every role.
const SEED_PASSWORD = 'Password@123';

interface SeedAccount {
  email: string;
  name: string;
  role: Role;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { email: 'admin@lms.dev', name: 'Asha Admin', role: 'ADMIN' },
  { email: 'sales@lms.dev', name: 'Sahil Sales', role: 'SALES' },
  { email: 'sanction@lms.dev', name: 'Sanjana Sanction', role: 'SANCTION' },
  { email: 'disbursement@lms.dev', name: 'Dev Disbursement', role: 'DISBURSEMENT' },
  { email: 'collection@lms.dev', name: 'Kavya Collection', role: 'COLLECTION' },
  { email: 'borrower@lms.dev', name: 'Bala Borrower', role: 'BORROWER' },
];

function assertSafeToRun(): void {
  const isForced = process.argv.includes('--force');
  if (env.NODE_ENV === 'production' && !isForced) {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. Re-run with --force if you mean it.',
    );
  }
}

/**
 * Upserts every seed account by email. Re-running resets their name, role and password,
 * so the end state is always the same. Accounts not in the list are never touched.
 */
async function seedAccounts(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);
  for (const account of SEED_ACCOUNTS) {
    await UserModel.updateOne(
      { email: account.email },
      { $set: { name: account.name, role: account.role, passwordHash } },
      { upsert: true },
    );
  }
  logger.info({ accounts: SEED_ACCOUNTS.length }, 'Seeded user accounts');
}

async function main(): Promise<void> {
  assertSafeToRun();
  await connectToDatabase(env.MONGODB_URI);
  try {
    await initModels();
    await seedAccounts();
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Seed failed');
  process.exitCode = 1;
});
