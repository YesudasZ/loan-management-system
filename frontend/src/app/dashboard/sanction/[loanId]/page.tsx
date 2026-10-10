import type { Metadata } from 'next';
import { SanctionReview } from '@/components/dashboard/SanctionModule';

export const metadata: Metadata = { title: 'Review application' };

export default async function SanctionReviewPage({
  params,
}: PageProps<'/dashboard/sanction/[loanId]'>) {
  const { loanId } = await params;
  return <SanctionReview loanId={loanId} />;
}
