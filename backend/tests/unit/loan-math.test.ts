import { describe, expect, it } from 'vitest';
import { calculateLoanQuote } from '../../src/utils/loan-math.js';
import vectors from '../fixtures/loan-math-vectors.json' with { type: 'json' };

describe('calculateLoanQuote (shared vectors)', () => {
  it.each(vectors.cases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    expect(
      calculateLoanQuote({
        principal: vector.principal,
        tenureDays: vector.tenureDays,
        annualInterestRate: vectors.annualInterestRate,
      }),
    ).toEqual({ simpleInterest: vector.simpleInterest, totalRepayment: vector.totalRepayment });
  });

  it('always returns whole paise', () => {
    for (let tenureDays = 30; tenureDays <= 365; tenureDays += 7) {
      const { simpleInterest } = calculateLoanQuote({
        principal: 12_345_600,
        tenureDays,
        annualInterestRate: 12,
      });
      expect(Number.isInteger(simpleInterest)).toBe(true);
    }
  });
});
