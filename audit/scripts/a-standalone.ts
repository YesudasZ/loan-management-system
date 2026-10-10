// Lens A: does the app work on a standalone (non-replica-set) MongoDB, e.g. a plain local mongod?
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/config/db.js';
import { initModels } from '../src/models/index.js';
import { createStaff, createDisbursedLoan } from '../tests/helpers/loans.js';

async function main(): Promise<void> {
  const server = await MongoMemoryServer.create();
  await connectToDatabase(server.getUri('lms_standalone'));
  await initModels();
  const app = createApp();
  const staff = await createStaff();
  const loan = await createDisbursedLoan(app, staff);
  process.stdout.write(`standalone: signup/profile/slip/apply/approve/disburse OK (loan ${loan.loanId})\n`);
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await request(app)
    .post(`/api/v1/loans/${loan.loanId}/payments`)
    .set('Cookie', staff.COLLECTION.cookie)
    .send({ utr: 'STANDALONE01', amount: 100000, paymentDate: today });
  process.stdout.write(`standalone payment → ${res.status} ${JSON.stringify(res.body)}\n`);
  await disconnectFromDatabase();
  await server.stop();
}

main().catch((error: unknown) => {
  process.stdout.write(`CRASH ${String(error)}\n`);
  process.exit(2);
});
