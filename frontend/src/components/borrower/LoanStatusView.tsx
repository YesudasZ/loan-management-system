import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Role } from '@/lib/constants';
import { formatDateTime, formatInr } from '@/lib/format';
import type { BorrowerLoan, LoanStatus } from '@/types/loan';

const STATUS_EXPLANATIONS: Record<LoanStatus, string> = {
  APPLIED: 'Your application is with our sanction team for review.',
  SANCTIONED: 'Approved! The funds will be released to you shortly.',
  REJECTED: 'Your application was not approved.',
  DISBURSED: 'The funds have been released. Repay by the end of your tenure.',
  CLOSED: 'Fully repaid. This loan is closed.',
};

const EVENT_LABELS: Record<LoanStatus, string> = {
  APPLIED: 'Application submitted',
  SANCTIONED: 'Approved',
  REJECTED: 'Rejected',
  DISBURSED: 'Funds disbursed',
  CLOSED: 'Loan closed (fully repaid)',
};

const ACTOR_LABELS: Record<Role, string> = {
  BORROWER: 'you',
  ADMIN: 'an administrator',
  SALES: 'the sales team',
  SANCTION: 'the sanction team',
  DISBURSEMENT: 'the disbursement team',
  COLLECTION: 'the collection team',
};

function Amount({
  label,
  paise,
  isHighlighted = false,
}: {
  label: string;
  paise: number;
  isHighlighted?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 font-semibold ${isHighlighted ? 'text-indigo-700' : 'text-slate-900'}`}>
        {formatInr(paise)}
      </dd>
    </div>
  );
}

export function LoanStatusView({ loan }: { loan: BorrowerLoan }) {
  const canApplyAgain = loan.status === 'REJECTED' || loan.status === 'CLOSED';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={loan.status} />
        <p className="text-sm text-slate-700">{STATUS_EXPLANATIONS[loan.status]}</p>
      </div>

      {loan.status === 'REJECTED' && loan.rejectionReason && (
        <Alert>Reason: {loan.rejectionReason}</Alert>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Amount label="Loan amount" paise={loan.principal} />
        <Amount
          label={`Interest (${loan.annualInterestRate}% p.a., ${loan.tenureDays} days)`}
          paise={loan.simpleInterest}
        />
        <Amount label="Total repayment" paise={loan.totalRepayment} isHighlighted />
        <Amount label="Paid so far" paise={loan.totalPaid} />
        <Amount label="Outstanding" paise={loan.outstanding} isHighlighted />
      </dl>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="mb-3 text-sm font-semibold text-slate-800">
          Timeline
        </h2>
        <ol className="flex flex-col gap-3 border-l-2 border-slate-200 pl-4">
          {loan.statusHistory.map((entry) => (
            <li key={`${entry.to}-${entry.at}`} className="text-sm">
              <p className="font-medium text-slate-900">{EVENT_LABELS[entry.to]}</p>
              <p className="text-slate-500">
                {formatDateTime(entry.at)} · by {ACTOR_LABELS[entry.byRole]}
              </p>
              {entry.note && entry.to !== 'REJECTED' && (
                <p className="text-slate-600">{entry.note}</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {canApplyAgain && (
        <div className="flex flex-wrap gap-3">
          <Link
            href="/apply/loan"
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply again
          </Link>
          <Link
            href="/apply/profile"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Update my details
          </Link>
        </div>
      )}
    </div>
  );
}
