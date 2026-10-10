import { PAISE_PER_RUPEE } from '../../config/constants.js';
import type { LoanOutcome, LoanPlan } from './test-data-types.js';
import type { CurrentLoanGroup, TestBorrower } from './test-accounts.js';

// Every test borrower has five loans: four finished past loans, then the current one, which
// names their group. Values are picked from small tables by the borrower's ordinal, so the
// data is varied but identical on every run. Dates are relative to "now", within 90 days.

const HOUR_MS = 60 * 60 * 1000;

const AMOUNTS_RUPEES = [
  50_000, 75_000, 100_000, 125_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000,
  500_000, 60_000, 85_000, 175_000,
];
const TENURES_DAYS = [30, 45, 60, 90, 120, 150, 180, 240, 270, 365];

type PastStatus = 'CLOSED' | 'REJECTED';
/** The four past loans' outcomes, oldest first, by the borrower's position in their group. */
const PAST_OUTCOMES: readonly (readonly PastStatus[])[] = [
  ['CLOSED', 'REJECTED', 'CLOSED', 'CLOSED'],
  ['CLOSED', 'CLOSED', 'REJECTED', 'CLOSED'],
  ['REJECTED', 'CLOSED', 'CLOSED', 'CLOSED'],
  ['CLOSED', 'REJECTED', 'CLOSED', 'REJECTED'],
  ['CLOSED', 'CLOSED', 'CLOSED', 'REJECTED'],
];

const REJECTION_REASONS = [
  'Salary slip does not match the declared monthly salary.',
  'Existing EMIs exceed the allowed share of monthly income.',
  'Salary slip is older than three months; a recent one is required.',
  'Employer details could not be verified.',
  'Name on the salary slip does not match the PAN.',
  'Requested amount is too high for the declared income.',
];
/** Optional notes on approvals (null = approved without a note). */
const APPROVAL_NOTES: readonly (string | null)[] = [
  'Documents verified.',
  'Income verified against the salary slip.',
  null,
  'Employer confirmed by phone.',
];

/** Shares of the total already paid on a DISBURSED current loan: none, one or several. */
const OPEN_LOAN_PAYMENT_SHARES: readonly (readonly number[])[] = [
  [],
  [0.3],
  [0.25, 0.2],
  [0.15, 0.15, 0.2],
  [0.5],
];

/** Days ago each past loan was applied for (oldest first); each cycle ends within 12 days. */
const PAST_LOAN_DAYS_AGO = [88, 71, 54, 37];
/** Days ago the current loan was applied for, by group (it must start after the past loans). */
const CURRENT_LOAN_DAYS_AGO: Record<CurrentLoanGroup, number> = {
  APPLIED: 5,
  SANCTIONED: 8,
  REJECTED: 7,
  DISBURSED: 22,
  CLOSED: 22,
};
const REGISTERED_DAYS_AGO = 89;

function pick<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error('Cannot pick from an empty list');
  return item;
}

function pickApprovalNote(variant: number): string | undefined {
  return pick(APPROVAL_NOTES, variant) ?? undefined;
}

/**
 * An instant `daysAgo` days before now, nudged by the borrower's position so groups don't share
 * timestamps. Larger positions are more recent, and every instant is at least an hour ago.
 */
function daysAgo(borrower: TestBorrower, days: number, now: Date): Date {
  const hoursAgo = days * 24 - borrower.indexInGroup * 24 + (borrower.ordinal % 6) + 1;
  return new Date(now.getTime() - hoursAgo * HOUR_MS);
}

/** When the borrower signed up: before their first loan. */
export function borrowerRegisteredAt(borrower: TestBorrower, now: Date): Date {
  return daysAgo(borrower, REGISTERED_DAYS_AGO, now);
}

function pastOutcome(status: PastStatus, borrower: TestBorrower, slot: number): LoanOutcome {
  const variant = borrower.ordinal + slot;
  return status === 'REJECTED'
    ? { status, reason: pick(REJECTION_REASONS, variant) }
    : { status, approvalNote: pickApprovalNote(variant), paymentCount: 1 + (variant % 3) };
}

function currentOutcome(borrower: TestBorrower): LoanOutcome {
  const variant = borrower.ordinal + PAST_LOAN_DAYS_AGO.length;
  const approvalNote = pickApprovalNote(variant);
  switch (borrower.group) {
    case 'APPLIED':
      return { status: 'APPLIED' };
    case 'SANCTIONED':
      return { status: 'SANCTIONED', approvalNote };
    case 'REJECTED':
      return { status: 'REJECTED', reason: pick(REJECTION_REASONS, variant) };
    case 'DISBURSED':
      return {
        status: 'DISBURSED',
        approvalNote,
        paymentShares: pick(OPEN_LOAN_PAYMENT_SHARES, borrower.indexInGroup),
      };
    case 'CLOSED':
      return { status: 'CLOSED', approvalNote, paymentCount: 1 + (variant % 3) };
  }
}

function loanTerms(borrower: TestBorrower, slot: number) {
  return {
    principal: pick(AMOUNTS_RUPEES, borrower.ordinal * 3 + slot * 5) * PAISE_PER_RUPEE,
    tenureDays: pick(TENURES_DAYS, borrower.ordinal * 7 + slot * 3),
  };
}

/** The borrower's five loans, oldest first; the last one is their current loan. */
export function planBorrowerLoans(borrower: TestBorrower, now: Date): LoanPlan[] {
  const pastStatuses = pick(PAST_OUTCOMES, borrower.indexInGroup);
  const pastLoans = PAST_LOAN_DAYS_AGO.map((days, slot) => ({
    ...loanTerms(borrower, slot),
    appliedAt: daysAgo(borrower, days, now),
    outcome: pastOutcome(pick(pastStatuses, slot), borrower, slot),
  }));
  const currentSlot = PAST_LOAN_DAYS_AGO.length;
  const currentLoan = {
    ...loanTerms(borrower, currentSlot),
    appliedAt: daysAgo(borrower, CURRENT_LOAN_DAYS_AGO[borrower.group], now),
    outcome: currentOutcome(borrower),
  };
  return [...pastLoans, currentLoan];
}
