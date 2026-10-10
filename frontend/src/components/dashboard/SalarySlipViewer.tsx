import type { SalarySlip } from '@/types/loan';

/**
 * Shows the loan's salary slip inline: an <iframe> for PDFs, an <img> for images. Both load
 * through the same-origin /api proxy, so the session cookie is sent. iOS Safari renders PDFs in
 * iframes poorly, hence the "open in a new tab" link.
 */
export function SalarySlipViewer({ loanId, slip }: { loanId: string; slip: SalarySlip }) {
  const url = `/api/v1/loans/${loanId}/salary-slip`;
  const isPdf = slip.contentType === 'application/pdf';

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Salary slip</h2>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="text-sm font-medium text-indigo-700 hover:underline"
        >
          Open in a new tab
        </a>
      </div>
      {isPdf ? (
        <iframe
          src={url}
          title="Salary slip (PDF)"
          className="h-[28rem] w-full rounded border border-slate-200"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an authenticated API file, not a static asset
        <img
          src={url}
          alt="Salary slip"
          className="max-h-[28rem] w-auto rounded border border-slate-200"
        />
      )}
    </section>
  );
}
