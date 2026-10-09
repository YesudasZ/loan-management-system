import { describe, expect, it } from 'vitest';
import type { BorrowerLoan, BorrowerProfile, BorrowerProgress, LoanStatus } from '@/types/loan';
import { getWizardRedirect } from './wizard';

const profile = (hasSlip: boolean): BorrowerProfile => ({
  fullName: 'Riya Sharma',
  pan: 'ABCDE1234F',
  dateOfBirth: '1995-06-15',
  monthlySalary: 5_000_000,
  employmentMode: 'SALARIED',
  breResult: { isEligible: true, failures: [], checkedAt: '2026-10-10T00:00:00Z' },
  salarySlip: hasSlip
    ? { contentType: 'application/pdf', sizeBytes: 100, uploadedAt: '2026-10-10T00:00:00Z' }
    : null,
  updatedAt: '2026-10-10T00:00:00Z',
});

const loan = (status: LoanStatus) => ({ status }) as BorrowerLoan;

function progress(overrides: Partial<BorrowerProgress>): BorrowerProgress {
  return {
    currentStep: 'PROFILE',
    isEligible: false,
    profile: null,
    latestLoan: null,
    ...overrides,
  };
}

describe('getWizardRedirect', () => {
  it('lets a new borrower fill in the profile but not jump ahead', () => {
    const state = progress({});
    expect(getWizardRedirect('PROFILE', state)).toBeNull();
    expect(getWizardRedirect('SALARY_SLIP', state)).toBe('/apply/profile');
    expect(getWizardRedirect('LOAN', state)).toBe('/apply/profile');
    expect(getWizardRedirect('STATUS', state)).toBe('/apply/profile');
  });

  it('sends an eligible borrower without a slip to the slip step', () => {
    const state = progress({
      currentStep: 'SALARY_SLIP',
      isEligible: true,
      profile: profile(false),
    });
    expect(getWizardRedirect('SALARY_SLIP', state)).toBeNull();
    expect(getWizardRedirect('LOAN', state)).toBe('/apply/salary-slip');
  });

  it('opens the loan step once the slip is uploaded', () => {
    const state = progress({ currentStep: 'LOAN', isEligible: true, profile: profile(true) });
    expect(getWizardRedirect('LOAN', state)).toBeNull();
  });

  it.each<LoanStatus>(['APPLIED', 'SANCTIONED', 'DISBURSED'])(
    'locks every editing step while the loan is %s',
    (status) => {
      const state = progress({
        currentStep: 'STATUS',
        isEligible: true,
        profile: profile(true),
        latestLoan: loan(status),
      });
      expect(getWizardRedirect('PROFILE', state)).toBe('/apply/status');
      expect(getWizardRedirect('SALARY_SLIP', state)).toBe('/apply/status');
      expect(getWizardRedirect('LOAN', state)).toBe('/apply/status');
      expect(getWizardRedirect('STATUS', state)).toBeNull();
    },
  );

  it.each<LoanStatus>(['REJECTED', 'CLOSED'])('allows applying again after %s', (status) => {
    const state = progress({
      currentStep: 'STATUS',
      isEligible: true,
      profile: profile(true),
      latestLoan: loan(status),
    });
    expect(getWizardRedirect('LOAN', state)).toBeNull();
    expect(getWizardRedirect('PROFILE', state)).toBeNull();
  });
});
