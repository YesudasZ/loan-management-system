import type { ReactNode } from 'react';

type AlertTone = 'error' | 'info';

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
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
