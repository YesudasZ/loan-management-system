import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Sanction' };

export default function SanctionModulePage() {
  return (
    <>
      <PageHeader title="Sanction" description="Applied loans waiting for approval or rejection." />
      <EmptyState title="No applications to review" />
    </>
  );
}
