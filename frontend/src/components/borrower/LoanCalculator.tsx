'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ApiError, apiRequest } from '@/lib/api-client';
import { getBreFailures, type BreFailure } from '@/lib/bre';
import {
  ANNUAL_INTEREST_RATE_PERCENT,
  DEFAULT_PRINCIPAL_RUPEES,
  DEFAULT_TENURE_DAYS,
  MAX_PRINCIPAL_RUPEES,
  MAX_TENURE_DAYS,
  MIN_PRINCIPAL_RUPEES,
  MIN_TENURE_DAYS,
  PAISE_PER_RUPEE,
  PRINCIPAL_STEP_RUPEES,
} from '@/lib/constants';
import { formatInr } from '@/lib/format';
import { calculateLoanQuote } from '@/lib/loan-math';
import { BreFailureList } from './BreFailureList';

const ANNOUNCE_DELAY_MS = 500;

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

/** A native range input: keyboard support (arrows, Home/End, PageUp/Down) comes for free. */
function Slider({ id, label, value, min, max, step, displayValue, onChange }: SliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <span className="text-lg font-semibold text-slate-900">{displayValue}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={displayValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-indigo-600"
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  isTotal = false,
}: {
  label: string;
  value: string;
  isTotal?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 py-2 ${isTotal ? 'border-t border-slate-200 pt-3' : ''}`}
    >
      <dt className={isTotal ? 'font-semibold text-slate-900' : 'text-slate-600'}>{label}</dt>
      <dd
        className={isTotal ? 'text-lg font-semibold text-indigo-700' : 'font-medium text-slate-900'}
      >
        {value}
      </dd>
    </div>
  );
}

export function LoanCalculator() {
  const router = useRouter();
  const [amountRupees, setAmountRupees] = useState(DEFAULT_PRINCIPAL_RUPEES);
  const [tenureDays, setTenureDays] = useState(DEFAULT_TENURE_DAYS);
  const [announcement, setAnnouncement] = useState('');
  const [breFailures, setBreFailures] = useState<BreFailure[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const principal = amountRupees * PAISE_PER_RUPEE;
  const quote = calculateLoanQuote({
    principal,
    tenureDays,
    annualInterestRate: ANNUAL_INTEREST_RATE_PERCENT,
  });

  // Announce the new total once the user pauses, not on every arrow-key step.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnouncement(
        `Total repayment ${formatInr(quote.totalRepayment)} for ${formatInr(principal)} over ${tenureDays} days.`,
      );
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [quote.totalRepayment, principal, tenureDays]);

  async function handleApply() {
    setFormError(null);
    setBreFailures([]);
    setIsApplying(true);
    try {
      // Only the choice is sent; the server calculates interest and totals itself.
      await apiRequest('/borrower/loans', { method: 'POST', body: { principal, tenureDays } });
      toast.success('Application submitted.');
      router.push('/apply/status');
    } catch (error) {
      setIsApplying(false);
      if (error instanceof ApiError && error.code === 'BRE_FAILED') {
        setBreFailures(getBreFailures(error));
      } else {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong.');
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 rounded-lg border border-slate-200 bg-white p-5">
        <Slider
          id="loan-amount"
          label="Loan amount"
          value={amountRupees}
          min={MIN_PRINCIPAL_RUPEES}
          max={MAX_PRINCIPAL_RUPEES}
          step={PRINCIPAL_STEP_RUPEES}
          displayValue={formatInr(principal)}
          onChange={setAmountRupees}
        />
        <Slider
          id="loan-tenure"
          label="Tenure"
          value={tenureDays}
          min={MIN_TENURE_DAYS}
          max={MAX_TENURE_DAYS}
          step={1}
          displayValue={`${tenureDays} days`}
          onChange={setTenureDays}
        />
      </div>

      <section
        aria-labelledby="calculation-heading"
        className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-5"
      >
        <h2 id="calculation-heading" className="mb-2 text-sm font-semibold text-slate-800">
          Your repayment
        </h2>
        <dl className="text-sm">
          <SummaryRow label="Loan amount" value={formatInr(principal)} />
          <SummaryRow
            label="Interest rate"
            value={`${ANNUAL_INTEREST_RATE_PERCENT}% p.a. (simple)`}
          />
          <SummaryRow label="Tenure" value={`${tenureDays} days`} />
          <SummaryRow label="Interest" value={formatInr(quote.simpleInterest)} />
          <SummaryRow label="Total repayment" value={formatInr(quote.totalRepayment)} isTotal />
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Simple interest = amount × {ANNUAL_INTEREST_RATE_PERCENT}% × days ÷ 365.
        </p>
      </section>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {formError && <Alert>{formError}</Alert>}
      {breFailures.length > 0 && (
        <>
          <BreFailureList failures={breFailures} />
          <Link
            href="/apply/profile"
            className="text-sm font-medium text-indigo-700 hover:underline"
          >
            Update your personal details
          </Link>
        </>
      )}
      <Button onClick={handleApply} isLoading={isApplying}>
        Apply for {formatInr(principal)}
      </Button>
    </div>
  );
}
