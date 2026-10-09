import type { Metadata } from 'next';
import { ProfileStep } from '@/components/borrower/ApplicationSteps';

export const metadata: Metadata = { title: 'Personal details' };

export default function ProfilePage() {
  return <ProfileStep />;
}
