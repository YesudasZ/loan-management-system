import { AuthInfoPanel } from '@/components/auth/AuthInfoPanel';

/**
 * Login and sign-up: the form on the right and the brand panel on the left from 1024px up. On
 * phones and tablets the form comes first and the loan information follows it.
 */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main id="main-content" className="grid flex-1 lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-6 lg:py-16">
        <div className="w-full max-w-sm">
          <p className="mb-6 text-center text-lg font-semibold text-primary lg:hidden">
            Loan Management System
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {children}
          </div>
        </div>
      </div>
      <AuthInfoPanel />
    </main>
  );
}
