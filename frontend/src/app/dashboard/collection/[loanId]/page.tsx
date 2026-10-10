import type { Metadata } from 'next';
import { CollectionLoanView } from '@/components/dashboard/CollectionModule';

export const metadata: Metadata = { title: 'Loan payments' };

export default async function CollectionLoanPage({
  params,
}: PageProps<'/dashboard/collection/[loanId]'>) {
  const { loanId } = await params;
  return <CollectionLoanView loanId={loanId} />;
}
