'use client';

import { ErrorFallback } from '@/components/ErrorFallback';

/** Errors in a dashboard module: shown inside the dashboard shell, so the sidebar still works. */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback onRetry={reset} />;
}
