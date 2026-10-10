'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PageSpinner } from '@/components/ui/Spinner';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatDate } from '@/lib/format';
import type { Lead, LeadStage, Paginated } from '@/types/staff';

const STAGE_LABELS: Record<LeadStage, { label: string; className: string }> = {
  PROFILE_PENDING: { label: 'Details pending', className: 'bg-slate-100 text-slate-700' },
  BRE_FAILED: { label: 'Not eligible', className: 'bg-red-100 text-red-800' },
  SALARY_SLIP_PENDING: { label: 'Slip pending', className: 'bg-amber-100 text-amber-800' },
  READY_TO_APPLY: { label: 'Ready to apply', className: 'bg-green-100 text-green-800' },
};

function StageBadge({ stage }: { stage: LeadStage }) {
  const { label, className } = STAGE_LABELS[stage];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

/** Sales: registered borrowers who haven't applied yet, and how far each has got. */
export function SalesLeads() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, reload } = useApiQuery<Paginated<Lead>>(`/leads?page=${page}`);

  return (
    <>
      <PageHeader
        title="Sales"
        description="Registered borrowers who haven't applied for a loan yet, and their progress."
      />
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {!error && (isLoading || !data) && <PageSpinner label="Loading leads" />}
      {data && !isLoading && data.items.length === 0 && <EmptyState title="No leads yet" />}
      {data && !isLoading && data.items.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Borrower
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Registered
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Stage
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{lead.name}</p>
                      <p className="text-xs text-slate-500">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(lead.registeredAt)}</td>
                    <td className="px-4 py-3">
                      <StageBadge stage={lead.stage} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {lead.breFailures.map((failure) => failure.message).join(' ')}
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
      )}
    </>
  );
}
