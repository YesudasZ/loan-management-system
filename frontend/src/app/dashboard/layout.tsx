import { CurrentUserProvider } from '@/components/auth/CurrentUserProvider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <CurrentUserProvider>
      <DashboardShell>{children}</DashboardShell>
    </CurrentUserProvider>
  );
}
