import { BorrowerProfileModel } from '../../models/borrower-profile.model.js';
import { AppError } from '../../utils/app-error.js';
import { evaluateEligibility } from '../../utils/bre.js';
import { calendarDateToUtcMidnight, toBusinessDate } from '../../utils/dates.js';
import { toBorrowerLoanDto, type BorrowerLoanDto } from '../loans/loans.dto.js';
import { assertNoActiveLoan, findLatestLoan } from '../loans/loans.service.js';
import { toBorrowerProfileDto, toBreInput, type BorrowerProfileDto } from './borrower.dto.js';
import type { ProfileBody } from './borrower.schema.js';

export type WizardStep = 'PROFILE' | 'SALARY_SLIP' | 'LOAN' | 'STATUS';

export interface ProgressDto {
  currentStep: WizardStep;
  /** Eligibility re-evaluated with today's date (age changes over time). */
  isEligible: boolean;
  profile: BorrowerProfileDto | null;
  latestLoan: BorrowerLoanDto | null;
}

/** Where the borrower resumes: once they have applied, the status page is their home. */
function resolveWizardStep(state: {
  hasLoan: boolean;
  isEligible: boolean;
  hasSalarySlip: boolean;
}): WizardStep {
  if (state.hasLoan) return 'STATUS';
  if (!state.isEligible) return 'PROFILE';
  if (!state.hasSalarySlip) return 'SALARY_SLIP';
  return 'LOAN';
}

export async function getProgress(userId: string): Promise<ProgressDto> {
  const [profile, latestLoan] = await Promise.all([
    BorrowerProfileModel.findOne({ userId }),
    findLatestLoan(userId),
  ]);
  const isEligible = profile
    ? evaluateEligibility(toBreInput(profile), toBusinessDate()).isEligible
    : false;

  return {
    currentStep: resolveWizardStep({
      hasLoan: latestLoan !== null,
      isEligible,
      hasSalarySlip: Boolean(profile?.salarySlip),
    }),
    isEligible,
    profile: profile ? toBorrowerProfileDto(profile) : null,
    latestLoan: latestLoan ? toBorrowerLoanDto(latestLoan) : null,
  };
}

/**
 * Creates or updates the borrower's profile and runs the BRE. The profile is saved even when
 * the BRE fails (Sales tracks "BRE failed" leads), and then 422 BRE_FAILED lists every failure.
 * Locked while the borrower has an active loan.
 */
export async function saveProfile(userId: string, input: ProfileBody): Promise<BorrowerProfileDto> {
  await assertNoActiveLoan(userId, 'Your details are locked while you have an active loan.');

  const now = new Date();
  const breResult = evaluateEligibility(input, toBusinessDate(now));
  const profile = await BorrowerProfileModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        fullName: input.fullName,
        pan: input.pan,
        dateOfBirth: calendarDateToUtcMidnight(input.dateOfBirth),
        monthlySalary: input.monthlySalary,
        employmentMode: input.employmentMode,
        breResult: { ...breResult, checkedAt: now },
      },
      $setOnInsert: { salarySlip: null },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  if (!profile) {
    throw new Error('Profile upsert returned no document');
  }

  if (!breResult.isEligible) {
    throw new AppError(422, 'BRE_FAILED', 'You are not eligible for a loan with these details.', {
      failures: breResult.failures,
    });
  }
  return toBorrowerProfileDto(profile);
}
