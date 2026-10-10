// Lens D7: demo seed idempotency, demo logins, test-data add/remove leave the demo data intact.
import mongoose from 'mongoose';
import { BorrowerProfileModel } from '../src/models/borrower-profile.model.js';
import { LoanModel } from '../src/models/loan.model.js';
import { PaymentModel } from '../src/models/payment.model.js';
import { UserModel } from '../src/models/user.model.js';
import { seedDemoData } from '../src/scripts/seed-demo.js';
import { removeTestData } from '../src/scripts/test-data/test-data-cleanup.js';
import { seedTestData } from '../src/scripts/test-data/test-data-seed.js';
import { createDisbursedLoan, createStaff } from '../tests/helpers/loans.js';
import { check, cookieFrom, get, login, note, post, start, stop, summary } from './harness.js';

const isDemo = (email: string) => email.endsWith('@lms.dev') && !email.endsWith('@test.lms.dev');

async function collectionCounts(): Promise<Record<string, number>> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  const out: Record<string, number> = {};
  for (const name of ['users', 'borrower_profiles', 'loans', 'payments', 'salary_slips.files', 'salary_slips.chunks']) {
    out[name] = await db.collection(name).countDocuments();
  }
  return out;
}

/** Full content-level snapshot of the demo data, keyed by email (ids optional). */
async function demoSnapshot(withIds: boolean, withUtrs: boolean) {
  const users = (await UserModel.find().select('+passwordHash').lean()).filter((u) => isDemo(u.email));
  const emailById = new Map((await UserModel.find().lean()).map((u) => [u._id.toString(), u.email]));
  const result: Record<string, unknown> = {};
  for (const user of users.sort((a, b) => a.email.localeCompare(b.email))) {
    const profile = await BorrowerProfileModel.findOne({ userId: user._id }).lean();
    const loans = await LoanModel.find({ borrowerId: user._id }).sort({ _id: 1 }).lean();
    const loanViews = [];
    for (const loan of loans) {
      const payments = await PaymentModel.find({ loanId: loan._id }).sort({ _id: 1 }).lean();
      loanViews.push({
        ...(withIds ? { id: loan._id.toString() } : {}),
        status: loan.status,
        principal: loan.principal,
        tenureDays: loan.tenureDays,
        simpleInterest: loan.simpleInterest,
        totalRepayment: loan.totalRepayment,
        totalPaid: loan.totalPaid,
        rejectionReason: loan.rejectionReason ?? null,
        history: loan.statusHistory.map((h) => `${h.from}->${h.to}@${h.byRole}:${emailById.get(String(h.by))}:${h.note ?? ''}`),
        hasClosedAt: Boolean(loan.closedAt),
        payments: payments.map((p) => `${withUtrs ? p.utr : '*'}:${p.amount}:${emailById.get(String(p.recordedBy))}`),
      });
    }
    result[user.email] = {
      ...(withIds ? { id: user._id.toString() } : {}),
      name: user.name,
      role: user.role,
      profile: profile
        ? {
            fullName: profile.fullName,
            pan: profile.pan,
            dob: profile.dateOfBirth.toISOString(),
            salary: profile.monthlySalary,
            mode: profile.employmentMode,
            isEligible: profile.breResult.isEligible,
            failures: profile.breResult.failures.map((f) => f.rule),
            hasSlip: Boolean(profile.salarySlip),
          }
        : null,
      loans: loanViews,
    };
  }
  return result;
}

/** The exact comparison the task asks for: user ids, loan ids/status/totalPaid, payment counts. */
async function demoIdentity() {
  const users = (await UserModel.find().lean()).filter((u) => isDemo(u.email));
  const ids = users.map((u) => u._id);
  const loans = await LoanModel.find({ borrowerId: mongoose.trusted({ $in: ids }) }).sort({ _id: 1 }).lean();
  const perLoanPayments: string[] = [];
  for (const loan of loans) perLoanPayments.push(`${loan._id}:${await PaymentModel.countDocuments({ loanId: loan._id })}`);
  const slips = await mongoose.connection.db?.collection('salary_slips.files').countDocuments({ 'metadata.ownerId': { $in: ids } });
  return {
    userIds: users.map((u) => `${u.email}:${u._id}:${u.role}`).sort(),
    loans: loans.map((l) => `${l._id}:${l.status}:${l.totalPaid}`),
    perLoanPayments,
    profiles: await BorrowerProfileModel.countDocuments({ userId: mongoose.trusted({ $in: ids }) }),
    slips,
  };
}

const app = await start();
try {
  // ── 1) seedDemoData twice: same state ──
  const first = await seedDemoData();
  note(`first run: ${JSON.stringify(first)}`);
  const countsA = await collectionCounts();
  const snapA = await demoSnapshot(false, true);
  const idsA = (await UserModel.find().lean()).map((u) => `${u.email}:${u._id}`).sort();
  const second = await seedDemoData();
  const countsB = await collectionCounts();
  const snapB = await demoSnapshot(false, true);
  const snapBNoUtr = await demoSnapshot(false, false);
  const snapANoUtr = JSON.parse(JSON.stringify(snapA)) as Record<string, { loans: { payments: string[] }[] }>;
  for (const u of Object.values(snapANoUtr)) for (const l of u.loans) l.payments = l.payments.map((p) => `*${p.slice(p.indexOf(':'))}`);
  const idsB = (await UserModel.find().lean()).map((u) => `${u.email}:${u._id}`).sort();
  check('second run returns the same counts', JSON.stringify(first) === JSON.stringify(second), { first, second });
  check('collection counts identical after run 2 (users, profiles, loans, payments, GridFS files/chunks)', JSON.stringify(countsA) === JSON.stringify(countsB), { countsA, countsB });
  note(`counts: ${JSON.stringify(countsB)}`);
  check('user ids identical after run 2 (upsert by email)', JSON.stringify(idsA) === JSON.stringify(idsB));
  check('demo content identical (profiles, BRE, loans, totals, history, payments), ignoring loan ids and UTRs', JSON.stringify(snapANoUtr) === JSON.stringify(snapBNoUtr), { snapANoUtr, snapBNoUtr });
  const utrsA = (await PaymentModel.find().lean()).map((p) => p.utr);
  note(`payment UTRs after the 2nd in-process run: ${utrsA.join(', ')}`);
  const sameWithUtrs = JSON.stringify(snapA) === JSON.stringify(snapB);
  note(`identical including UTRs (in one process): ${sameWithUtrs}`);
  const statuses = Object.fromEntries(Object.entries(snapB).map(([email, v]) => [email, (v as { loans: { status: string }[] }).loans.map((l) => l.status).join(',')]));
  note(`statuses: ${JSON.stringify(statuses)}`);
  // A third run, to check nothing accumulates.
  await seedDemoData();
  check('third run: collection counts still identical', JSON.stringify(await collectionCounts()) === JSON.stringify(countsA));

  // ── 2) every demo account logs in ──
  const demoUsers = (await UserModel.find().lean()).filter((u) => isDemo(u.email));
  check('17 demo accounts exist (5 staff + 12 borrowers)', demoUsers.length === 17, demoUsers.length);
  for (const user of demoUsers) {
    const res = await login(app, user.email, 'Password@123');
    let meRole = '';
    if (res.status === 200) {
      const me = await get(app, '/auth/me', cookieFrom(res));
      meRole = me.body?.data?.user?.role ?? me.body?.data?.role ?? '';
    }
    const bodyRole = res.body?.data?.user?.role ?? res.body?.data?.role;
    check(`login ${user.email} → 200, role ${user.role}`, res.status === 200 && bodyRole === user.role && meRole === user.role, { status: res.status, bodyRole, meRole });
  }
  const wrong = await login(app, 'admin@lms.dev', 'Password@1234');
  check('a wrong password → 401', wrong.status === 401, wrong.status);

  // ── 3) test data add/remove leaves the demo data intact ──
  const demoBefore = await demoIdentity();
  const demoContentBefore = await demoSnapshot(true, true);
  const countsBeforeTest = await collectionCounts();
  const added = await seedTestData();
  const countsWithTest = await collectionCounts();
  note(`seedTestData result: ${JSON.stringify(added)}`);
  check('seedTestData reports 60 users / 125 loans / 159 payments', added.users === 60 && added.loans === 125 && added.payments === 159, added);
  const delta = Object.fromEntries(Object.keys(countsWithTest).map((k) => [k, (countsWithTest[k] ?? 0) - (countsBeforeTest[k] ?? 0)]));
  note(`DB deltas after seedTestData: ${JSON.stringify(delta)}`);
  check('DB really grew by 60 users / 125 loans / 159 payments / 33 profiles / 27 slip files', delta.users === 60 && delta.loans === 125 && delta.payments === 159 && delta.borrower_profiles === 33 && delta['salary_slips.files'] === 27, delta);
  check('demo data unchanged while test data present', JSON.stringify(await demoIdentity()) === JSON.stringify(demoBefore));
  const removed = await removeTestData();
  note(`removeTestData result: ${JSON.stringify(removed)}`);
  check('removeTestData removes 60 / 125 / 159', removed.users === 60 && removed.loans === 125 && removed.payments === 159, removed);
  check('after removal: user ids, loan ids/status/totalPaid, payment counts per loan, profiles, slips identical', JSON.stringify(await demoIdentity()) === JSON.stringify(demoBefore), { before: demoBefore, after: await demoIdentity() });
  check('after removal: full demo content (incl. ids and UTRs) identical', JSON.stringify(await demoSnapshot(true, true)) === JSON.stringify(demoContentBefore));
  check('after removal: every collection count back to the pre-test-data value', JSON.stringify(await collectionCounts()) === JSON.stringify(countsBeforeTest), { before: countsBeforeTest, after: await collectionCounts() });
  // Demo logins still work after the add/remove cycle.
  const reLogin = await login(app, 'borrower@lms.dev', 'Password@123');
  check('borrower@lms.dev still logs in after the test-data cycle', reLogin.status === 200, reLogin.status);

  // ── 4) Edge: re-seeding deletes any payment whose UTR starts with "SEED", not just demo ones ──
  const staff = await createStaff();
  const loan = await createDisbursedLoan(app, staff);
  const pay = await post(app, `/loans/${loan.loanId}/payments`, staff.COLLECTION.cookie, { utr: 'seed12345678', amount: 1_000_000, paymentDate: new Date().toISOString().slice(0, 10) });
  note(`non-demo payment with UTR "seed12345678" → ${pay.status} utr=${pay.body?.data?.payment?.utr}`);
  const beforeReseed = await LoanModel.findById(loan.loanId).lean();
  await seedDemoData();
  const afterReseed = await LoanModel.findById(loan.loanId).lean();
  const remaining = await PaymentModel.countDocuments({ loanId: new mongoose.Types.ObjectId(loan.loanId) });
  note(`non-demo loan after re-seed: totalPaid ${beforeReseed?.totalPaid} → ${afterReseed?.totalPaid}, payments on it: ${remaining}`);
  check('EDGE: a real (non-demo) payment with a SEED… UTR survives a re-seed', remaining === 1, { remaining, totalPaid: afterReseed?.totalPaid });
  const adminLogin = await login(app, 'admin@lms.dev', 'Password@123');
  const adminView = await get(app, `/loans/${loan.loanId}`, cookieFrom(adminLogin));
  const paymentsView = await get(app, `/loans/${loan.loanId}/payments`, cookieFrom(adminLogin));
  note(`ADMIN GET loan → totalPaid=${adminView.body?.data?.loan?.totalPaid} outstanding=${adminView.body?.data?.loan?.outstanding}; GET payments → ${paymentsView.body?.data?.items?.length ?? JSON.stringify(paymentsView.body?.data).slice(0, 120)} items`);

  // ── 5) Edge: seedTestData when a real payment already uses a TEST-pattern UTR ──
  const loan2 = await createDisbursedLoan(app, staff);
  const pay2 = await post(app, `/loans/${loan2.loanId}/payments`, staff.COLLECTION.cookie, { utr: 'TEST00000001', amount: 1_000_000, paymentDate: new Date().toISOString().slice(0, 10) });
  note(`non-test payment with UTR TEST00000001 → ${pay2.status}`);
  const countsPre = await collectionCounts();
  let seedError = '';
  try {
    await seedTestData();
  } catch (error) {
    seedError = error instanceof Error ? error.message.slice(0, 160) : String(error);
  }
  const countsPost = await collectionCounts();
  note(`seedTestData with a colliding UTR: error="${seedError}"; deltas ${JSON.stringify(Object.fromEntries(Object.keys(countsPost).map((k) => [k, (countsPost[k] ?? 0) - (countsPre[k] ?? 0)])))}`);
  check('EDGE: seedTestData succeeds even when a real payment uses UTR TEST00000001', seedError === '', seedError);
  const cleanup = await removeTestData();
  note(`removeTestData after the failed seed: ${JSON.stringify(cleanup)}`);
} finally {
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
