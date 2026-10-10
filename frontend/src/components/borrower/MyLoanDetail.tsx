'use client';

import Link from 'next/link';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
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
      <Link
        href={MY_LOANS_PATH}
        className="mb-4 inline-block text-sm font-medium text-indigo-700 hover:underline"
      >
        ← All my loans
      </Link>
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
