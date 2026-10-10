'use client';

import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';

interface ErrorFallbackProps {
  /** Re-renders the part of the page that failed (Next's error boundary `reset`). */
  onRetry: () => void;
}

/**
 * What an error boundary shows instead of a blank screen: a short explanation, "Try again" and a
 * way home. `/` sends each role to its own home page.
 */
export function ErrorFallback({ onRetry }: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <p className="text-5xl font-bold text-slate-300" aria-hidden="true">
        !
      </p>
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="text-sm text-slate-600">
        This page hit an unexpected problem. Your data is safe. Try again, or go back to your home
        page.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={onRetry}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to my home page
        </ButtonLink>
      </div>
    </div>
  );
}
