import type { BreRule } from './bre';
import {
  ANNUAL_INTEREST_RATE_PERCENT,
  BRE_MAX_AGE,
  BRE_MIN_AGE,
  BRE_MIN_MONTHLY_SALARY_PAISE,
  MAX_PRINCIPAL_RUPEES,
  MAX_TENURE_DAYS,
  MIN_PRINCIPAL_RUPEES,
  MIN_TENURE_DAYS,
  PAISE_PER_RUPEE,
} from './constants';
import { formatInr } from './format';

// Display text for the loan terms and the eligibility rules, built from the constants so the
// login page, the wizard and the dashboards can never show different numbers.

export const LOAN_TERMS = {
  amountRange: `${formatInr(MIN_PRINCIPAL_RUPEES * PAISE_PER_RUPEE)}–${formatInr(MAX_PRINCIPAL_RUPEES * PAISE_PER_RUPEE)}`,
  tenureRange: `${MIN_TENURE_DAYS}–${MAX_TENURE_DAYS} days`,
  interest: `${ANNUAL_INTEREST_RATE_PERCENT}% p.a. simple interest`,
} as const;

export const ELIGIBILITY_RULE_LABELS: Record<BreRule, string> = {
  AGE: `Age ${BRE_MIN_AGE}–${BRE_MAX_AGE}`,
  SALARY: `Monthly salary of at least ${formatInr(BRE_MIN_MONTHLY_SALARY_PAISE)}`,
  PAN: 'A valid PAN',
  EMPLOYMENT: 'Salaried or self-employed',
};

/** The rules in one sentence, for page descriptions. */
export const ELIGIBILITY_SUMMARY = `age ${BRE_MIN_AGE}–${BRE_MAX_AGE}, a monthly salary of at least ${formatInr(BRE_MIN_MONTHLY_SALARY_PAISE)}, a valid PAN, and salaried or self-employed`;
