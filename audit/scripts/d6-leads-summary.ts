// Lens D6: Sales lead stages and exclusion; admin summary counts vs the database.
import type { Express } from 'express';
import mongoose from 'mongoose';
import { BorrowerProfileModel } from '../src/models/borrower-profile.model.js';
import { LoanModel } from '../src/models/loan.model.js';
import { UserModel } from '../src/models/user.model.js';
import { seedDemoData } from '../src/scripts/seed-demo.js';
import { seedTestData } from '../src/scripts/test-data/test-data-seed.js';
import { TEST_LEADS } from '../src/scripts/test-data/test-leads.js';
import { evaluateEligibility } from '../src/utils/bre.js';
import { toBusinessDate, utcMidnightToCalendarDate } from '../src/utils/dates.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { ELIGIBLE_PROFILE, uploadPdfSlip } from '../tests/helpers/borrower.js';
import { createAppliedLoan, createDisbursedLoan, createSanctionedLoan, createStaff } from '../tests/helpers/loans.js';
import { check, clearTestDatabase, get, note, post, put, start, stop, summary } from './harness.js';

interface Lead { id: string; email: string; stage: string; breFailures: { rule: string }[] }

async function allLeads(app: Express, cookie: string): Promise<{ items: Lead[]; total: number }> {
  const items: Lead[] = [];
  let page = 1;
  let total = 0;
  for (;;) {
    const res = await get(app, `/leads?page=${page}&limit=7`, cookie);
    if (res.status !== 200) throw new Error(`leads ${res.status}`);
    items.push(...res.body.data.items);
    total = res.body.data.pagination.totalItems;
    if (page >= res.body.data.pagination.totalPages) break;
    page += 1;
  }
  return { items, total };
}

/** Independent recomputation from the collections. */
async function expectedLeads(): Promise<Map<string, string>> {
  const today = toBusinessDate();
  const borrowers = await UserModel.find({ role: 'BORROWER' }).lean();
  const result = new Map<string, string>();
  for (const user of borrowers) {
    if ((await LoanModel.countDocuments({ borrowerId: user._id })) > 0) continue;
    const profile = await BorrowerProfileModel.findOne({ userId: user._id }).lean();
    let stage = 'PROFILE_PENDING';
    if (profile) {
      const bre = evaluateEligibility({ dateOfBirth: utcMidnightToCalendarDate(profile.dateOfBirth), monthlySalary: profile.monthlySalary, pan: profile.pan, employmentMode: profile.employmentMode }, today);
      stage = !bre.isEligible ? 'BRE_FAILED' : profile.salarySlip ? 'READY_TO_APPLY' : 'SALARY_SLIP_PENDING';
    }
    result.set(user._id.toString(), stage);
  }
  return result;
}

async function compareSummary(app: Express, adminCookie: string, label: string): Promise<void> {
  const res = await get(app, '/dashboard/summary', adminCookie);
  const db: Record<string, number> = {};
  for (const s of ['APPLIED', 'SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED']) db[s] = await LoanModel.countDocuments({ status: s });
  const leads = await allLeads(app, adminCookie);
  const expected = await expectedLeads();
  check(`${label}: summary.loansByStatus == DB counts`, JSON.stringify(res.body.data.loansByStatus) === JSON.stringify(db), { api: res.body.data.loansByStatus, db });
  check(`${label}: summary.leadCount (${res.body.data.leadCount}) == /leads totalItems (${leads.total}) == items fetched (${leads.items.length}) == independent count (${expected.size})`, res.body.data.leadCount === leads.total && leads.total === leads.items.length && leads.total === expected.size);
  const wrong = leads.items.filter((l) => expected.get(l.id) !== l.stage);
  check(`${label}: every lead's stage matches an independent recomputation`, wrong.length === 0, wrong);
  const dupes = leads.items.length - new Set(leads.items.map((l) => l.id)).size;
  check(`${label}: paging through /leads (limit=7) returns no duplicates`, dupes === 0, dupes);
  note(`${label}: ${JSON.stringify(res.body.data)}`);
}

const app = await start();
try {
  // 1) Hand-made dataset.
  const staff = await createStaff();
  const fresh = await createTestUser('BORROWER', 'lead-fresh@audit.dev');
  const failed = await createTestUser('BORROWER', 'lead-failed@audit.dev');
  await put(app, '/borrower/profile', failed.cookie, { ...ELIGIBLE_PROFILE, pan: 'ABC123', employmentMode: 'UNEMPLOYED' });
  const noSlip = await createTestUser('BORROWER', 'lead-noslip@audit.dev');
  await put(app, '/borrower/profile', noSlip.cookie, ELIGIBLE_PROFILE);
  const ready = await createTestUser('BORROWER', 'lead-ready@audit.dev');
  await put(app, '/borrower/profile', ready.cookie, ELIGIBLE_PROFILE);
  await uploadPdfSlip(app, ready.cookie);
  const applied = await createAppliedLoan(app);
  const sanctioned = await createSanctionedLoan(app, staff);
  const disbursed = await createDisbursedLoan(app, staff);
  const rejected = await createAppliedLoan(app);
  await post(app, `/loans/${rejected.loanId}/reject`, staff.SANCTION.cookie, { reason: 'Audit rejection' });
  const closed = await createDisbursedLoan(app, staff);
  await post(app, `/loans/${closed.loanId}/payments`, staff.COLLECTION.cookie, { utr: 'D6CLOSE0001', amount: closed.totalRepayment, paymentDate: toBusinessDate() });

  for (const role of ['SALES', 'ADMIN'] as const) {
    const res = await get(app, '/leads', staff[role].cookie);
    const byId = new Map<string, Lead>(res.body.data.items.map((l: Lead) => [l.id, l]));
    check(`${role} GET /leads → 200 with exactly 4 leads`, res.status === 200 && res.body.data.items.length === 4 && res.body.data.pagination.totalItems === 4, res.body.data.items.map((l: Lead) => l.email));
    check(`${role}: stages PROFILE_PENDING / BRE_FAILED / SALARY_SLIP_PENDING / READY_TO_APPLY`, byId.get(fresh.id)?.stage === 'PROFILE_PENDING' && byId.get(failed.id)?.stage === 'BRE_FAILED' && byId.get(noSlip.id)?.stage === 'SALARY_SLIP_PENDING' && byId.get(ready.id)?.stage === 'READY_TO_APPLY', [...byId.values()].map((l) => `${l.email}:${l.stage}`));
    check(`${role}: BRE_FAILED lead lists its failures [PAN, EMPLOYMENT]; others none`, JSON.stringify(byId.get(failed.id)?.breFailures.map((f) => f.rule)) === '["PAN","EMPLOYMENT"]' && byId.get(ready.id)?.breFailures.length === 0);
    const borrowersWithLoans = [applied, sanctioned, disbursed, rejected, closed].map((l) => l.borrower.id);
    check(`${role}: borrowers with an APPLIED/SANCTIONED/DISBURSED/REJECTED/CLOSED loan are excluded; staff excluded`, borrowersWithLoans.every((id) => !byId.has(id)) && !byId.has(staff.SALES.id));
    const keys = Object.keys(res.body.data.items[0] ?? {}).sort().join(',');
    note(`${role}: lead fields = ${keys}`);
  }
  for (const role of ['SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const res = await get(app, '/leads', staff[role].cookie);
    check(`${role} GET /leads → 403`, res.status === 403, res.status);
  }
  const salesSummary = await get(app, '/dashboard/summary', staff.SALES.cookie);
  check('SALES GET /dashboard/summary → 403', salesSummary.status === 403);
  await compareSummary(app, staff.ADMIN.cookie, 'hand-made data');

  // 2) Seeded data (demo + test data).
  await clearTestDatabase();
  await seedDemoData();
  await seedTestData();
  const admin = await createTestUser('ADMIN', 'd6-admin@audit.dev');
  await compareSummary(app, admin.cookie, 'demo + test data');
  const leads = await allLeads(app, admin.cookie);
  const users = await UserModel.find({ email: mongoose.trusted({ $in: TEST_LEADS.map((l) => l.email) }) }).lean();
  const stageById = new Map(leads.items.map((l) => [l.id, l.stage]));
  const mismatched = TEST_LEADS.filter((tl) => stageById.get(users.find((u) => u.email === tl.email)?._id.toString() ?? '') !== tl.expectedStage);
  check('the 10 test leads show their documented stage (docs/TEST_ACCOUNTS.md)', mismatched.length === 0, mismatched.map((m) => m.email));
} finally {
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
