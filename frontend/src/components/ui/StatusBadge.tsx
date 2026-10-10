import type { LoanStatus } from '@/types/loan';

// Colour is never the only signal: every badge shows the status text too. Each text/background
// pair is above 4.5:1 (WCAG AA).
const STATUS_STYLES: Record<LoanStatus, string> = {
  APPLIED: 'bg-blue-100 text-blue-800',
  SANCTIONED: 'bg-indigo-100 text-indigo-800',
  DISBURSED: 'bg-amber-100 text-amber-900',
  CLOSED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
