'use client';

import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { PageSpinner } from '@/components/ui/Spinner';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatDate, formatInr } from '@/lib/format';
import type { LoanStatus } from '@/types/loan';
import type { LoanSummary, Paginated } from '@/types/staff';

interface LoanQueueProps {
  /** Always sent, so ADMIN sees the same queue as the module's executive. */
  status: LoanStatus;
  emptyTitle: string;
  showRepayment?: boolean;
  renderAction: (loan: LoanSummary, reload: () => void) => ReactNode;
}

/**
 * A paginated table of the loans in one status, with loading, empty and error states. PAN and
 * tenure are shown on large screens only, so the action column always fits.
 */
export function LoanQueue({
  status,
  emptyTitle,
  showRepayment = false,
  renderAction,
}: LoanQueueProps) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, reload } = useApiQuery<Paginated<LoanSummary>>(
    `/loans?status=${status}&page=${page}`,
  );

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading loans" />;
  if (data.items.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">
                Applicant
              </th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">
                PAN
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Amount
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right xl:table-cell">
                Tenure
              </th>
              {showRepayment ? (
                <>
                  <th scope="col" className="px-4 py-3 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Outstanding
                  </th>
                </>
              ) : (
                <th scope="col" className="px-4 py-3">
                  Applied
                </th>
              )}
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((loan) => (
              <tr key={loan.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{loan.applicant.fullName}</p>
                  <p className="text-xs text-slate-500">{loan.borrower.email}</p>
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs xl:table-cell">
                  {loan.applicant.panMasked}
                </td>
                <td className="px-4 py-3 text-right">{formatInr(loan.principal)}</td>
                <td className="hidden px-4 py-3 text-right whitespace-nowrap xl:table-cell">
                  {loan.tenureDays} days
                </td>
                {showRepayment ? (
                  <>
                    <td className="px-4 py-3 text-right">{formatInr(loan.totalRepayment)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatInr(loan.outstanding)}
                    </td>
                  </>
                ) : (
                  <td className="px-4 py-3">{formatDate(loan.createdAt)}</td>
                )}
                <td className="px-4 py-3 text-right">{renderAction(loan, reload)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={data.pagination.page}
        totalPages={data.pagination.totalPages}
        totalItems={data.pagination.totalItems}
        onPageChange={setPage}
      />
    </div>
  );
}
