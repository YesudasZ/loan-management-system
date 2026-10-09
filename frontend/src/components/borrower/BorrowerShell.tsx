'use client';

import type { ReactNode } from 'react';
import { AuthenticatedPage } from '@/components/AuthenticatedPage';
import { LogoutButton } from '@/components/auth/LogoutButton';

/** Header + content area for the borrower portal. */
export function BorrowerShell({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedPage>
      {(user) => (
        <div className="flex min-h-full flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
              <p className="font-semibold text-indigo-700">LMS · Personal loan</p>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>
                <LogoutButton />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
        </div>
      )}
    </AuthenticatedPage>
  );
}
