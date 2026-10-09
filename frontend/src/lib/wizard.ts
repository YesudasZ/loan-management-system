import { ACTIVE_LOAN_STATUSES, type BorrowerProgress, type WizardStep } from '@/types/loan';

export const WIZARD_STEPS: readonly { step: WizardStep; label: string; path: string }[] = [
  { step: 'PROFILE', label: 'Personal details', path: '/apply/profile' },
  { step: 'SALARY_SLIP', label: 'Salary slip', path: '/apply/salary-slip' },
  { step: 'LOAN', label: 'Loan amount', path: '/apply/loan' },
  { step: 'STATUS', label: 'Status', path: '/apply/status' },
];

export function getStepPath(step: WizardStep): string {
  return WIZARD_STEPS.find((entry) => entry.step === step)?.path ?? '/apply';
}

export function hasActiveLoan(progress: BorrowerProgress): boolean {
  return progress.latestLoan !== null && ACTIVE_LOAN_STATUSES.includes(progress.latestLoan.status);
}

/**
 * Where a wizard page should send the borrower instead of rendering (null = render it).
 * Stops jumping ahead (e.g. the loan page without a slip) and editing while a loan is active.
 * UX only: the API enforces the same rules.
 */
export function getWizardRedirect(page: WizardStep, progress: BorrowerProgress): string | null {
  const isLocked = hasActiveLoan(progress);
  switch (page) {
    case 'PROFILE':
      return isLocked ? getStepPath('STATUS') : null;
    case 'SALARY_SLIP':
      if (isLocked) return getStepPath('STATUS');
      return progress.isEligible ? null : getStepPath('PROFILE');
    case 'LOAN':
      if (isLocked) return getStepPath('STATUS');
      if (!progress.isEligible) return getStepPath('PROFILE');
      return progress.profile?.salarySlip ? null : getStepPath('SALARY_SLIP');
    case 'STATUS':
      return progress.latestLoan ? null : getStepPath(progress.currentStep);
  }
}
