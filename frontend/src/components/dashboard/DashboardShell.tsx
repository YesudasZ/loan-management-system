'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AuthenticatedPage } from '@/components/AuthenticatedPage';
import { LogoutButton } from '@/components/auth/LogoutButton';
import type { Role } from '@/lib/constants';
import { getAllowedModules } from '@/lib/route-access';

interface NavLink {
  label: string;
  path: string;
}

/** The sidebar shows only the modules the role may open (ADMIN also gets the overview). */
function getNavLinks(role: Role): NavLink[] {
  const moduleLinks = getAllowedModules(role).map(({ label, path }) => ({ label, path }));
  return role === 'ADMIN'
    ? [{ label: 'Overview', path: '/dashboard' }, ...moduleLinks]
    : moduleLinks;
}

function isActive(pathname: string, path: string): boolean {
  return path === '/dashboard' ? pathname === path : pathname.startsWith(path);
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard modules" className="flex flex-col gap-1 p-3">
      {getNavLinks(role).map((link) => {
        const active = isActive(pathname, link.path);
        return (
          <Link
            key={link.path}
            href={link.path}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Operations dashboard layout: sidebar (a drawer on small screens), header, content. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <AuthenticatedPage>
      {(user) => (
        <div className="flex min-h-full flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
                aria-expanded={isMenuOpen}
                aria-controls="dashboard-sidebar"
                onClick={() => setIsMenuOpen((open) => !open)}
              >
                Menu
              </button>
              <p className="font-semibold text-indigo-700">LMS Operations</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                {user.name} · <span className="font-medium">{user.role}</span>
              </span>
              <LogoutButton />
            </div>
          </header>
          <div className="flex flex-1">
            <aside
              id="dashboard-sidebar"
              className={`${isMenuOpen ? 'block' : 'hidden'} w-full border-r border-slate-200 bg-white md:block md:w-56`}
            >
              <Sidebar role={user.role} onNavigate={() => setIsMenuOpen(false)} />
            </aside>
            <main
              id="main-content"
              className={`${isMenuOpen ? 'hidden' : 'block'} min-w-0 flex-1 p-4 md:block md:p-8`}
            >
              {children}
            </main>
          </div>
        </div>
      )}
    </AuthenticatedPage>
  );
}
