import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Apply' };

export default function ApplyPage() {
  return (
    <>
      <PageHeader
        title="Your loan application"
        description="Personal details, salary slip, loan amount — then apply."
      />
      <EmptyState
        title="The application steps open here"
        description="You'll fill in your personal details, upload a salary slip and choose your loan."
      />
    </>
  );
}
