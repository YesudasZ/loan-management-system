// P1 verifier evidence copy. To re-run: mkdir backend/audit-tmp-v && cp audit/scripts/v-*.ts backend/audit-tmp-v/ && cp audit/scripts/d-harness.ts backend/audit-tmp-v/harness.ts, then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-v/<file>.ts
// P1 verifier: D-03 (re-seed deletes non-demo SEED… payments) and D-04 (seedTestData not atomic).
import { start, stop, check, note, summary, request, ORIGIN } from './harness.js';
import { createStaff, createDisbursedLoan } from '../tests/helpers/loans.js';
import { seedDemoData } from '../src/scripts/seed-demo.js';
import { seedTestData } from '../src/scripts/test-data/test-data-seed.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { LoanModel } from '../src/models/loan.model.js';
import { UserModel } from '../src/models/user.model.js';
import mongoose from 'mongoose';

const app = await start();
const staff = await createStaff();
const today = new Date().toISOString().slice(0, 10);

// D-03
await seedDemoData();
const loan = await createDisbursedLoan(app, staff);
const pay = await request(app).post(`/api/v1/loans/${loan.loanId}/payments`).set('Cookie', staff.COLLECTION.cookie).set('Origin', ORIGIN)
  .send({ utr: 'seed12345678', amount: 1_000_000, paymentDate: today });
const stored = await PaymentModel.findOne({ loanId: loan.loanId });
note(`D-03 non-demo payment utr "seed12345678" → ${pay.status}, stored utr ${stored?.utr}`);
await seedDemoData();
const left = await PaymentModel.countDocuments({ loanId: loan.loanId });
const l = await LoanModel.findById(loan.loanId);
note(`D-03 after re-seed: payments on the loan=${left}, loan.totalPaid=${l?.totalPaid}`);
check('D-03 reproduces: real SEED… payment deleted by re-seed, totalPaid kept', pay.status === 201 && left === 0 && l?.totalPaid === 1_000_000);

// D-04
const loan2 = await createDisbursedLoan(app, staff);
const pay2 = await request(app).post(`/api/v1/loans/${loan2.loanId}/payments`).set('Cookie', staff.COLLECTION.cookie).set('Origin', ORIGIN)
  .send({ utr: 'TEST00000001', amount: 1_000_000, paymentDate: today });
note(`D-04 non-test payment utr TEST00000001 → ${pay2.status}`);
let err = '';
try { await seedTestData(); } catch (e) { err = (e as Error).message.slice(0, 120); }
const testUsers = await UserModel.countDocuments({ email: /@test\.lms\.dev$/ });
const testUserIds = (await UserModel.find({ email: /@test\.lms\.dev$/ }).select('_id')).map((u) => u._id);
const testLoans = await LoanModel.find({ borrowerId: mongoose.trusted({ $in: testUserIds }) });
const testLoanIds = testLoans.map((x) => x._id);
const testPayments = await PaymentModel.countDocuments({ loanId: mongoose.trusted({ $in: testLoanIds }) });
const paidButNoPayments = testLoans.filter((x) => (x.totalPaid ?? 0) > 0).length;
note(`D-04 seedTestData error: ${err || '(none)'}`);
note(`D-04 after failure: test users=${testUsers}, test loans=${testLoans.length}, test payments=${testPayments}, loans with totalPaid>0=${paidButNoPayments}`);
check('D-04 reproduces: partial insert, loans with totalPaid>0 but no payments', err.includes('E11000') && testLoans.length > 0 && testPayments === 0 && paidButNoPayments > 0);
summary();
await stop();
