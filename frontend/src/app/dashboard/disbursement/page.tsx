import type { Metadata } from 'next';
import { DisbursementQueue } from '@/components/dashboard/DisbursementModule';

export const metadata: Metadata = { title: 'Disbursement' };

export default function DisbursementModulePage() {
  return <DisbursementQueue />;
}
