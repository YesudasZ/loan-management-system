'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/SelectField';
import { PageSpinner } from '@/components/ui/Spinner';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { LoanStatus } from '@/types/loan';
import type { DashboardSummary } from '@/types/staff';
import { LoanQueue } from './LoanQueue';

const STATUS_CARDS: { status: LoanStatus; label: string; href?: string }[] = [
  { status: 'APPLIED', label: 'Applied', href: '/dashboard/sanction' },
  { status: 'SANCTIONED', label: 'Sanctioned', href: '/dashboard/disbursement' },
  { status: 'DISBURSED', label: 'Disbursed', href: '/dashboard/collection' },
  { status: 'CLOSED', label: 'Closed' },
  { status: 'REJECTED', label: 'Rejected' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...STATUS_CARDS.map(({ status, label }) => ({ value: status, label })),
];

function CountCard({ label, count, href }: { label: string; count: number; href?: string }) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{count}</p>
    </>
  );
  const className = 'block rounded-lg border border-slate-200 bg-white p-4';
  return href ? (
    <Link href={href} className={`${className} hover:border-primary hover:bg-primary-soft`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function SummaryCards() {
  const { data, error, isLoading, reload } = useApiQuery<DashboardSummary>('/dashboard/summary');
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading counts" />;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <CountCard label="Leads" count={data.leadCount} href="/dashboard/sales" />
      {STATUS_CARDS.map((card) => (
        <CountCard
          key={card.status}
          label={card.label}
          count={data.loansByStatus[card.status]}
          href={card.href}
        />
      ))}
    </div>
  );
}

/** Admin: counts per status across every module, plus every loan with a status filter. */
export function AdminOverview() {
  const [status, setStatus] = useState<LoanStatus | ''>('');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="Loans by status across every module." />
      <SummaryCards />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">All loans</h2>
          <div className="w-48">
            <SelectField
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              value={status}
              onChange={(event) => setStatus(event.target.value as LoanStatus | '')}
            />
          </div>
        </div>
        <LoanQueue
          key={status || 'ALL'}
          status={status || undefined}
          emptyTitle="No loans with this status"
          showStatus
        />
      </section>
    </div>
  );
}
