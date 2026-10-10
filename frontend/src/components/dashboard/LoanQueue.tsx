'use client';

import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { PageSpinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatDate, formatInr } from '@/lib/format';
import type { LoanStatus } from '@/types/loan';
import type { LoanSummary, Paginated } from '@/types/staff';

interface LoanQueueProps {
  /**
   * Module queues always send their status, so ADMIN sees the same queue as the executive.
   * Omitted only by the admin overview's all-loans table.
   */
  status?: LoanStatus;
  emptyTitle: string;
  showRepayment?: boolean;
  /** Adds a status column (the admin overview mixes statuses). */
  showStatus?: boolean;
  renderAction?: (loan: LoanSummary, reload: () => void) => ReactNode;
}

/**
 * A paginated table of the loans in one status, with loading, empty and error states. PAN and
 * tenure are shown on large screens only, so the action column always fits.
 */
export function LoanQueue({
  status,
  emptyTitle,
  showRepayment = false,
  showStatus = false,
  renderAction,
}: LoanQueueProps) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, reload } = useApiQuery<Paginated<LoanSummary>>(
    status ? `/loans?status=${status}&page=${page}` : `/loans?page=${page}`,
  );

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading loans" />;
  if (data.items.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="flex flex-col gap-4">
      {/* Phones and tablets: one card per loan, so the action is visible without scrolling sideways. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {data.items.map((loan) => (
          <li key={loan.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              {/* min-w-0 + wrap-anywhere: long names and emails wrap instead of widening the page. */}
              <div className="min-w-0">
                <p className="font-medium wrap-anywhere text-slate-900">
                  {loan.applicant.fullName}
                </p>
                <p className="text-xs wrap-anywhere text-slate-500">{loan.borrower.email}</p>
              </div>
              {showStatus && <StatusBadge status={loan.status} />}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Amount</dt>
                <dd>{formatInr(loan.principal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {showRepayment ? 'Outstanding' : 'Tenure'}
                </dt>
                <dd className={showRepayment ? 'font-semibold' : undefined}>
                  {showRepayment ? formatInr(loan.outstanding) : `${loan.tenureDays} days`}
                </dd>
              </div>
            </dl>
            {renderAction && <div className="mt-3">{renderAction(loan, reload)}</div>}
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="min-w-44 px-4 py-3">
                Applicant
              </th>
              {showStatus && (
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
              )}
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
                  <p className="font-medium wrap-anywhere text-slate-900">
                    {loan.applicant.fullName}
                  </p>
                  <p className="text-xs wrap-anywhere text-slate-500">{loan.borrower.email}</p>
                </td>
                {showStatus && (
                  <td className="px-4 py-3">
                    <StatusBadge status={loan.status} />
                  </td>
                )}
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
                <td className="px-4 py-3 text-right">{renderAction?.(loan, reload)}</td>
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
