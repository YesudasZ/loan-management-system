import type { Metadata } from 'next';
import { SalarySlipStep } from '@/components/borrower/ApplicationSteps';

export const metadata: Metadata = { title: 'Salary slip' };

export default function SalarySlipPage() {
  return <SalarySlipStep />;
}
