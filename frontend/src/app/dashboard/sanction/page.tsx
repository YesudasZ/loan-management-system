import type { Metadata } from 'next';
import { SanctionQueue } from '@/components/dashboard/SanctionModule';

export const metadata: Metadata = { title: 'Sanction' };

export default function SanctionModulePage() {
  return <SanctionQueue />;
}
