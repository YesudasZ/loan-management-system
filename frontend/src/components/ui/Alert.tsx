import type { ReactNode } from 'react';

type AlertTone = 'error' | 'info';

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-danger-border bg-danger-soft text-danger-strong',
  info: 'border-primary-border bg-primary-soft text-primary-dark',
};

/** An inline message. Errors use role="alert" so screen readers announce them immediately. */
export function Alert({ tone = 'error', children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}
