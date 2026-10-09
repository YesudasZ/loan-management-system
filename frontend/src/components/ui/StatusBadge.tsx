import type { LoanStatus } from '@/types/loan';

const STATUS_STYLES: Record<LoanStatus, string> = {
  APPLIED: 'bg-sky-100 text-sky-800',
  SANCTIONED: 'bg-amber-100 text-amber-800',
  REJECTED: 'bg-red-100 text-red-800',
  DISBURSED: 'bg-teal-100 text-teal-800',
  CLOSED: 'bg-green-100 text-green-800',
};

export function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
