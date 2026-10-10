import type { Metadata } from 'next';
import { MyLoansList } from '@/components/borrower/MyLoansList';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'My loans' };

export default function MyLoansPage() {
  return (
    <>
      <PageHeader title="My loans" description="Every loan you have applied for, newest first." />
      <MyLoansList />
    </>
  );
}
