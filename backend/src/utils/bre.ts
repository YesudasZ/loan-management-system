import {
  BRE_MAX_AGE,
  BRE_MIN_AGE,
  BRE_MIN_MONTHLY_SALARY_PAISE,
  PAISE_PER_RUPEE,
  PAN_REGEX,
  type EmploymentMode,
} from '../config/constants.js';
import { toDateParts, type CalendarDate } from './dates.js';

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

const minSalaryText = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(BRE_MIN_MONTHLY_SALARY_PAISE / PAISE_PER_RUPEE);

/**
 * Completed years between the date of birth and `today`: the year difference, minus one if
 * this year's birthday hasn't happened yet. A 29 February birthday counts as reached on
 * 1 March in non-leap years. A future date of birth gives a negative age.
 */
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

function checkSalary(monthlySalary: number): BreFailure | null {
  return monthlySalary < BRE_MIN_MONTHLY_SALARY_PAISE
    ? { rule: 'SALARY', message: `Monthly salary must be at least ${minSalaryText}.` }
    : null;
}

function checkPan(pan: string): BreFailure | null {
  return PAN_REGEX.test(pan.trim().toUpperCase())
    ? null
    : { rule: 'PAN', message: 'PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter).' };
}

function checkEmployment(employmentMode: EmploymentMode): BreFailure | null {
  return employmentMode === 'UNEMPLOYED'
    ? { rule: 'EMPLOYMENT', message: 'Applicants who are unemployed are not eligible.' }
    : null;
}

/**
 * The business rule engine. Evaluates EVERY rule and returns all failures (not just the first),
 * in a fixed order: AGE, SALARY, PAN, EMPLOYMENT. Pure: `today` is passed in.
 * The server is the source of truth; frontend/src/lib/bre.ts mirrors this for instant feedback.
 */
export function evaluateEligibility(input: BreInput, today: CalendarDate): BreResult {
  const failures = [
    checkAge(input.dateOfBirth, today),
    checkSalary(input.monthlySalary),
    checkPan(input.pan),
    checkEmployment(input.employmentMode),
  ].filter((failure): failure is BreFailure => failure !== null);

  return { isEligible: failures.length === 0, failures };
}
