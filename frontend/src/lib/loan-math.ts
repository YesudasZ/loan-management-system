import { DAYS_IN_YEAR } from './constants';

const PERCENT = 100;

export interface LoanQuote {
  simpleInterest: number; // paise
  totalRepayment: number; // paise
}

/**
 * Mirror of backend/src/utils/loan-math.ts for the live calculation panel:
 * SI = round((P × R × T) / (365 × 100)) in paise; total = P + SI. The server recalculates.
 */
export function calculateLoanQuote(input: {
  principal: number;
  tenureDays: number;
  annualInterestRate: number;
}): LoanQuote {
  const simpleInterest = Math.round(
    (input.principal * input.annualInterestRate * input.tenureDays) / (DAYS_IN_YEAR * PERCENT),
  );
  return { simpleInterest, totalRepayment: input.principal + simpleInterest };
}
