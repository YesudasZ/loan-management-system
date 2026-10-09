import { DAYS_IN_YEAR } from '../config/constants.js';

const PERCENT = 100;

export interface LoanQuoteInput {
  principal: number; // paise
  tenureDays: number;
  annualInterestRate: number; // percent per year, e.g. 12
}

export interface LoanQuote {
  simpleInterest: number; // paise
  totalRepayment: number; // paise
}

/**
 * Simple interest: SI = round((P × R × T) / (365 × 100)), with P in paise and T in days, so the
 * result is in paise. Total repayment = P + SI. Inputs are positive, so Math.round rounds half
 * up. The largest intermediate value (5×10⁷ × 12 × 365 ≈ 2.2×10¹¹) is far below 2⁵³.
 * Mirrored in frontend/src/lib/loan-math.ts; the server always recalculates.
 */
export function calculateLoanQuote({
  principal,
  tenureDays,
  annualInterestRate,
}: LoanQuoteInput): LoanQuote {
  const simpleInterest = Math.round(
    (principal * annualInterestRate * tenureDays) / (DAYS_IN_YEAR * PERCENT),
  );
  return { simpleInterest, totalRepayment: principal + simpleInterest };
}
