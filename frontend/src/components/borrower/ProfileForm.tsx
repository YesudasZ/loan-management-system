'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { ApiError, apiRequest, getFieldErrors } from '@/lib/api-client';
import { evaluateEligibility, getBreFailures, type BreFailure, type BreRule } from '@/lib/bre';
import {
  EARLIEST_DATE_OF_BIRTH,
  EMPLOYMENT_MODE_LABELS,
  EMPLOYMENT_MODES,
  type EmploymentMode,
} from '@/lib/constants';
import { toBusinessDate } from '@/lib/dates';
import { ELIGIBILITY_RULE_LABELS } from '@/lib/loan-terms';
import { paiseToRupeeInput, parseRupeesToPaise } from '@/lib/format';
import type { BorrowerProfile } from '@/types/loan';
import { BreFailureList } from './BreFailureList';

const employmentOptions = EMPLOYMENT_MODES.map((mode) => ({
  value: mode,
  label: EMPLOYMENT_MODE_LABELS[mode],
}));

/** Live preview of the eligibility rules. It never blocks submitting: the server decides. */
function EligibilityPreview({ failures }: { failures: BreFailure[] }) {
  const failedRules = new Set(failures.map((failure) => failure.rule));
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-800">Eligibility preview</p>
      <ul className="mt-2 space-y-1 text-sm">
        {(Object.keys(ELIGIBILITY_RULE_LABELS) as BreRule[]).map((rule) => (
          <li
            key={rule}
            className={failedRules.has(rule) ? 'text-danger-strong' : 'text-accent-strong'}
          >
            <span aria-hidden="true">{failedRules.has(rule) ? '✗ ' : '✓ '}</span>
            {ELIGIBILITY_RULE_LABELS[rule]}
            <span className="sr-only">{failedRules.has(rule) ? ': not met' : ': met'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        The final check runs on our server when you continue.
      </p>
    </div>
  );
}

export function ProfileForm({ profile }: { profile: BorrowerProfile | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [pan, setPan] = useState(profile?.pan ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth ?? '');
  const [salary, setSalary] = useState(profile ? paiseToRupeeInput(profile.monthlySalary) : '');
  const [employmentMode, setEmploymentMode] = useState<EmploymentMode>(
    profile?.employmentMode ?? 'SALARIED',
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverFailures, setServerFailures] = useState<BreFailure[]>(
    profile && !profile.breResult.isEligible ? profile.breResult.failures : [],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const today = toBusinessDate();
  const monthlySalary = parseRupeesToPaise(salary);
  const preview =
    dateOfBirth && monthlySalary !== null && pan
      ? evaluateEligibility({ dateOfBirth, monthlySalary, pan, employmentMode }, today)
      : null;

  function validateShape(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (fullName.trim().length < 2) errors.fullName = 'Enter your full name as on your PAN card';
    if (!pan.trim()) errors.pan = 'PAN is required';
    if (!dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
    else if (dateOfBirth > today || dateOfBirth < EARLIEST_DATE_OF_BIRTH)
      errors.dateOfBirth = 'Enter a valid date of birth';
    if (monthlySalary === null) errors.monthlySalary = 'Enter an amount in rupees, e.g. 45000';
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const errors = validateShape();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || monthlySalary === null) return;

    setIsSaving(true);
    try {
      await apiRequest('/borrower/profile', {
        method: 'PUT',
        body: { fullName, pan, dateOfBirth, monthlySalary, employmentMode },
      });
      setServerFailures([]);
      toast.success('You are eligible. Next: upload your salary slip.');
      router.push('/apply/salary-slip');
    } catch (error) {
      setIsSaving(false);
      if (!(error instanceof ApiError)) {
        toast.error('Something went wrong. Please try again.');
      } else if (error.code === 'BRE_FAILED') {
        setServerFailures(getBreFailures(error));
      } else if (error.code === 'VALIDATION_ERROR') {
        setFieldErrors(getFieldErrors(error));
      } else {
        setFormError(error.message);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && <Alert>{formError}</Alert>}
      {serverFailures.length > 0 && <BreFailureList failures={serverFailures} />}
      <TextField
        label="Full name (as on PAN card)"
        autoComplete="name"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        error={fieldErrors.fullName}
        required
      />
      <TextField
        label="PAN"
        value={pan}
        onChange={(event) => setPan(event.target.value.toUpperCase())}
        hint="10 characters, e.g. ABCDE1234F"
        maxLength={10}
        autoCapitalize="characters"
        spellCheck={false}
        error={fieldErrors.pan}
        required
      />
      <TextField
        label="Date of birth"
        type="date"
        value={dateOfBirth}
        min={EARLIEST_DATE_OF_BIRTH}
        max={today}
        onChange={(event) => setDateOfBirth(event.target.value)}
        error={fieldErrors.dateOfBirth}
        required
      />
      <TextField
        label="Monthly salary (₹)"
        inputMode="decimal"
        value={salary}
        onChange={(event) => setSalary(event.target.value)}
        hint="Your monthly take-home pay in rupees"
        error={fieldErrors.monthlySalary}
        required
      />
      <SelectField
        label="Employment"
        options={employmentOptions}
        value={employmentMode}
        onChange={(event) => setEmploymentMode(event.target.value as EmploymentMode)}
        error={fieldErrors.employmentMode}
      />
      {preview && <EligibilityPreview failures={preview.failures} />}
      <Button type="submit" isLoading={isSaving}>
        Check eligibility and continue
      </Button>
    </form>
  );
}
