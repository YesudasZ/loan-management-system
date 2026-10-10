'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiError, apiRequest } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import type { LoanSummary } from '@/types/staff';
import { LoanQueue } from './LoanQueue';

export function DisbursementQueue() {
  const [selected, setSelected] = useState<{ loan: LoanSummary; reload: () => void } | null>(null);
  const [isDisbursing, setIsDisbursing] = useState(false);

  async function confirmDisbursal() {
    if (!selected) return;
    setIsDisbursing(true);
    try {
      await apiRequest(`/loans/${selected.loan.id}/disburse`, { method: 'POST' });
      toast.success(
        `Disbursed ${formatInr(selected.loan.principal)} to ${selected.loan.applicant.fullName}`,
      );
      selected.reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not mark it disbursed.');
    } finally {
      setIsDisbursing(false);
      setSelected(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Disbursement"
        description="Sanctioned loans waiting for the funds to be released."
      />
      <LoanQueue
        status="SANCTIONED"
        emptyTitle="No loans to disburse"
        renderAction={(loan, reload) => (
          <Button variant="secondary" onClick={() => setSelected({ loan, reload })}>
            Mark disbursed
          </Button>
        )}
      />
      <Dialog
        isOpen={selected !== null}
        title="Mark this loan as disbursed?"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <p className="text-sm text-slate-700">
            Confirm that {formatInr(selected.loan.principal)} has been released to{' '}
            <strong>{selected.loan.applicant.fullName}</strong>. The loan moves to Collection.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Cancel
          </Button>
          <Button isLoading={isDisbursing} onClick={confirmDisbursal}>
            Confirm disbursal
          </Button>
        </div>
      </Dialog>
    </>
  );
}
