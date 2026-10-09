import type { Metadata } from 'next';
import { LoanStep } from '@/components/borrower/ApplicationSteps';

export const metadata: Metadata = { title: 'Choose your loan' };

export default function LoanPage() {
  return <LoanStep />;
}
