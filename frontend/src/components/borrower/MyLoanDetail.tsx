'use client';

import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatDate, formatInr } from '@/lib/format';
import { MY_LOANS_PATH } from '@/lib/route-access';
import type { BorrowerLoan } from '@/types/loan';
import { LoanStatusView } from './LoanStatusView';

/** One of the borrower's loans with its amounts and timeline (read-only history). */
export function MyLoanDetail({ loanId }: { loanId: string }) {
  const { data, error, isLoading, reload } = useApiQuery<{ loan: BorrowerLoan }>(
    `/borrower/loans/${loanId}`,
  );

  return (
    <>
      <ButtonLink href={MY_LOANS_PATH} variant="link" className="mb-4">
        ← All my loans
      </ButtonLink>
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {!error && (isLoading || !data) && <PageSpinner label="Loading the loan" />}
      {!error && data && (
        <>
          <PageHeader
            title={`Loan of ${formatInr(data.loan.principal)}`}
            description={`Applied on ${formatDate(data.loan.createdAt)}`}
          />
          <LoanStatusView loan={data.loan} showNextSteps={false} />
        </>
      )}
    </>
  );
}
