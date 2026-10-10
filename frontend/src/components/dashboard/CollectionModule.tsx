'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { ApiError, apiRequest, getFailureMessages, getFieldErrors } from '@/lib/api-client';
import { UTR_PATTERN } from '@/lib/constants';
import { toBusinessDate } from '@/lib/dates';
import { formatDate, formatInr, paiseToRupeeInput, parseRupeesToPaise } from '@/lib/format';
import type { LoanDetail, Paginated, Payment } from '@/types/staff';
import { HistoryCard, LoanTermsCard } from './LoanFacts';
import { LoanQueue } from './LoanQueue';

const QUEUE_PATH = '/dashboard/collection';

export function CollectionQueue() {
  return (
    <>
      <PageHeader
        title="Collection"
        description="Disbursed loans: outstanding balances and payments."
      />
      <LoanQueue
        status="DISBURSED"
        emptyTitle="No active loans"
        showRepayment
        renderAction={(loan) => (
          <ButtonLink href={`${QUEUE_PATH}/${loan.id}`} variant="secondary">
            Record payment<span className="sr-only"> for {loan.applicant.fullName}</span>
          </ButtonLink>
        )}
      />
    </>
  );
}

function PaymentForm({
  loan,
  onRecorded,
}: {
  loan: LoanDetail;
  onRecorded: (loan: LoanDetail) => void;
}) {
  const today = toBusinessDate();
  const [utr, setUtr] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const { isRunning: isSaving, run } = useSingleFlight();
  const disbursedOn = loan.disbursedAt ? toBusinessDate(new Date(loan.disbursedAt)) : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = parseRupeesToPaise(amount);
    const errors: Record<string, string> = {};
    if (!UTR_PATTERN.test(utr.trim().toUpperCase()))
      errors.utr = 'UTR must be 6 to 30 letters or digits';
    if (amountPaise === null || amountPaise <= 0) errors.amount = 'Enter an amount in rupees';
    if (!paymentDate) errors.paymentDate = 'Choose the payment date';
    setFieldErrors(errors);
    setFormErrors([]);
    if (Object.keys(errors).length > 0 || amountPaise === null) return;

    void run(async () => {
      try {
        const result = await apiRequest<{ payment: Payment; loan: LoanDetail }>(
          `/loans/${loan.id}/payments`,
          { method: 'POST', body: { utr: utr.trim(), amount: amountPaise, paymentDate } },
        );
        setUtr('');
        setAmount('');
        onRecorded(result.loan);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          setFormErrors(['Could not record the payment.']);
        } else if (error.code === 'VALIDATION_ERROR') {
          setFieldErrors(getFieldErrors(error));
        } else if (error.code === 'DUPLICATE_UTR') {
          setFieldErrors({ utr: error.message });
        } else {
          const messages = getFailureMessages(error);
          setFormErrors(messages.length > 0 ? messages : [error.message]);
        }
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-800">Record a payment</h2>
      {formErrors.length > 0 && (
        <Alert>
          {formErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="UTR number"
          value={utr}
          onChange={(event) => setUtr(event.target.value.toUpperCase())}
          autoCapitalize="characters"
          spellCheck={false}
          error={fieldErrors.utr}
          required
        />
        <TextField
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          hint={`Outstanding: ${formatInr(loan.outstanding)}`}
          error={fieldErrors.amount}
          required
        />
        <TextField
          label="Payment date"
          type="date"
          value={paymentDate}
          min={disbursedOn}
          max={today}
          onChange={(event) => setPaymentDate(event.target.value)}
          error={fieldErrors.paymentDate}
          required
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" isLoading={isSaving}>
          Record payment
        </Button>
        <Button variant="secondary" onClick={() => setAmount(paiseToRupeeInput(loan.outstanding))}>
          Fill outstanding amount
        </Button>
      </div>
    </form>
  );
}

/** Remounted (via `key`) after each payment so it fetches the updated list. */
function PaymentHistory({ loanId }: { loanId: string }) {
  const { data, error, isLoading, reload } = useApiQuery<Paginated<Payment>>(
    `/loans/${loanId}/payments?page=1&limit=100`,
  );

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading payments" />;
  if (data.items.length === 0) return <EmptyState title="No payments yet" />;

  return (
    <section className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="px-4 py-3 text-left text-sm font-semibold text-slate-800">
          Payment history
        </caption>
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2">
              Date
            </th>
            <th scope="col" className="px-4 py-2">
              UTR
            </th>
            <th scope="col" className="px-4 py-2 text-right">
              Amount
            </th>
            <th scope="col" className="px-4 py-2">
              Recorded by
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.items.map((payment) => (
            <tr key={payment.id}>
              <td className="px-4 py-2">{formatDate(payment.paymentDate)}</td>
              <td className="px-4 py-2 font-mono text-xs">{payment.utr}</td>
              <td className="px-4 py-2 text-right">{formatInr(payment.amount)}</td>
              <td className="px-4 py-2">{payment.recordedBy.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function CollectionLoanView({ loanId }: { loanId: string }) {
  const router = useRouter();
  const { data, error, isLoading, reload } = useApiQuery<{ loan: LoanDetail }>(`/loans/${loanId}`);
  const [historyVersion, setHistoryVersion] = useState(0);

  function handleRecorded(updated: LoanDetail) {
    if (updated.status === 'CLOSED') {
      // Fully repaid: the loan leaves the collection queue (and this view), so go back.
      toast.success(`Loan fully repaid and closed for ${updated.applicant.fullName}`);
      router.replace(QUEUE_PATH);
      return;
    }
    toast.success(`Payment recorded. Outstanding: ${formatInr(updated.outstanding)}`);
    reload();
    setHistoryVersion((version) => version + 1);
  }

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading the loan" />;
  const { loan } = data;

  return (
    <div className="flex flex-col gap-4">
      <ButtonLink href={QUEUE_PATH} variant="link" className="self-start">
        ← Back to active loans
      </ButtonLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold wrap-anywhere text-slate-900">
          {loan.applicant.fullName}
        </h1>
        <StatusBadge status={loan.status} />
      </div>
      <LoanTermsCard loan={loan} />
      {loan.status === 'DISBURSED' ? (
        <PaymentForm loan={loan} onRecorded={handleRecorded} />
      ) : (
        <Alert tone="info">
          This loan is {loan.status}; payments can only be recorded while it is DISBURSED.
        </Alert>
      )}
      <PaymentHistory key={historyVersion} loanId={loan.id} />
      <HistoryCard loan={loan} />
    </div>
  );
}
