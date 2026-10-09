import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Disbursement' };

export default function DisbursementModulePage() {
  return (
    <>
      <PageHeader
        title="Disbursement"
        description="Sanctioned loans waiting for funds to be released."
      />
      <EmptyState title="No loans to disburse" />
    </>
  );
}
