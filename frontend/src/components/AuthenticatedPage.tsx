'use client';

import type { ReactNode } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageSpinner } from '@/components/ui/Spinner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { User } from '@/types/user';

/** Shows a spinner or an error until the current user is loaded, then renders `children(user)`. */
export function AuthenticatedPage({ children }: { children: (user: User) => ReactNode }) {
  const { user, isLoading, error, reload } = useCurrentUser();

  if (isLoading) {
    return <PageSpinner label="Loading your account" />;
  }
  if (error || !user) {
    return (
      <div className="p-6">
        <ErrorState message={error?.message ?? 'Could not load your account.'} onRetry={reload} />
      </div>
    );
  }
  return children(user);
}
