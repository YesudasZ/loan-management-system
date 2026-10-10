import { Types } from 'mongoose';
import {
  ANNUAL_INTEREST_RATE_PERCENT,
  PAISE_PER_RUPEE,
  type Role,
} from '../../config/constants.js';
import type { Payment } from '../../models/payment.model.js';
import { applyBodySchema } from '../../modules/loans/loans.schema.js';
import { AUTO_CLOSE_NOTE } from '../../modules/payments/payments.service.js';
import { evaluateEligibility } from '../../utils/bre.js';
import { calendarDateToUtcMidnight, toBusinessDate } from '../../utils/dates.js';
import { calculateLoanQuote } from '../../utils/loan-math.js';
import {
  getNextStatus,
  isActiveLoanStatus,
  LOAN_ACTIONS,
  type LoanAction,
} from '../../utils/loan-state-machine.js';
import { PAYMENT_RECORDER_ROLES, validatePayment } from '../../utils/payment-rules.js';
import type {
  Actor,
  BuiltLoan,
  LoanHistoryContext,
  LoanPlan,
  SeedLoan,
} from './test-data-types.js';

// Builds test loans as documents, with backdated events, by running every step through the
// same rules the API uses: the apply schema, the BRE, the interest formula, the state machine,
// the action roles and the payment rules. Anything inconsistent throws instead of being saved.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REVIEW_DELAY_MS = DAY_MS + 2 * HOUR_MS;
const DISBURSE_DELAY_MS = DAY_MS - 3 * HOUR_MS;
/** When the 1st, 2nd and 3rd payments arrive after disbursal. */
const PAYMENT_DELAYS_MS = [2, 5, 9].map((days) => days * DAY_MS + 3 * HOUR_MS);

const later = (instant: Date, ms: number) => new Date(instant.getTime() + ms);
const toWholeRupees = (paise: number) => Math.round(paise / PAISE_PER_RUPEE) * PAISE_PER_RUPEE;

function assertMayAct(actor: Actor, allowedRoles: readonly Role[], task: string): void {
  if (!allowedRoles.includes(actor.role)) {
    throw new Error(`${actor.role} may not ${task}`);
  }
}

/** Splits the total into about-equal whole-rupee payments; the last one clears the balance. */
function splitIntoEqualPayments(total: number, count: number): number[] {
  const share = toWholeRupees(total / count);
  const amounts = Array.from({ length: count - 1 }, () => share);
  return [...amounts, total - share * (count - 1)];
}

/** Payments of the given shares of the total, in whole rupees (never the full amount). */
function splitIntoPartialPayments(total: number, shares: readonly number[]): number[] {
  return shares.map((share) => toWholeRupees(total * share));
}

function startLoan(context: LoanHistoryContext, plan: LoanPlan): SeedLoan {
  const { principal, tenureDays } = applyBodySchema.parse({
    principal: plan.principal,
    tenureDays: plan.tenureDays,
  });
  const breResult = evaluateEligibility(context.profile, toBusinessDate(plan.appliedAt));
  if (!breResult.isEligible) {
    throw new Error(
      `${context.profile.fullName} is not eligible on ${plan.appliedAt.toISOString()}`,
    );
  }
  const quote = calculateLoanQuote({
    principal,
    tenureDays,
    annualInterestRate: ANNUAL_INTEREST_RATE_PERCENT,
  });
  const { profile } = context;

  return {
    _id: new Types.ObjectId(),
    borrowerId: context.borrowerId,
    principal,
    tenureDays,
    annualInterestRate: ANNUAL_INTEREST_RATE_PERCENT,
    simpleInterest: quote.simpleInterest,
    totalRepayment: quote.totalRepayment,
    totalPaid: 0,
    status: 'APPLIED',
    applicant: {
      fullName: profile.fullName,
      pan: profile.pan,
      dateOfBirth: calendarDateToUtcMidnight(profile.dateOfBirth),
      monthlySalary: profile.monthlySalary,
      employmentMode: profile.employmentMode,
      breResult: { ...breResult, checkedAt: plan.appliedAt },
    },
    salarySlip: context.salarySlip,
    statusHistory: [
      { from: null, to: 'APPLIED', by: context.borrowerId, byRole: 'BORROWER', at: plan.appliedAt },
    ],
    createdAt: plan.appliedAt,
    updatedAt: plan.appliedAt,
  };
}

/** Builds one loan from its application to its planned status, with all its payments. */
export function buildLoan(context: LoanHistoryContext, plan: LoanPlan): BuiltLoan {
  const loan = startLoan(context, plan);
  const payments: Payment[] = [];

  function move(action: LoanAction, actor: Actor, at: Date, note?: string): void {
    if (at >= context.now) throw new Error('Test data cannot happen in the future');
    const to = getNextStatus(loan.status, action);
    loan.statusHistory.push({ from: loan.status, to, by: actor.id, byRole: actor.role, at, note });
    loan.status = to;
    loan.updatedAt = at;
  }

  function pay(amount: number, at: Date, disbursedAt: Date): void {
    const collector = context.pickActor('COLLECT');
    assertMayAct(collector, PAYMENT_RECORDER_ROLES, 'record a payment');
    const paymentDate = toBusinessDate(at);
    const failures = validatePayment({
      amount,
      paymentDate,
      outstanding: loan.totalRepayment - loan.totalPaid,
      disbursedOn: toBusinessDate(disbursedAt),
      today: toBusinessDate(context.now),
    });
    if (amount <= 0 || failures.length > 0 || at >= context.now) {
      throw new Error(`Invalid test payment of ${amount} paise: ${JSON.stringify(failures)}`);
    }
    payments.push({
      loanId: loan._id,
      utr: context.nextUtr(),
      amount,
      paymentDate: calendarDateToUtcMidnight(paymentDate),
      recordedBy: collector.id,
      createdAt: at,
      updatedAt: at,
    });
    loan.totalPaid += amount;
    loan.updatedAt = at;
    if (loan.totalPaid === loan.totalRepayment) {
      move('AUTO_CLOSE', collector, at, AUTO_CLOSE_NOTE);
      loan.closedAt = at;
    }
  }

  const { outcome } = plan;
  if (outcome.status === 'APPLIED') return { loan, payments };

  const reviewer = context.pickActor('REVIEW');
  const reviewedAt = later(plan.appliedAt, REVIEW_DELAY_MS);
  if (outcome.status === 'REJECTED') {
    assertMayAct(reviewer, LOAN_ACTIONS.REJECT.allowedRoles, 'reject a loan');
    move('REJECT', reviewer, reviewedAt, outcome.reason);
    loan.rejectionReason = outcome.reason;
    return { loan, payments };
  }
  assertMayAct(reviewer, LOAN_ACTIONS.APPROVE.allowedRoles, 'approve a loan');
  move('APPROVE', reviewer, reviewedAt, outcome.approvalNote);
  if (outcome.status === 'SANCTIONED') return { loan, payments };

  const disburser = context.pickActor('DISBURSE');
  assertMayAct(disburser, LOAN_ACTIONS.DISBURSE.allowedRoles, 'disburse a loan');
  const disbursedAt = later(reviewedAt, DISBURSE_DELAY_MS);
  move('DISBURSE', disburser, disbursedAt);
  loan.disbursedAt = disbursedAt;
  loan.disbursedBy = disburser.id;

  const amounts =
    outcome.status === 'CLOSED'
      ? splitIntoEqualPayments(loan.totalRepayment, outcome.paymentCount)
      : splitIntoPartialPayments(loan.totalRepayment, outcome.paymentShares);
  amounts.forEach((amount, index) => {
    const delay = PAYMENT_DELAYS_MS[index];
    if (delay === undefined) throw new Error('At most three payments per test loan');
    pay(amount, later(disbursedAt, delay), disbursedAt);
  });

  if (loan.status !== outcome.status) {
    throw new Error(`Planned ${outcome.status} but the loan ended ${loan.status}`);
  }
  return { loan, payments };
}

/**
 * Builds a borrower's loans, oldest first. Each loan must be finished (CLOSED or REJECTED)
 * before the next one is applied for, exactly as the one-active-loan rule requires.
 */
export function buildLoanHistory(context: LoanHistoryContext, plans: LoanPlan[]): BuiltLoan[] {
  const built: BuiltLoan[] = [];
  for (const plan of plans) {
    const previous = built.at(-1)?.loan;
    if (previous && (isActiveLoanStatus(previous.status) || previous.updatedAt >= plan.appliedAt)) {
      throw new Error(`${context.profile.fullName}: a loan starts before the previous one ended`);
    }
    built.push(buildLoan(context, plan));
  }
  return built;
}
