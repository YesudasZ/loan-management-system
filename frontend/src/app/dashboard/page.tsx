import type { Metadata } from 'next';
import { AdminOverview } from '@/components/dashboard/AdminOverview';

export const metadata: Metadata = { title: 'Overview' };

export default function AdminOverviewPage() {
  return <AdminOverview />;
}
