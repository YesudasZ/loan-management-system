import { EMPLOYMENT_MODE_LABELS } from '@/lib/constants';
import { formatDate, formatDateTime, formatInr } from '@/lib/format';
import { ELIGIBILITY_RULE_LABELS } from '@/lib/loan-terms';
import type { LoanDetail } from '@/types/staff';

function Fact({
  label,
  value,
  isStrong = false,
}: {
  label: string;
  value: string;
  isStrong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 wrap-anywhere ${isStrong ? 'font-semibold text-primary' : 'text-slate-900'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

export function ApplicantCard({ loan }: { loan: LoanDetail }) {
  const { applicant, borrower } = loan;
  return (
    <Card title="Applicant">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Full name" value={applicant.fullName} />
        <Fact label="Email" value={borrower.email} />
        <Fact label="PAN" value={applicant.panMasked} />
        <Fact label="Date of birth" value={formatDate(applicant.dateOfBirth)} />
        <Fact label="Monthly salary" value={formatInr(applicant.monthlySalary)} />
        <Fact label="Employment" value={EMPLOYMENT_MODE_LABELS[applicant.employmentMode]} />
      </dl>
    </Card>
  );
}

const BRE_RULE_LABELS = Object.values(ELIGIBILITY_RULE_LABELS);

export function BreResultCard({ loan }: { loan: LoanDetail }) {
  const { breResult } = loan.applicant;
  return (
    <Card title="Eligibility check (BRE)">
      {breResult.isEligible ? (
        <ul className="space-y-1 text-sm text-accent-strong">
          {BRE_RULE_LABELS.map((label) => (
            <li key={label}>
              <span aria-hidden="true">✓ </span>
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1 text-sm text-danger-strong">
          {breResult.failures.map((failure) => (
            <li key={failure.rule}>✗ {failure.message}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">Checked {formatDateTime(breResult.checkedAt)}</p>
    </Card>
  );
}

export function LoanTermsCard({ loan }: { loan: LoanDetail }) {
  return (
    <Card title="Loan">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Fact label="Amount" value={formatInr(loan.principal)} />
        <Fact label="Tenure" value={`${loan.tenureDays} days`} />
        <Fact
          label={`Interest (${loan.annualInterestRate}% p.a.)`}
          value={formatInr(loan.simpleInterest)}
        />
        <Fact label="Total repayment" value={formatInr(loan.totalRepayment)} isStrong />
        <Fact label="Paid" value={formatInr(loan.totalPaid)} />
        <Fact label="Outstanding" value={formatInr(loan.outstanding)} isStrong />
      </dl>
    </Card>
  );
}

export function HistoryCard({ loan }: { loan: LoanDetail }) {
  return (
    <Card title="History">
      <ol className="flex flex-col gap-2 text-sm">
        {loan.statusHistory.map((entry) => (
          <li key={`${entry.to}-${entry.at}`}>
            <span className="font-medium text-slate-900">{entry.to}</span>{' '}
            <span className="text-slate-500">
              · {formatDateTime(entry.at)} · {entry.by.name} ({entry.by.role})
            </span>
            {entry.note && <p className="text-slate-600">{entry.note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
