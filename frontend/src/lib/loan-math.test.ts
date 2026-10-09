import { describe, expect, it } from 'vitest';
// The same vectors the backend tests use, so the live panel matches what the server charges.
import vectors from '../../../backend/tests/fixtures/loan-math-vectors.json';
import { calculateLoanQuote } from './loan-math';

describe('calculateLoanQuote mirror (shared backend vectors)', () => {
  it.each(vectors.cases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    expect(
      calculateLoanQuote({
        principal: vector.principal,
        tenureDays: vector.tenureDays,
        annualInterestRate: vectors.annualInterestRate,
      }),
    ).toEqual({ simpleInterest: vector.simpleInterest, totalRepayment: vector.totalRepayment });
  });
});
