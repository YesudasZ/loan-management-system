'use client';

import { ErrorFallback } from '@/components/ErrorFallback';

/** Catches errors in any page that has no closer boundary. */
export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="flex flex-1 items-center justify-center">
      <ErrorFallback onRetry={reset} />
    </main>
  );
}
