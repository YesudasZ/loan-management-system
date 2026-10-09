import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Sales' };

export default function SalesModulePage() {
  return (
    <>
      <PageHeader
        title="Sales"
        description="Registered borrowers who haven't applied yet, and their progress."
      />
      <EmptyState title="No leads yet" />
    </>
  );
}
