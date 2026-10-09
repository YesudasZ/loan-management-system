import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Overview' };

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Loan counts by status across every module." />
      <EmptyState title="No data yet" description="Counts appear here once loans exist." />
    </>
  );
}
