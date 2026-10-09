import type { Role } from '../../config/constants.js';
import type { LoanDocument } from '../../models/loan.model.js';
import type { LoanStatus } from '../../utils/loan-state-machine.js';

/** A loan as its borrower sees it. Contains no other users' ids. */
export interface BorrowerLoanDto {
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
  createdAt: Date;
  disbursedAt: Date | null;
  closedAt: Date | null;
  statusHistory: {
    from: LoanStatus | null;
    to: LoanStatus;
    at: Date;
    byRole: Role;
    note: string | null;
  }[];
}

/** Outstanding balance; derived, never stored, so it can't drift from the payments. */
export function getOutstanding(loan: Pick<LoanDocument, 'totalRepayment' | 'totalPaid'>): number {
  return loan.totalRepayment - loan.totalPaid;
}

export function toBorrowerLoanDto(loan: LoanDocument): BorrowerLoanDto {
  return {
    id: loan._id.toString(),
    principal: loan.principal,
    tenureDays: loan.tenureDays,
    annualInterestRate: loan.annualInterestRate,
    simpleInterest: loan.simpleInterest,
    totalRepayment: loan.totalRepayment,
    totalPaid: loan.totalPaid,
    outstanding: getOutstanding(loan),
    status: loan.status,
    rejectionReason: loan.rejectionReason ?? null,
    createdAt: loan.createdAt,
    disbursedAt: loan.disbursedAt ?? null,
    closedAt: loan.closedAt ?? null,
    statusHistory: loan.statusHistory.map((entry) => ({
      from: entry.from,
      to: entry.to,
      at: entry.at,
      byRole: entry.byRole,
      note: entry.note ?? null,
    })),
  };
}
