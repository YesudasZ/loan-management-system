import mongoose, { type Types } from 'mongoose';
import { ANNUAL_INTEREST_RATE_PERCENT } from '../../config/constants.js';
import { BorrowerProfileModel } from '../../models/borrower-profile.model.js';
import { LoanModel, type LoanDocument } from '../../models/loan.model.js';
import { AppError } from '../../utils/app-error.js';
import { evaluateEligibility } from '../../utils/bre.js';
import { toBusinessDate } from '../../utils/dates.js';
import { isDuplicateKeyError } from '../../utils/duplicate-key.js';
import { calculateLoanQuote } from '../../utils/loan-math.js';
import { ACTIVE_LOAN_STATUSES } from '../../utils/loan-state-machine.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toBreInput } from '../borrower/borrower.dto.js';
import { toBorrowerLoanDto, type BorrowerLoanDto } from './loans.dto.js';
import type { ApplyBody } from './loans.schema.js';

const ACTIVE_LOAN_MESSAGE = 'You already have an active loan application.';

/** True when the borrower has an APPLIED, SANCTIONED or DISBURSED loan. */
export async function hasActiveLoan(borrowerId: string): Promise<boolean> {
  const loan = await LoanModel.exists({
    borrowerId,
    // A server-built operator, so it is marked trusted for sanitizeFilter.
    status: mongoose.trusted({ $in: ACTIVE_LOAN_STATUSES }),
  });
  return loan !== null;
}

export async function assertNoActiveLoan(borrowerId: string, message: string): Promise<void> {
  if (await hasActiveLoan(borrowerId)) {
    throw new AppError(409, 'ACTIVE_LOAN_EXISTS', message);
  }
}

export function findLatestLoan(borrowerId: string): Promise<LoanDocument | null> {
  return LoanModel.findOne({ borrowerId }).sort({ createdAt: -1, _id: -1 });
}

/** True when any loan application still points at this salary slip file. */
export async function isSalarySlipInUse(fileId: Types.ObjectId): Promise<boolean> {
  return (await LoanModel.exists({ 'salarySlip.fileId': fileId })) !== null;
}

/**
 * Creates a loan application (status APPLIED). Requires an eligible profile with a salary slip
 * and no active loan. The BRE runs again with today's date (age changes over time); a failure
 * is saved to the profile and returned as 422. Interest and totals are always calculated here.
 */
export async function applyForLoan(borrower: AuthUser, input: ApplyBody): Promise<BorrowerLoanDto> {
  const profile = await BorrowerProfileModel.findOne({ userId: borrower.id });
  if (!profile?.salarySlip) {
    throw new AppError(
      409,
      'PROFILE_INCOMPLETE',
      'Complete your personal details and upload a salary slip before applying.',
    );
  }
  await assertNoActiveLoan(borrower.id, ACTIVE_LOAN_MESSAGE);

  const now = new Date();
  const breResult = evaluateEligibility(toBreInput(profile), toBusinessDate(now));
  if (!breResult.isEligible) {
    profile.breResult = { ...breResult, checkedAt: now };
    await profile.save();
    throw new AppError(422, 'BRE_FAILED', 'You are no longer eligible for a loan.', {
      failures: breResult.failures,
    });
  }

  const quote = calculateLoanQuote({
    principal: input.principal,
    tenureDays: input.tenureDays,
    annualInterestRate: ANNUAL_INTEREST_RATE_PERCENT,
  });
  const { fileId, contentType, sizeBytes, uploadedAt } = profile.salarySlip;

  try {
    const loan = await LoanModel.create({
      borrowerId: borrower.id,
      principal: input.principal,
      tenureDays: input.tenureDays,
      annualInterestRate: ANNUAL_INTEREST_RATE_PERCENT,
      simpleInterest: quote.simpleInterest,
      totalRepayment: quote.totalRepayment,
      totalPaid: 0,
      status: 'APPLIED',
      applicant: {
        fullName: profile.fullName,
        pan: profile.pan,
        dateOfBirth: profile.dateOfBirth,
        monthlySalary: profile.monthlySalary,
        employmentMode: profile.employmentMode,
        breResult: { ...breResult, checkedAt: now },
      },
      salarySlip: { fileId, contentType, sizeBytes, uploadedAt },
      statusHistory: [
        { from: null, to: 'APPLIED', by: borrower.id, byRole: borrower.role, at: now },
      ],
    });
    return toBorrowerLoanDto(loan);
  } catch (error) {
    // Two applies racing past the check above: the partial unique index lets only one win.
    if (isDuplicateKeyError(error, 'borrowerId')) {
      throw new AppError(409, 'ACTIVE_LOAN_EXISTS', ACTIVE_LOAN_MESSAGE);
    }
    throw error;
  }
}
