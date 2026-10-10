import type { Metadata } from 'next';
import { SalesLeads } from '@/components/dashboard/SalesModule';

export const metadata: Metadata = { title: 'Sales' };

export default function SalesModulePage() {
  return <SalesLeads />;
}
