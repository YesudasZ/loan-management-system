import type { Metadata } from 'next';
import { ResumeApplication } from '@/components/borrower/ApplicationSteps';

export const metadata: Metadata = { title: 'Apply' };

export default function ApplyPage() {
  return <ResumeApplication />;
}
