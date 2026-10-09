import { z } from 'zod';
import type { ApiError } from './api-client';
import {
  BRE_MAX_AGE,
  BRE_MIN_AGE,
  BRE_MIN_MONTHLY_SALARY_PAISE,
  PAN_REGEX,
  type EmploymentMode,
} from './constants';
import { toDateParts, type CalendarDate } from './dates';
import { formatInr } from './format';

// Mirror of backend/src/utils/bre.ts, for instant feedback while typing. It is never trusted:
// the server runs the same rules on submit and again when the loan is applied for.

export type BreRule = 'AGE' | 'SALARY' | 'PAN' | 'EMPLOYMENT';

export interface BreFailure {
  rule: BreRule;
  message: string;
}

export interface BreResult {
  isEligible: boolean;
  failures: BreFailure[];
}

export interface BreInput {
  dateOfBirth: CalendarDate;
  monthlySalary: number; // paise
  pan: string;
  employmentMode: EmploymentMode;
}

/** Completed years; one less if this year's birthday hasn't happened yet. */
export function calculateAgeInYears(dateOfBirth: CalendarDate, today: CalendarDate): number {
  const birth = toDateParts(dateOfBirth);
  const now = toDateParts(today);
  const hasHadBirthdayThisYear =
    now.month > birth.month || (now.month === birth.month && now.day >= birth.day);
  return now.year - birth.year - (hasHadBirthdayThisYear ? 0 : 1);
}

function checkAge(dateOfBirth: CalendarDate, today: CalendarDate): BreFailure | null {
  const age = calculateAgeInYears(dateOfBirth, today);
  if (age < BRE_MIN_AGE) {
    return {
      rule: 'AGE',
      message: `You must be at least ${BRE_MIN_AGE} years old (you are ${age}).`,
    };
  }
  if (age > BRE_MAX_AGE) {
    return { rule: 'AGE', message: `You must be ${BRE_MAX_AGE} or younger (you are ${age}).` };
  }
  return null;
}

export function evaluateEligibility(input: BreInput, today: CalendarDate): BreResult {
  const failures: (BreFailure | null)[] = [
    checkAge(input.dateOfBirth, today),
    input.monthlySalary < BRE_MIN_MONTHLY_SALARY_PAISE
      ? {
          rule: 'SALARY',
          message: `Monthly salary must be at least ${formatInr(BRE_MIN_MONTHLY_SALARY_PAISE)}.`,
        }
      : null,
    PAN_REGEX.test(input.pan.trim().toUpperCase())
      ? null
      : { rule: 'PAN', message: 'PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter).' },
    input.employmentMode === 'UNEMPLOYED'
      ? { rule: 'EMPLOYMENT', message: 'Applicants who are unemployed are not eligible.' }
      : null,
  ];
  const found = failures.filter((failure): failure is BreFailure => failure !== null);
  return { isEligible: found.length === 0, failures: found };
}

const breFailuresSchema = z.object({
  failures: z.array(
    z.object({ rule: z.enum(['AGE', 'SALARY', 'PAN', 'EMPLOYMENT']), message: z.string() }),
  ),
});

/** The failure list from a 422 BRE_FAILED response, or [] for any other error. */
export function getBreFailures(error: ApiError): BreFailure[] {
  if (error.code !== 'BRE_FAILED') return [];
  const parsed = breFailuresSchema.safeParse(error.details);
  return parsed.success ? parsed.data.failures : [];
}
