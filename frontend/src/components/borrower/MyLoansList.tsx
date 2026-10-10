'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { PageSpinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatDate, formatInr } from '@/lib/format';
import { MY_LOANS_PATH } from '@/lib/route-access';
import type { BorrowerLoan } from '@/types/loan';
import type { Paginated } from '@/types/staff';

function ViewLink({ loan }: { loan: BorrowerLoan }) {
  return (
    <Link
      href={`${MY_LOANS_PATH}/${loan.id}`}
      className="text-sm font-medium text-indigo-700 hover:underline"
    >
      View<span className="sr-only"> loan of {formatInr(loan.principal)}</span>
    </Link>
  );
}

/** Every loan the borrower has applied for, newest first (cards on phones, a table above). */
export function MyLoansList() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, reload } = useApiQuery<Paginated<BorrowerLoan>>(
    `/borrower/loans?page=${page}`,
  );

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading your loans" />;
  if (data.items.length === 0) {
    return (
      <EmptyState
        title="No loans yet"
        description="Your loan applications will appear here."
        action={
          <Link href="/apply" className="text-sm font-medium text-indigo-700 hover:underline">
            Start an application
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3 sm:hidden">
        {data.items.map((loan) => (
          <li key={loan.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{formatInr(loan.principal)}</p>
                <p className="text-xs text-slate-500">
                  {loan.tenureDays} days · applied {formatDate(loan.createdAt)}
                </p>
              </div>
              <StatusBadge status={loan.status} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Total</dt>
                <dd>{formatInr(loan.totalRepayment)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Paid</dt>
                <dd>{formatInr(loan.totalPaid)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Outstanding</dt>
                <dd className="font-semibold">{formatInr(loan.outstanding)}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <ViewLink loan={loan} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white sm:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">
                Applied
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Amount
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right md:table-cell">
                Tenure
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Total
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right md:table-cell">
                Paid
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Outstanding
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((loan) => (
              <tr key={loan.id}>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(loan.createdAt)}</td>
                <td className="px-4 py-3 text-right">{formatInr(loan.principal)}</td>
                <td className="hidden px-4 py-3 text-right whitespace-nowrap md:table-cell">
                  {loan.tenureDays} days
                </td>
                <td className="px-4 py-3 text-right">{formatInr(loan.totalRepayment)}</td>
                <td className="hidden px-4 py-3 text-right md:table-cell">
                  {formatInr(loan.totalPaid)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatInr(loan.outstanding)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={loan.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ViewLink loan={loan} />
                </td>
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
