import type { EmploymentMode } from '../../config/constants.js';
import type {
  BorrowerProfileDocument,
  StoredBreResult,
  StoredSalarySlip,
} from '../../models/borrower-profile.model.js';
import type { BreInput } from '../../utils/bre.js';
import { utcMidnightToCalendarDate, type CalendarDate } from '../../utils/dates.js';

/** Salary slip details safe to show; the GridFS id never leaves the server. */
export interface SalarySlipDto {
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

/** The borrower's own profile (they see their full PAN; staff only ever see it masked). */
export interface BorrowerProfileDto {
  fullName: string;
  pan: string;
  dateOfBirth: CalendarDate;
  monthlySalary: number;
  employmentMode: EmploymentMode;
  breResult: StoredBreResult;
  salarySlip: SalarySlipDto | null;
  updatedAt: Date;
}

export function toSalarySlipDto(slip: StoredSalarySlip): SalarySlipDto {
  return { contentType: slip.contentType, sizeBytes: slip.sizeBytes, uploadedAt: slip.uploadedAt };
}

export function toBorrowerProfileDto(profile: BorrowerProfileDocument): BorrowerProfileDto {
  return {
    fullName: profile.fullName,
    pan: profile.pan,
    dateOfBirth: utcMidnightToCalendarDate(profile.dateOfBirth),
    monthlySalary: profile.monthlySalary,
    employmentMode: profile.employmentMode,
    breResult: {
      isEligible: profile.breResult.isEligible,
      failures: profile.breResult.failures.map(({ rule, message }) => ({ rule, message })),
      checkedAt: profile.breResult.checkedAt,
    },
    salarySlip: profile.salarySlip ? toSalarySlipDto(profile.salarySlip) : null,
    updatedAt: profile.updatedAt,
  };
}

/** The BRE input for a stored profile (used when the rules are re-checked later). */
export function toBreInput(profile: BorrowerProfileDocument): BreInput {
  return {
    dateOfBirth: utcMidnightToCalendarDate(profile.dateOfBirth),
    monthlySalary: profile.monthlySalary,
    pan: profile.pan,
    employmentMode: profile.employmentMode,
  };
}
