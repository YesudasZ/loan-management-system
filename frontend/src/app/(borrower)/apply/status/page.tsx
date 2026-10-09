import type { Metadata } from 'next';
import { StatusStep } from '@/components/borrower/ApplicationSteps';

export const metadata: Metadata = { title: 'Loan status' };

export default function StatusPage() {
  return <StatusStep />;
}
