import type { EmploymentMode, Role } from '@/lib/constants';
import type { BreResult, LoanStatus, SalarySlip } from './loan';

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; limit: number; totalItems: number; totalPages: number };
}

/** One row of a staff queue (money in paise; PAN always masked). */
export interface LoanSummary {
  id: string;
  borrower: { name: string; email: string };
  applicant: { fullName: string; panMasked: string };
  principal: number;
  tenureDays: number;
  totalRepayment: number;
  totalPaid: number;
  outstanding: number;
  status: LoanStatus;
  createdAt: string;
  disbursedAt: string | null;
}

export interface LoanDetail extends LoanSummary {
  applicant: LoanSummary['applicant'] & {
    dateOfBirth: string;
    monthlySalary: number;
    employmentMode: EmploymentMode;
    breResult: BreResult;
  };
  salarySlip: SalarySlip;
  annualInterestRate: number;
  simpleInterest: number;
  rejectionReason: string | null;
  closedAt: string | null;
  statusHistory: {
    from: LoanStatus | null;
    to: LoanStatus;
    at: string;
    note: string | null;
    by: { name: string; role: Role };
  }[];
}

export interface Payment {
  id: string;
  utr: string;
  amount: number;
  paymentDate: string;
  recordedBy: { name: string };
  createdAt: string;
}

export type LeadStage = 'PROFILE_PENDING' | 'BRE_FAILED' | 'SALARY_SLIP_PENDING' | 'READY_TO_APPLY';

/** A registered borrower who hasn't applied yet (Sales module). */
export interface Lead {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
  stage: LeadStage;
  breFailures: { rule: string; message: string }[];
}

export interface DashboardSummary {
  loansByStatus: Record<LoanStatus, number>;
  leadCount: number;
}
