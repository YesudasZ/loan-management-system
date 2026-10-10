import type { Metadata } from 'next';
import { MyLoanDetail } from '@/components/borrower/MyLoanDetail';

export const metadata: Metadata = { title: 'Loan details' };

export default async function MyLoanPage({ params }: PageProps<'/apply/loans/[loanId]'>) {
  const { loanId } = await params;
  return <MyLoanDetail loanId={loanId} />;
}
