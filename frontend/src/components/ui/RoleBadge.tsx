import { ROLE_LABELS, type Role } from '@/lib/constants';

const ROLE_STYLES: Record<Role, string> = {
  ADMIN: 'bg-purple-100 text-purple-800',
  SALES: 'bg-sky-100 text-sky-800',
  SANCTION: 'bg-amber-100 text-amber-800',
  DISBURSEMENT: 'bg-teal-100 text-teal-800',
  COLLECTION: 'bg-green-100 text-green-800',
  BORROWER: 'bg-slate-100 text-slate-700',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_STYLES[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
