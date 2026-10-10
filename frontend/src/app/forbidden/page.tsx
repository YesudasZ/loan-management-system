import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { LogoutButton } from '@/components/auth/LogoutButton';

export const metadata: Metadata = { title: 'Access denied' };

export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-bold text-slate-300">403</p>
      <h1 className="text-2xl font-semibold text-slate-900">
        You don&apos;t have access to this page
      </h1>
      <p className="max-w-md text-sm text-slate-600">
        Your role can&apos;t open this part of the system. If you think this is wrong, ask an
        administrator.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Go to my home page</ButtonLink>
        <LogoutButton />
      </div>
    </main>
  );
}
