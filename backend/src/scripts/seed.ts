import { connectToDatabase, disconnectFromDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { initModels } from '../models/index.js';
import { seedDemoData } from './seed-demo.js';
import { removeTestData } from './test-data/test-data-cleanup.js';
import { seedTestData } from './test-data/test-data-seed.js';

// Usage (from backend/):
//   npm run seed                          the @lms.dev demo accounts and data
//   npm run seed -- --test-data           adds the @test.lms.dev QA data (docs/TEST_ACCOUNTS.md)
//   npm run seed -- --remove-test-data    deletes only the @test.lms.dev users and their data
// Add --force to run any of them with NODE_ENV=production.

type SeedMode = 'demo' | 'add-test-data' | 'remove-test-data';

function parseSeedMode(args: readonly string[]): SeedMode {
  const wantsTestData = args.includes('--test-data');
  const wantsRemoval = args.includes('--remove-test-data');
  if (wantsTestData && wantsRemoval) {
    throw new Error('Use either --test-data or --remove-test-data, not both.');
  }
  if (wantsTestData) return 'add-test-data';
  if (wantsRemoval) return 'remove-test-data';
  return 'demo';
}

function assertSafeToRun(args: readonly string[]): void {
  if (env.NODE_ENV === 'production' && !args.includes('--force')) {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. Re-run with --force if you mean it.',
    );
  }
}

async function runSeed(mode: SeedMode): Promise<void> {
  switch (mode) {
    case 'demo':
      logger.info(await seedDemoData(), 'Seed complete');
      return;
    case 'add-test-data':
      logger.info(await seedTestData(), 'Test data added');
      return;
    case 'remove-test-data':
      logger.info(await removeTestData(), 'Test data removed');
      return;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = parseSeedMode(args);
  assertSafeToRun(args);
  await connectToDatabase(env.MONGODB_URI);
  try {
    await initModels();
    await runSeed(mode);
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Seed failed');
  process.exitCode = 1;
});
