'use client';

import './globals.css';
import { ErrorFallback } from '@/components/ErrorFallback';

/**
 * Last resort when the root layout itself fails. It replaces the whole document, so it renders
 * its own <html> and <body>.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center">
        <ErrorFallback onRetry={reset} />
      </body>
    </html>
  );
}
