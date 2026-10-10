// Lens D8: the full E2E flow from the video script, API-level, with a fresh borrower and the
// real seeded staff accounts (logged in with the published demo password).
import request from 'supertest';
import { seedDemoData } from '../src/scripts/seed-demo.js';
import { toBusinessDate } from '../src/utils/dates.js';
import { formatRupees } from '../src/utils/money.js';
import { ORIGIN, SMALL_PDF, check, cookieFrom, get, login, note, post, put, start, stop, summary } from './harness.js';

/** Today's IST calendar date minus whole years (Feb 29 → Feb 28). */
function yearsAgo(today: string, years: number): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const candidate = new Date(Date.UTC(y - years, m - 1, d));
  if (candidate.getUTCMonth() !== m - 1) candidate.setUTCDate(0);
  return candidate.toISOString().slice(0, 10);
}

const app = await start();
try {
  await seedDemoData();
  const today = toBusinessDate();
  note(`business date (IST): ${today}`);

  // 1. Signup.
  const email = `e2e.${Date.now()}@example.com`;
  const signup = await request(app).post('/api/v1/auth/signup').set('Origin', ORIGIN).send({ name: 'Ravi Kumar', email, password: 'Ravi@2026x' });
  check('1. signup → 201, role BORROWER, session cookie', signup.status === 201 && signup.body.data.user.role === 'BORROWER', { status: signup.status, body: signup.body });
  const borrower = cookieFrom(signup);
  const progress0 = await get(app, '/borrower/progress', borrower);
  check('1. fresh borrower progress → currentStep PROFILE, no profile, no loan', progress0.body.data.currentStep === 'PROFILE' && progress0.body.data.profile === null && progress0.body.data.latestLoan === null, progress0.body.data);

  // 2. Profile with a BRE fail.
  const dob21 = yearsAgo(today, 21);
  const failBody = { fullName: 'Ravi Kumar', dateOfBirth: dob21, monthlySalary: 2_000_000, pan: 'ABC123', employmentMode: 'UNEMPLOYED' };
  const fail = await put(app, '/borrower/profile', borrower, failBody);
  const failures: { rule: string; message: string }[] = fail.body?.error?.details?.failures ?? [];
  check(`2. DOB ${dob21} (21), ₹20,000, PAN ABC123, Unemployed → 422 BRE_FAILED`, fail.status === 422 && fail.body?.error?.code === 'BRE_FAILED', { status: fail.status, body: fail.body });
  check('2. the 422 lists ALL four failures [AGE, SALARY, PAN, EMPLOYMENT]', JSON.stringify(failures.map((f) => f.rule)) === JSON.stringify(['AGE', 'SALARY', 'PAN', 'EMPLOYMENT']), failures);
  for (const f of failures) note(`   ${f.rule}: ${f.message}`);
  note(`   envelope: ${JSON.stringify({ success: fail.body.success, code: fail.body.error?.code, message: fail.body.error?.message })}`);
  const progress1 = await get(app, '/borrower/progress', borrower);
  check('2. failed profile saved as not eligible; progress stays on PROFILE', progress1.body.data.currentStep === 'PROFILE' && progress1.body.data.isEligible === false && progress1.body.data.profile?.breResult?.failures?.length === 4, progress1.body.data);
  const slipBlocked = await request(app).post('/api/v1/borrower/salary-slip').set('Cookie', borrower).set('Origin', ORIGIN).attach('file', SMALL_PDF, { filename: 'slip.pdf', contentType: 'application/pdf' });
  check('2. slip upload while BRE failed → 409 PROFILE_INCOMPLETE', slipBlocked.status === 409 && slipBlocked.body.error.code === 'PROFILE_INCOMPLETE', slipBlocked.body);

  // 3. Fix it.
  const dob30 = yearsAgo(today, 30);
  const okBody = { fullName: 'Ravi Kumar', dateOfBirth: dob30, monthlySalary: 4_500_000, pan: 'ABCDE1234F', employmentMode: 'SALARIED' };
  const ok = await put(app, '/borrower/profile', borrower, okBody);
  check(`3. DOB ${dob30} (30), ₹45,000, ABCDE1234F, Salaried → 200, eligible`, ok.status === 200 && ok.body.data.profile.breResult.isEligible === true && ok.body.data.profile.breResult.failures.length === 0, { status: ok.status, body: ok.body });
  const progress2 = await get(app, '/borrower/progress', borrower);
  check('3. progress → SALARY_SLIP', progress2.body.data.currentStep === 'SALARY_SLIP', progress2.body.data.currentStep);

  // 4. Upload a small PDF.
  const slip = await request(app).post('/api/v1/borrower/salary-slip').set('Cookie', borrower).set('Origin', ORIGIN).attach('file', SMALL_PDF, { filename: 'my slip.pdf', contentType: 'application/pdf' });
  check('4. small PDF upload → 201 { contentType application/pdf, sizeBytes }', slip.status === 201 && slip.body.data.salarySlip.contentType === 'application/pdf' && slip.body.data.salarySlip.sizeBytes === SMALL_PDF.length, slip.body);
  const progress3 = await get(app, '/borrower/progress', borrower);
  check('4. progress → LOAN', progress3.body.data.currentStep === 'LOAN', progress3.body.data.currentStep);
  const ownSlip = await get(app, '/borrower/salary-slip', borrower).buffer(true);
  check('4. borrower can view own slip (200, same bytes)', ownSlip.status === 200 && Buffer.compare(Buffer.from(ownSlip.body as Buffer), SMALL_PDF) === 0, ownSlip.status);

  // 5. Apply ₹1,00,000 / 90 days.
  const apply = await post(app, '/borrower/loans', borrower, { principal: 10_000_000, tenureDays: 90 });
  const loan = apply.body?.data?.loan;
  check('5. apply ₹1,00,000 / 90 d → 201 APPLIED', apply.status === 201 && loan?.status === 'APPLIED', { status: apply.status, body: apply.body });
  check(`5. SI 295,890 paise (${formatRupees(loan?.simpleInterest ?? 0)}), total 10,295,890 (${formatRupees(loan?.totalRepayment ?? 0)}), 12% p.a.`, loan?.simpleInterest === 295_890 && loan?.totalRepayment === 10_295_890 && loan?.annualInterestRate === 12 && loan?.totalPaid === 0 && loan?.outstanding === 10_295_890, loan);
  const loanId = loan.id as string;
  const progress4 = await get(app, '/borrower/progress', borrower);
  check('5. progress → STATUS with latestLoan APPLIED', progress4.body.data.currentStep === 'STATUS' && progress4.body.data.latestLoan?.status === 'APPLIED', progress4.body.data);
  const again = await post(app, '/borrower/loans', borrower, { principal: 10_000_000, tenureDays: 90 });
  check('5. a second apply while APPLIED → 409 ACTIVE_LOAN_EXISTS', again.status === 409 && again.body.error.code === 'ACTIVE_LOAN_EXISTS', again.body);

  // 6. Sanction approves; disbursement disburses.
  const sanction = cookieFrom(await login(app, 'sanction@lms.dev', 'Password@123'));
  const sanctionQueue = await get(app, '/loans?limit=100', sanction);
  check('6. SANCTION queue contains the new loan (status APPLIED)', sanctionQueue.status === 200 && sanctionQueue.body.data.items.some((l: { id: string; status: string }) => l.id === loanId && l.status === 'APPLIED'), sanctionQueue.body.data?.items?.map((l: { id: string }) => l.id));
  const sanctionDetail = await get(app, `/loans/${loanId}`, sanction);
  check('6. SANCTION detail shows BRE result, slip, masked PAN', sanctionDetail.status === 200 && sanctionDetail.body.data.loan.applicant.breResult.isEligible === true && Boolean(sanctionDetail.body.data.loan.salarySlip) && sanctionDetail.body.data.loan.applicant.panMasked === 'ABCDE****F', sanctionDetail.body.data?.loan?.applicant);
  const staffSlip = await get(app, `/loans/${loanId}/salary-slip`, sanction).buffer(true);
  check('6. SANCTION can open the slip (200, same bytes)', staffSlip.status === 200 && Buffer.compare(Buffer.from(staffSlip.body as Buffer), SMALL_PDF) === 0, staffSlip.status);
  const approve = await post(app, `/loans/${loanId}/approve`, sanction);
  check('6. approve → 200 SANCTIONED', approve.status === 200 && approve.body.data.loan.status === 'SANCTIONED', approve.body);
  const sanctionQueueAfter = await get(app, '/loans?limit=100', sanction);
  check('6. the loan leaves the SANCTION queue', !sanctionQueueAfter.body.data.items.some((l: { id: string }) => l.id === loanId));

  const disbursement = cookieFrom(await login(app, 'disbursement@lms.dev', 'Password@123'));
  const disbQueue = await get(app, '/loans?limit=100', disbursement);
  check('6. DISBURSEMENT queue contains it (SANCTIONED)', disbQueue.body.data.items.some((l: { id: string; status: string }) => l.id === loanId && l.status === 'SANCTIONED'));
  const disburse = await post(app, `/loans/${loanId}/disburse`, disbursement);
  check('6. disburse → 200 DISBURSED, disbursedAt set', disburse.status === 200 && disburse.body.data.loan.status === 'DISBURSED' && Boolean(disburse.body.data.loan.disbursedAt), disburse.body);
  const borrowerMid = await get(app, `/borrower/loans/${loanId}`, borrower);
  check('6. borrower sees DISBURSED with outstanding 10,295,890', borrowerMid.body.data.loan.status === 'DISBURSED' && borrowerMid.body.data.loan.outstanding === 10_295_890, borrowerMid.body.data.loan);

  // 7. Collection.
  const collection = cookieFrom(await login(app, 'collection@lms.dev', 'Password@123'));
  const collQueue = await get(app, '/loans?limit=100', collection);
  check('7. COLLECTION queue contains it (DISBURSED, outstanding ₹1,02,958.90)', collQueue.body.data.items.some((l: { id: string; outstanding: number }) => l.id === loanId && l.outstanding === 10_295_890));
  const pay1 = await post(app, `/loans/${loanId}/payments`, collection, { utr: 'DEMOUTR0001', amount: 5_000_000, paymentDate: today });
  check('7. pay ₹50,000 (DEMOUTR0001) → 201; totalPaid 5,000,000, outstanding 5,295,890 (₹52,958.90), still DISBURSED', pay1.status === 201 && pay1.body.data.loan.totalPaid === 5_000_000 && pay1.body.data.loan.outstanding === 5_295_890 && pay1.body.data.loan.status === 'DISBURSED' && pay1.body.data.payment.utr === 'DEMOUTR0001', { status: pay1.status, body: pay1.body });
  note(`   remaining shown as ${formatRupees(pay1.body.data.loan.outstanding)}`);
  const dup = await post(app, `/loans/${loanId}/payments`, collection, { utr: 'DEMOUTR0001', amount: 100_000, paymentDate: today });
  check('7. the same UTR again → 409 DUPLICATE_UTR', dup.status === 409 && dup.body.error.code === 'DUPLICATE_UTR', { status: dup.status, body: dup.body });
  note(`   409 message: ${dup.body.error.message}`);
  const afterDup = await get(app, `/loans/${loanId}`, collection);
  const paymentsAfterDup = await get(app, `/loans/${loanId}/payments`, collection);
  check('7. the duplicate changed nothing (totalPaid 5,000,000, 1 payment)', afterDup.body.data.loan.totalPaid === 5_000_000 && paymentsAfterDup.body.data.items.length === 1, { totalPaid: afterDup.body.data.loan.totalPaid, payments: paymentsAfterDup.body.data.items.length });
  const pay2 = await post(app, `/loans/${loanId}/payments`, collection, { utr: 'DEMOUTR0002', amount: 5_295_890, paymentDate: today });
  check('7. pay the exact remaining ₹52,958.90 (DEMOUTR0002) → 201, CLOSED, outstanding 0, closedAt set', pay2.status === 201 && pay2.body.data.loan.status === 'CLOSED' && pay2.body.data.loan.outstanding === 0 && pay2.body.data.loan.totalPaid === 10_295_890 && Boolean(pay2.body.data.loan.closedAt), { status: pay2.status, body: pay2.body });
  const collQueueAfter = await get(app, '/loans?limit=100', collection);
  check('7. the closed loan leaves the COLLECTION queue', !collQueueAfter.body.data.items.some((l: { id: string }) => l.id === loanId));

  // 8. The borrower sees CLOSED with the full history (after a fresh login, like the video).
  await post(app, '/auth/logout', borrower);
  const borrowerAgain = cookieFrom(await login(app, email, 'Ravi@2026x'));
  const progress5 = await get(app, '/borrower/progress', borrowerAgain);
  const latest = progress5.body.data.latestLoan;
  check('8. progress → STATUS, latestLoan CLOSED, totalPaid == total, outstanding 0', progress5.body.data.currentStep === 'STATUS' && latest?.status === 'CLOSED' && latest?.totalPaid === 10_295_890 && latest?.outstanding === 0 && Boolean(latest?.closedAt), latest);
  const history = (latest?.statusHistory ?? []).map((h: { from: string | null; to: string; byRole: string }) => `${h.from}->${h.to}@${h.byRole}`);
  check('8. full status history: APPLIED@BORROWER → SANCTIONED@SANCTION → DISBURSED@DISBURSEMENT → CLOSED@COLLECTION', JSON.stringify(history) === JSON.stringify(['null->APPLIED@BORROWER', 'APPLIED->SANCTIONED@SANCTION', 'SANCTIONED->DISBURSED@DISBURSEMENT', 'DISBURSED->CLOSED@COLLECTION']), history);
  note(`   history notes: ${JSON.stringify((latest?.statusHistory ?? []).map((h: { note: string | null }) => h.note))}`);
  const times = (latest?.statusHistory ?? []).map((h: { at: string }) => Date.parse(h.at));
  check('8. history timestamps are in order', times.every((t: number, i: number) => i === 0 || t >= times[i - 1]), times);
  const list = await get(app, '/borrower/loans', borrowerAgain);
  check('8. GET /borrower/loans → exactly this loan, CLOSED', list.body.data.items.length === 1 && list.body.data.items[0].id === loanId && list.body.data.items[0].status === 'CLOSED', list.body.data.items);
  const detail = await get(app, `/borrower/loans/${loanId}`, borrowerAgain);
  check('8. GET /borrower/loans/:id → CLOSED, 4 history entries, no staff ids', detail.status === 200 && detail.body.data.loan.status === 'CLOSED' && detail.body.data.loan.statusHistory.length === 4 && !JSON.stringify(detail.body).includes('"by"'), detail.body.data.loan);
  note(`   borrower loan keys: ${Object.keys(detail.body.data.loan).join(', ')}`);

  // Cross-checks: admin sees the 2 payments; admin summary counts it as CLOSED.
  const admin = cookieFrom(await login(app, 'admin@lms.dev', 'Password@123'));
  const adminPayments = await get(app, `/loans/${loanId}/payments`, admin);
  check('ADMIN sees exactly the 2 payments (DEMOUTR0002, DEMOUTR0001), sum = total', adminPayments.body.data.items.map((p: { utr: string }) => p.utr).join(',') === 'DEMOUTR0002,DEMOUTR0001' && adminPayments.body.data.items.reduce((s: number, p: { amount: number }) => s + p.amount, 0) === 10_295_890, adminPayments.body.data.items);
  const summaryRes = await get(app, '/dashboard/summary', admin);
  note(`admin summary: ${JSON.stringify(summaryRes.body.data)}`);
  check('admin summary CLOSED = 2 (demo.closed + this one)', summaryRes.body.data.loansByStatus.CLOSED === 2, summaryRes.body.data);
} finally {
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
