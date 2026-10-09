import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Collection' };

export default function CollectionModulePage() {
  return (
    <>
      <PageHeader
        title="Collection"
        description="Disbursed loans: outstanding balances and payments."
      />
      <EmptyState title="No active loans" />
    </>
  );
}
