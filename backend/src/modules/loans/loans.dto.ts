import type { EmploymentMode, Role } from '../../config/constants.js';
import type { LoanDocument } from '../../models/loan.model.js';
import { utcMidnightToCalendarDate, type CalendarDate } from '../../utils/dates.js';
import type { LoanStatus } from '../../utils/loan-state-machine.js';
import { maskPan } from '../../utils/pan.js';
import { toSalarySlipDto, type SalarySlipDto } from '../borrower/borrower.dto.js';

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

/** Name/email/role of the people a loan refers to, looked up once per request. */
export interface PersonSummary {
  name: string;
  email: string;
  role: Role;
}
export type PeopleById = ReadonlyMap<string, PersonSummary>;

const UNKNOWN_PERSON: PersonSummary = { name: 'Unknown user', email: '', role: 'BORROWER' };

function personFor(people: PeopleById, id: { toString(): string }): PersonSummary {
  return people.get(id.toString()) ?? UNKNOWN_PERSON;
}

/** One row of a staff work queue. The PAN is always masked for staff. */
export interface LoanSummaryDto {
  id: string;
  borrower: { name: string; email: string };
  applicant: { fullName: string; panMasked: string };
  principal: number;
  tenureDays: number;
  totalRepayment: number;
  totalPaid: number;
  outstanding: number;
  status: LoanStatus;
  createdAt: Date;
  disbursedAt: Date | null;
}

export function toLoanSummaryDto(loan: LoanDocument, people: PeopleById): LoanSummaryDto {
  const borrower = personFor(people, loan.borrowerId);
  return {
    id: loan._id.toString(),
    borrower: { name: borrower.name, email: borrower.email },
    applicant: { fullName: loan.applicant.fullName, panMasked: maskPan(loan.applicant.pan) },
    principal: loan.principal,
    tenureDays: loan.tenureDays,
    totalRepayment: loan.totalRepayment,
    totalPaid: loan.totalPaid,
    outstanding: getOutstanding(loan),
    status: loan.status,
    createdAt: loan.createdAt,
    disbursedAt: loan.disbursedAt ?? null,
  };
}

/** Everything a staff member needs to review or service one loan. */
export interface LoanDetailDto extends LoanSummaryDto {
  applicant: LoanSummaryDto['applicant'] & {
    dateOfBirth: CalendarDate;
    monthlySalary: number;
    employmentMode: EmploymentMode;
    breResult: {
      isEligible: boolean;
      failures: { rule: string; message: string }[];
      checkedAt: Date;
    };
  };
  salarySlip: SalarySlipDto;
  annualInterestRate: number;
  simpleInterest: number;
  rejectionReason: string | null;
  closedAt: Date | null;
  statusHistory: {
    from: LoanStatus | null;
    to: LoanStatus;
    at: Date;
    note: string | null;
    by: { name: string; role: Role };
  }[];
}

export function toLoanDetailDto(loan: LoanDocument, people: PeopleById): LoanDetailDto {
  const summary = toLoanSummaryDto(loan, people);
  const { applicant } = loan;
  return {
    ...summary,
    applicant: {
      ...summary.applicant,
      dateOfBirth: utcMidnightToCalendarDate(applicant.dateOfBirth),
      monthlySalary: applicant.monthlySalary,
      employmentMode: applicant.employmentMode,
      breResult: {
        isEligible: applicant.breResult.isEligible,
        failures: applicant.breResult.failures.map(({ rule, message }) => ({ rule, message })),
        checkedAt: applicant.breResult.checkedAt,
      },
    },
    salarySlip: toSalarySlipDto(loan.salarySlip),
    annualInterestRate: loan.annualInterestRate,
    simpleInterest: loan.simpleInterest,
    rejectionReason: loan.rejectionReason ?? null,
    closedAt: loan.closedAt ?? null,
    statusHistory: loan.statusHistory.map((entry) => {
      const actor = personFor(people, entry.by);
      return {
        from: entry.from,
        to: entry.to,
        at: entry.at,
        note: entry.note ?? null,
        by: { name: actor.name, role: entry.byRole },
      };
    }),
  };
}
