// Lens D7 (CLI): the real seed entrypoint, run as separate processes against a local in-memory
// replica set (never .env: tsx is called directly, without --env-file).
import { spawnSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { check, note, summary } from './harness.js';

const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const uri = replicaSet.getUri('lms_cli_seed');

function runSeed(args: string[], extraEnv: Record<string, string> = {}): { status: number | null; out: string } {
  const result = spawnSync('npx', ['tsx', 'src/scripts/seed.ts', ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_ENV: 'development',
      MONGODB_URI: uri,
      JWT_SECRET: 'audit-only-secret-0123456789abcdefghij',
      CORS_ORIGINS: 'http://localhost:3000',
      TRUST_PROXY_HOPS: '1',
      LOG_LEVEL: 'info',
      ...extraEnv,
    },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}`.trim() };
}

async function snapshot() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  const users = await db.collection('users').find().sort({ email: 1 }).toArray();
  const emailById = new Map(users.map((u) => [String(u._id), String(u.email)]));
  const loans = await db.collection('loans').find().toArray();
  const payments = await db.collection('payments').find().sort({ utr: 1 }).toArray();
  return {
    users: users.map((u) => `${u.email}:${u._id}:${u.role}`),
    loans: loans
      .map((l) => `${emailById.get(String(l.borrowerId))}:${l.status}:${l.principal}:${l.totalRepayment}:${l.totalPaid}:${(l.statusHistory as unknown[]).length}`)
      .sort(),
    payments: payments.map((p) => `${p.utr}:${p.amount}`),
    profiles: await db.collection('borrower_profiles').countDocuments(),
    slipFiles: await db.collection('salary_slips.files').countDocuments(),
    slipChunks: await db.collection('salary_slips.chunks').countDocuments(),
  };
}

try {
  await mongoose.connect(uri);

  const guard = runSeed([], { NODE_ENV: 'production' });
  const db = mongoose.connection.db;
  const usersAfterGuard = (await db?.collection('users').countDocuments()) ?? -1;
  check('NODE_ENV=production without --force → exit 1, nothing written', guard.status === 1 && usersAfterGuard === 0, { status: guard.status, usersAfterGuard, out: guard.out.slice(0, 200) });
  const both = runSeed(['--test-data', '--remove-test-data']);
  check('--test-data with --remove-test-data → exit 1', both.status === 1, both.status);

  const run1 = runSeed([]);
  check('CLI demo seed run 1 → exit 0', run1.status === 0, run1.out.slice(-300));
  const snap1 = await snapshot();
  const run2 = runSeed([]);
  check('CLI demo seed run 2 → exit 0', run2.status === 0, run2.out.slice(-300));
  const snap2 = await snapshot();
  check('two CLI runs → identical state (user ids, loans, payment UTRs+amounts, profiles, GridFS files/chunks)', JSON.stringify(snap1) === JSON.stringify(snap2), { snap1, snap2 });
  note(`state: ${snap2.users.length} users, ${snap2.loans.length} loans, payments ${snap2.payments.join(', ')}, ${snap2.profiles} profiles, ${snap2.slipFiles} slip files`);

  const add = runSeed(['--test-data']);
  check('CLI --test-data → exit 0', add.status === 0, add.out.slice(-300));
  note(`--test-data log: ${(add.out.match(/"users":\d+.*?"payments":\d+/) ?? [add.out.slice(-200)])[0]}`);
  const remove = runSeed(['--remove-test-data']);
  check('CLI --remove-test-data → exit 0', remove.status === 0, remove.out.slice(-300));
  note(`--remove-test-data log: ${(remove.out.match(/"users":\d+.*?"payments":\d+/) ?? [remove.out.slice(-200)])[0]}`);
  check('after CLI add + remove: state identical to the demo-only snapshot', JSON.stringify(await snapshot()) === JSON.stringify(snap2));
} finally {
  await mongoose.disconnect();
  await replicaSet.stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
