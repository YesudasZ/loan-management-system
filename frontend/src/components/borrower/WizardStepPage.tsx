'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageSpinner } from '@/components/ui/Spinner';
import { useApiQuery } from '@/hooks/useApiQuery';
import { getWizardRedirect, WIZARD_STEPS } from '@/lib/wizard';
import type { BorrowerProgress, WizardStep } from '@/types/loan';

// Completed steps use the accent (emerald), the current one the primary blue.
const STEP_BAR_CLASSES = {
  done: 'bg-accent',
  current: 'bg-primary',
  todo: 'bg-slate-200',
} as const;

function WizardSteps({ current }: { current: WizardStep }) {
  const currentIndex = WIZARD_STEPS.findIndex((entry) => entry.step === current);
  return (
    <ol aria-label="Application steps" className="mb-8 grid grid-cols-4 gap-2">
      {WIZARD_STEPS.map((entry, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <li
            key={entry.step}
            aria-current={state === 'current' ? 'step' : undefined}
            className="flex flex-col gap-1"
          >
            <span className={`h-1.5 rounded-full ${STEP_BAR_CLASSES[state]}`} />
            <span
              className={`text-xs ${state === 'current' ? 'font-semibold text-primary' : 'text-slate-500'}`}
            >
              {index + 1}. {entry.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface WizardStepPageProps {
  step: WizardStep;
  children: (progress: BorrowerProgress, reload: () => void) => ReactNode;
}

/**
 * Loads the borrower's progress, sends them to the right step if they can't open this one yet
 * (or are locked by an active loan), and renders the step with the progress bar.
 */
export function WizardStepPage({ step, children }: WizardStepPageProps) {
  const router = useRouter();
  const {
    data: progress,
    error,
    isLoading,
    reload,
  } = useApiQuery<BorrowerProgress>('/borrower/progress');
  const redirectTo = progress ? getWizardRedirect(step, progress) : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (error) {
    return <ErrorState message={error.message} onRetry={reload} />;
  }
  if (isLoading || !progress || redirectTo) {
    return <PageSpinner label="Loading your application" />;
  }
  return (
    <>
      <WizardSteps current={step} />
      {children(progress, reload)}
    </>
  );
}
