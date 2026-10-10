import { describe, expect, it } from 'vitest';
import { ELIGIBILITY_RULE_LABELS, ELIGIBILITY_SUMMARY, LOAN_TERMS } from './loan-terms';

// Pins the text to the assignment's rules, so a change to a constant shows up here.
describe('loan terms text', () => {
  it('describes the loan limits and interest', () => {
    expect(LOAN_TERMS).toEqual({
      amountRange: '₹50,000–₹5,00,000',
      tenureRange: '30–365 days',
      interest: '12% p.a. simple interest',
    });
  });

  it('describes every eligibility rule', () => {
    expect(ELIGIBILITY_RULE_LABELS).toEqual({
      AGE: 'Age 23–50',
      SALARY: 'Monthly salary of at least ₹25,000',
      PAN: 'A valid PAN',
      EMPLOYMENT: 'Salaried or self-employed',
    });
    expect(ELIGIBILITY_SUMMARY).toBe(
      'age 23–50, a monthly salary of at least ₹25,000, a valid PAN, and salaried or self-employed',
    );
  });
});
