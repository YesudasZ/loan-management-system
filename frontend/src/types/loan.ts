import type { BreFailure } from '@/lib/bre';
import type { EmploymentMode, Role } from '@/lib/constants';

export type LoanStatus = 'APPLIED' | 'SANCTIONED' | 'REJECTED' | 'DISBURSED' | 'CLOSED';

export const ACTIVE_LOAN_STATUSES: readonly LoanStatus[] = ['APPLIED', 'SANCTIONED', 'DISBURSED'];

export type WizardStep = 'PROFILE' | 'SALARY_SLIP' | 'LOAN' | 'STATUS';

export interface SalarySlip {
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface BreResult {
  isEligible: boolean;
  failures: BreFailure[];
  checkedAt: string;
}

export interface BorrowerProfile {
  fullName: string;
  pan: string;
  dateOfBirth: string; // YYYY-MM-DD
  monthlySalary: number; // paise
  employmentMode: EmploymentMode;
  breResult: BreResult;
  salarySlip: SalarySlip | null;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  from: LoanStatus | null;
  to: LoanStatus;
  at: string;
  byRole: Role;
  note: string | null;
}

/** A loan as its borrower sees it (all money in paise). */
export interface BorrowerLoan {
  id: string;
  principal: number;
  tenureDays: number;
  annualInterestRate: number;
  simpleInterest: number;
  totalRepayment: number;
  totalPaid: number;
  outstanding: number;
  status: LoanStatus;
  rejectionReason: string | null;
  createdAt: string;
  disbursedAt: string | null;
  closedAt: string | null;
  statusHistory: StatusHistoryEntry[];
}

export interface BorrowerProgress {
  currentStep: WizardStep;
  isEligible: boolean;
  profile: BorrowerProfile | null;
  latestLoan: BorrowerLoan | null;
}
