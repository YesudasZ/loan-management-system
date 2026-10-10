import { UserModel } from '../models/user.model.js';
import type { AuthUser } from '../modules/auth/auth.types.js';
import { approveLoan, disburseLoan, rejectLoan } from '../modules/loans/loan-operations.service.js';
import { recordPayment } from '../modules/payments/payments.service.js';
import { toBusinessDate } from '../utils/dates.js';
import { SEED_UTR_PREFIX, type DemoLoan } from './seed-borrowers.js';

export interface SeedStaff {
  sanction: AuthUser;
  disbursement: AuthUser;
  collection: AuthUser;
}

async function loadStaffMember(email: string): Promise<AuthUser> {
  const user = await UserModel.findOne({ email });
  if (!user) throw new Error(`Seed staff account ${email} is missing`);
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

/** The seeded executives act on the demo loans, so the history shows real names. */
export async function loadSeedStaff(): Promise<SeedStaff> {
  return {
    sanction: await loadStaffMember('sanction@lms.dev'),
    disbursement: await loadStaffMember('disbursement@lms.dev'),
    collection: await loadStaffMember('collection@lms.dev'),
  };
}

let utrCounter = 0;
function nextSeedUtr(): string {
  utrCounter += 1;
  return `${SEED_UTR_PREFIX}${String(utrCounter).padStart(8, '0')}`;
}

async function pay(staff: SeedStaff, loanId: string, amount: number): Promise<number> {
  const { loan } = await recordPayment(staff.collection, loanId, {
    utr: nextSeedUtr(),
    amount,
    paymentDate: toBusinessDate(),
  });
  return loan.outstanding;
}

/** Moves an APPLIED demo loan to its target status through the real services. */
export async function advanceDemoLoan(
  loanId: string,
  demo: DemoLoan,
  staff: SeedStaff,
): Promise<void> {
  if (demo.outcome === 'APPLIED') return;
  if (demo.outcome === 'REJECTED') {
    await rejectLoan(staff.sanction, loanId, 'Salary slip does not match the declared salary.');
    return;
  }

  await approveLoan(staff.sanction, loanId, 'Documents verified.');
  if (demo.outcome === 'SANCTIONED') return;

  const disbursed = await disburseLoan(staff.disbursement, loanId);
  if (demo.outcome === 'DISBURSED') {
    if (demo.partialPaymentShare) {
      await pay(staff, loanId, Math.round(disbursed.totalRepayment * demo.partialPaymentShare));
    }
    return;
  }

  // CLOSED: two payments; the second clears the balance and auto-closes the loan.
  const outstanding = await pay(staff, loanId, Math.round(disbursed.totalRepayment / 2));
  await pay(staff, loanId, outstanding);
}
