// Lens D3: every action × every status through the API, with the action's own role and ADMIN.
import type { Express } from 'express';
import { LoanModel } from '../src/models/loan.model.js';
import { toBusinessDate } from '../src/utils/dates.js';
import { createAppliedLoan, createDisbursedLoan, createSanctionedLoan, createStaff, type StaffUsers, type TestLoan } from '../tests/helpers/loans.js';
import { check, get, note, post, start, stop, summary } from './harness.js';

type Status = 'APPLIED' | 'SANCTIONED' | 'REJECTED' | 'DISBURSED' | 'CLOSED';
type Action = 'APPROVE' | 'REJECT' | 'DISBURSE' | 'PAYMENT' | 'PAY_IN_FULL';

let utrN = 0;
const nextUtr = () => `D3UTR${String((utrN += 1)).padStart(6, '0')}`;

async function loanIn(app: Express, staff: StaffUsers, status: Status): Promise<TestLoan> {
  switch (status) {
    case 'APPLIED':
      return createAppliedLoan(app);
    case 'SANCTIONED':
      return createSanctionedLoan(app, staff);
    case 'REJECTED': {
      const loan = await createAppliedLoan(app);
      const r = await post(app, `/loans/${loan.loanId}/reject`, staff.SANCTION.cookie, { reason: 'Audit rejection' });
      if (r.status !== 200) throw new Error(`reject setup ${r.status}`);
      return loan;
    }
    case 'DISBURSED':
      return createDisbursedLoan(app, staff);
    case 'CLOSED': {
      const loan = await createDisbursedLoan(app, staff);
      const r = await post(app, `/loans/${loan.loanId}/payments`, staff.COLLECTION.cookie, { utr: nextUtr(), amount: loan.totalRepayment, paymentDate: toBusinessDate() });
      if (r.status !== 201 || r.body.data.loan.status !== 'CLOSED') throw new Error(`close setup ${r.status}`);
      return loan;
    }
  }
}

function perform(app: Express, cookie: string, action: Action, loan: TestLoan) {
  switch (action) {
    case 'APPROVE':
      return post(app, `/loans/${loan.loanId}/approve`, cookie, { note: 'ok' });
    case 'REJECT':
      return post(app, `/loans/${loan.loanId}/reject`, cookie, { reason: 'Audit reason' });
    case 'DISBURSE':
      return post(app, `/loans/${loan.loanId}/disburse`, cookie);
    case 'PAYMENT':
      return post(app, `/loans/${loan.loanId}/payments`, cookie, { utr: nextUtr(), amount: 100_000, paymentDate: toBusinessDate() });
    case 'PAY_IN_FULL':
      return post(app, `/loans/${loan.loanId}/payments`, cookie, { utr: nextUtr(), amount: loan.totalRepayment, paymentDate: toBusinessDate() });
  }
}

const ACTION_ROLE: Record<Action, keyof StaffUsers> = {
  APPROVE: 'SANCTION',
  REJECT: 'SANCTION',
  DISBURSE: 'DISBURSEMENT',
  PAYMENT: 'COLLECTION',
  PAY_IN_FULL: 'COLLECTION',
};
const EXPECTED: Record<Action, Partial<Record<Status, { code: number; to: Status }>>> = {
  APPROVE: { APPLIED: { code: 200, to: 'SANCTIONED' } },
  REJECT: { APPLIED: { code: 200, to: 'REJECTED' } },
  DISBURSE: { SANCTIONED: { code: 200, to: 'DISBURSED' } },
  PAYMENT: { DISBURSED: { code: 201, to: 'DISBURSED' } },
  PAY_IN_FULL: { DISBURSED: { code: 201, to: 'CLOSED' } },
};
const STATUSES: Status[] = ['APPLIED', 'SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED'];
const ACTIONS: Action[] = ['APPROVE', 'REJECT', 'DISBURSE', 'PAYMENT', 'PAY_IN_FULL'];

const app = await start();
try {
  const staff = await createStaff();
  const matrix: string[] = [];
  for (const actorKind of ['OWN_ROLE', 'ADMIN'] as const) {
    for (const action of ACTIONS) {
      const row: string[] = [];
      for (const status of STATUSES) {
        const loan = await loanIn(app, staff, status);
        const role = actorKind === 'ADMIN' ? 'ADMIN' : ACTION_ROLE[action];
        const before = await LoanModel.findById(loan.loanId).lean();
        const res = await perform(app, staff[role].cookie, action, loan);
        const after = await LoanModel.findById(loan.loanId).lean();
        const expected = EXPECTED[action][status];
        if (expected) {
          const last = after?.statusHistory.at(-1);
          const historyOk = expected.to === status
            ? (after?.statusHistory.length ?? 0) === (before?.statusHistory.length ?? 0)
            : last?.from === status && last?.to === expected.to && last?.byRole === role && last?.by.toString() === staff[role].id;
          check(`${role} ${action} on ${status} → ${expected.code}, status ${expected.to}, history entry byRole=${role}`, res.status === expected.code && after?.status === expected.to && historyOk, { status: res.status, body: res.body, history: after?.statusHistory });
        } else {
          const unchanged = after?.status === status && after?.statusHistory.length === before?.statusHistory.length && after?.totalPaid === before?.totalPaid;
          check(`${role} ${action} on ${status} → 409, loan unchanged`, res.status === 409 && unchanged, { status: res.status, body: res.body });
        }
        row.push(`${status}:${res.status}${res.body?.error ? ` ${res.body.error.code}` : ''}`);
        if (res.status === 409 && action === 'APPROVE' && status === 'DISBURSED') note(`409 message seen by ${role}: "${res.body.error.message}"`);
      }
      matrix.push(`${actorKind.padEnd(8)} ${action.padEnd(12)} ${row.join(' | ')}`);
    }
  }
  process.stdout.write(`\nMatrix (actor, action, status:http code):\n${matrix.join('\n')}\n\n`);

  // Reject stores the reason; approve with no body works; the full history of a CLOSED loan.
  const rej = await createAppliedLoan(app);
  const r = await post(app, `/loans/${rej.loanId}/reject`, staff.SANCTION.cookie, { reason: '   Income too low   ' });
  check('reject stores trimmed rejectionReason and history note', r.body.data.loan.rejectionReason === 'Income too low' && (await LoanModel.findById(rej.loanId).lean())?.statusHistory.at(-1)?.note === 'Income too low', r.body.data.loan);
  const rejNoReason = await createAppliedLoan(app);
  const rr = await post(app, `/loans/${rejNoReason.loanId}/reject`, staff.SANCTION.cookie, {});
  check('reject without a reason → 400', rr.status === 400, rr.body);
  const closed = await loanIn(app, staff, 'CLOSED');
  const doc = await LoanModel.findById(closed.loanId).lean();
  const chain = doc?.statusHistory.map((h) => `${h.from}->${h.to}@${h.byRole}`).join(', ');
  check('CLOSED loan history = null→APPLIED@BORROWER, APPLIED→SANCTIONED@SANCTION, SANCTIONED→DISBURSED@DISBURSEMENT, DISBURSED→CLOSED@COLLECTION', chain === 'null->APPLIED@BORROWER, APPLIED->SANCTIONED@SANCTION, SANCTIONED->DISBURSED@DISBURSEMENT, DISBURSED->CLOSED@COLLECTION', chain);
  check('CLOSED loan has closedAt and disbursedAt/disbursedBy', Boolean(doc?.closedAt && doc?.disbursedAt && doc?.disbursedBy), doc);

  // No direct AUTO_CLOSE / status endpoint.
  for (const path of ['close', 'auto-close', 'status']) {
    const res = await post(app, `/loans/${closed.loanId}/${path}`, staff.ADMIN.cookie);
    check(`POST /loans/:id/${path} does not exist → 404`, res.status === 404, res.status);
  }

  // Wrong role (another module) on an action → 403, and module scoping on reads.
  const applied = await createAppliedLoan(app);
  for (const role of ['DISBURSEMENT', 'COLLECTION', 'SALES'] as const) {
    const res = await post(app, `/loans/${applied.loanId}/approve`, staff[role].cookie);
    check(`${role} APPROVE → 403`, res.status === 403, res.status);
  }
  const disbursed = await loanIn(app, staff, 'DISBURSED');
  const readBySanction = await get(app, `/loans/${disbursed.loanId}`, staff.SANCTION.cookie);
  const approveBySanction = await post(app, `/loans/${disbursed.loanId}/approve`, staff.SANCTION.cookie);
  note(`SANCTION on a DISBURSED loan: GET → ${readBySanction.status} (scoped, hidden), POST approve → ${approveBySanction.status} "${approveBySanction.body?.error?.message}"`);
  const payOnApplied = await post(app, `/loans/${applied.loanId}/payments`, staff.COLLECTION.cookie, { utr: nextUtr(), amount: 100, paymentDate: toBusinessDate() });
  const readByCollection = await get(app, `/loans/${applied.loanId}`, staff.COLLECTION.cookie);
  note(`COLLECTION on an APPLIED loan: GET → ${readByCollection.status}, POST payment → ${payOnApplied.status} ${payOnApplied.body?.error?.code}`);
  const missing = await post(app, '/loans/0123456789abcdef01234567/approve', staff.SANCTION.cookie);
  note(`APPROVE on a non-existent id → ${missing.status}`);

  // Concurrent approve + reject on the same APPLIED loan: exactly one wins.
  const race = await createAppliedLoan(app);
  const [a, b] = await Promise.all([
    post(app, `/loans/${race.loanId}/approve`, staff.SANCTION.cookie),
    post(app, `/loans/${race.loanId}/reject`, staff.ADMIN.cookie, { reason: 'Race reason' }),
  ]);
  const raced = await LoanModel.findById(race.loanId).lean();
  check('concurrent approve + reject: one 200, one 409, one history entry added', [a.status, b.status].sort().join(',') === '200,409' && raced?.statusHistory.length === 2, { a: a.status, b: b.status, history: raced?.statusHistory.length });
  // Concurrent double disburse.
  const dRace = await createSanctionedLoan(app, staff);
  const [d1, d2] = await Promise.all([
    post(app, `/loans/${dRace.loanId}/disburse`, staff.DISBURSEMENT.cookie),
    post(app, `/loans/${dRace.loanId}/disburse`, staff.ADMIN.cookie),
  ]);
  const dRaced = await LoanModel.findById(dRace.loanId).lean();
  check('concurrent double disburse: one 200, one 409, one DISBURSED entry', [d1.status, d2.status].sort().join(',') === '200,409' && dRaced?.statusHistory.filter((h) => h.to === 'DISBURSED').length === 1, [d1.status, d2.status]);
} finally {
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
