'use client';

import { ErrorFallback } from '@/components/ErrorFallback';

/** Errors in a borrower page: shown inside the borrower header, which keeps working. */
export default function ApplyError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback onRetry={reset} />;
}
