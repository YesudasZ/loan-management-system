'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
import { useApiQuery } from '@/hooks/useApiQuery';
import { getStepPath } from '@/lib/wizard';
import type { BorrowerProgress } from '@/types/loan';
import { LoanCalculator } from './LoanCalculator';
import { LoanStatusView } from './LoanStatusView';
import { ProfileForm } from './ProfileForm';
import { SalarySlipForm } from './SalarySlipForm';
import { WizardStepPage } from './WizardStepPage';

/** `/apply`: resumes the borrower at their current step. */
export function ResumeApplication() {
  const router = useRouter();
  const { data: progress, error, reload } = useApiQuery<BorrowerProgress>('/borrower/progress');

  useEffect(() => {
    if (progress) router.replace(getStepPath(progress.currentStep));
  }, [progress, router]);

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  return <PageSpinner label="Opening your application" />;
}

export function ProfileStep() {
  return (
    <WizardStepPage step="PROFILE">
      {(progress) => (
        <>
          <PageHeader
            title="Personal details"
            description="We check your eligibility instantly: age 23–50, salary ₹25,000+ a month, a valid PAN, and salaried or self-employed."
          />
          <ProfileForm profile={progress.profile} />
        </>
      )}
    </WizardStepPage>
  );
}

export function SalarySlipStep() {
  return (
    <WizardStepPage step="SALARY_SLIP">
      {(progress, reload) => (
        <>
          <PageHeader
            title="Upload your salary slip"
            description="Your latest salary slip as a PDF, JPG or PNG (up to 5 MB)."
          />
          <SalarySlipForm currentSlip={progress.profile?.salarySlip ?? null} onUploaded={reload} />
        </>
      )}
    </WizardStepPage>
  );
}

export function LoanStep() {
  return (
    <WizardStepPage step="LOAN">
      {() => (
        <>
          <PageHeader
            title="Choose your loan"
            description="₹50,000 to ₹5,00,000 for 30 to 365 days, at 12% a year simple interest."
          />
          <LoanCalculator />
        </>
      )}
    </WizardStepPage>
  );
}

export function StatusStep() {
  return (
    <WizardStepPage step="STATUS">
      {(progress) =>
        progress.latestLoan && (
          <>
            <PageHeader title="Your loan" />
            <LoanStatusView loan={progress.latestLoan} />
          </>
        )
      }
    </WizardStepPage>
  );
}
