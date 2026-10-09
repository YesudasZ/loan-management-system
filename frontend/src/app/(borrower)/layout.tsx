import { CurrentUserProvider } from '@/components/auth/CurrentUserProvider';
import { BorrowerShell } from '@/components/borrower/BorrowerShell';

export default function BorrowerLayout({ children }: LayoutProps<'/'>) {
  return (
    <CurrentUserProvider>
      <BorrowerShell>{children}</BorrowerShell>
    </CurrentUserProvider>
  );
}
