'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { ApiError, apiRequest } from '@/lib/api-client';
import { NOTE_MAX_LENGTH, REJECTION_REASON_MIN_LENGTH } from '@/lib/constants';
import type { LoanDetail } from '@/types/staff';
import { ApplicantCard, BreResultCard, HistoryCard, LoanTermsCard } from './LoanFacts';
import { LoanQueue } from './LoanQueue';
import { SalarySlipViewer } from './SalarySlipViewer';

const QUEUE_PATH = '/dashboard/sanction';

export function SanctionQueue() {
  return (
    <>
      <PageHeader title="Sanction" description="Applied loans waiting for approval or rejection." />
      <LoanQueue
        status="APPLIED"
        emptyTitle="No applications to review"
        renderAction={(loan) => (
          <ButtonLink href={`${QUEUE_PATH}/${loan.id}`} variant="secondary">
            Review<span className="sr-only"> {loan.applicant.fullName}</span>
          </ButtonLink>
        )}
      />
    </>
  );
}

function RejectDialog({
  isOpen,
  onClose,
  onReject,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReject: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isRunning: isSubmitting, run } = useSingleFlight();

  function handleSubmit() {
    if (reason.trim().length < REJECTION_REASON_MIN_LENGTH) {
      setError(`Give a reason of at least ${REJECTION_REASON_MIN_LENGTH} characters.`);
      return;
    }
    void run(() => onReject(reason.trim()));
  }

  return (
    <Dialog isOpen={isOpen} title="Reject this application?" onClose={onClose}>
      <div className="flex flex-col gap-1">
        <label htmlFor="reject-reason" className="text-sm font-medium text-slate-700">
          Reason (shown to the borrower)
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'reject-reason-error' : undefined}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus:outline-2 focus:outline-offset-1 focus:outline-primary sm:text-sm"
        />
        {error && (
          <p id="reject-reason-error" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" isLoading={isSubmitting} onClick={handleSubmit}>
          Reject
        </Button>
      </div>
    </Dialog>
  );
}

function ReviewActions({ loan }: { loan: LoanDetail }) {
  const router = useRouter();
  const { isRunning: isApproving, run } = useSingleFlight();
  // Stays true after a decision, so neither button works again while the page changes.
  const [isDecided, setIsDecided] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After a decision the loan leaves this queue (and this executive's view), so go back to the
  // queue instead of reloading the page.
  function finish(message: string) {
    setIsDecided(true);
    toast.success(message);
    router.replace(QUEUE_PATH);
  }

  function approve() {
    void run(async () => {
      try {
        await apiRequest(`/loans/${loan.id}/approve`, { method: 'POST' });
        finish(`Approved ${loan.applicant.fullName}'s loan → SANCTIONED`);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not approve the loan.');
      }
    });
  }

  async function reject(reason: string) {
    try {
      await apiRequest(`/loans/${loan.id}/reject`, { method: 'POST', body: { reason } });
      finish(`Rejected ${loan.applicant.fullName}'s application`);
    } catch (caught) {
      setIsRejectOpen(false);
      setError(caught instanceof ApiError ? caught.message : 'Could not reject the loan.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button isLoading={isApproving || isDecided} onClick={approve}>
          Approve
        </Button>
        <Button
          variant="danger"
          disabled={isApproving || isDecided}
          onClick={() => setIsRejectOpen(true)}
        >
          Reject…
        </Button>
      </div>
      <RejectDialog
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        onReject={reject}
      />
    </div>
  );
}

export function SanctionReview({ loanId }: { loanId: string }) {
  const { data, error, isLoading, reload } = useApiQuery<{ loan: LoanDetail }>(`/loans/${loanId}`);

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (isLoading || !data) return <PageSpinner label="Loading the application" />;
  const { loan } = data;

  return (
    <div className="flex flex-col gap-4">
      <ButtonLink href={QUEUE_PATH} variant="link" className="self-start">
        ← Back to applications
      </ButtonLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold wrap-anywhere text-slate-900">
          {loan.applicant.fullName}
        </h1>
        <StatusBadge status={loan.status} />
      </div>
      {loan.status === 'APPLIED' ? (
        <ReviewActions loan={loan} />
      ) : (
        <Alert tone="info">This loan is {loan.status}; there is nothing to decide here.</Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ApplicantCard loan={loan} />
        <BreResultCard loan={loan} />
      </div>
      <LoanTermsCard loan={loan} />
      <SalarySlipViewer loanId={loan.id} slip={loan.salarySlip} />
      <HistoryCard loan={loan} />
    </div>
  );
}
