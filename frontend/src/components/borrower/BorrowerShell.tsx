'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthenticatedPage } from '@/components/AuthenticatedPage';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { isUnder, MY_LOANS_PATH } from '@/lib/route-access';

function BorrowerNav() {
  const pathname = usePathname();
  const isMyLoans = isUnder(pathname, MY_LOANS_PATH);
  const links = [
    { href: '/apply', label: 'My application', isCurrent: !isMyLoans },
    { href: MY_LOANS_PATH, label: 'My loans', isCurrent: isMyLoans },
  ];

  return (
    <nav aria-label="Borrower" className="mx-auto flex max-w-3xl gap-1 px-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.isCurrent ? 'page' : undefined}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            link.isCurrent
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Header (with the borrower's two sections) + content area for the borrower portal. */
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
            <BorrowerNav />
          </header>
          <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
            {children}
          </main>
        </div>
      )}
    </AuthenticatedPage>
  );
}
