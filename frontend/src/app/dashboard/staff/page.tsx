import type { Metadata } from 'next';
import { StaffManagement } from '@/components/dashboard/StaffModule';

export const metadata: Metadata = { title: 'Staff' };

export default function StaffModulePage() {
  return <StaffManagement />;
}
