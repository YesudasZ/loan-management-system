import { describe, expect, it } from 'vitest';
import type { EmploymentMode } from '../../src/config/constants.js';
import { calculateAgeInYears, evaluateEligibility, type BreRule } from '../../src/utils/bre.js';
import vectors from '../fixtures/bre-vectors.json' with { type: 'json' };

interface BreVector {
  name: string;
  today: string;
  input: { dateOfBirth: string; monthlySalary: number; pan: string; employmentMode: string };
  failedRules: string[];
}

const cases = vectors.cases as BreVector[];

describe('evaluateEligibility (shared vectors)', () => {
  it.each(cases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const result = evaluateEligibility(
      { ...vector.input, employmentMode: vector.input.employmentMode as EmploymentMode },
      vector.today,
    );

    expect(result.failures.map((failure) => failure.rule)).toEqual(vector.failedRules as BreRule[]);
    expect(result.isEligible).toBe(vector.failedRules.length === 0);
  });
});

describe('evaluateEligibility messages', () => {
  it('explains each failure in plain words', () => {
    const result = evaluateEligibility(
      { dateOfBirth: '2010-01-01', monthlySalary: 0, pan: 'x', employmentMode: 'UNEMPLOYED' },
      '2026-10-10',
    );

    expect(result.failures).toEqual([
      { rule: 'AGE', message: 'You must be at least 23 years old (you are 16).' },
      { rule: 'SALARY', message: 'Monthly salary must be at least ₹25,000.' },
      { rule: 'PAN', message: 'PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter).' },
      { rule: 'EMPLOYMENT', message: 'Applicants who are unemployed are not eligible.' },
    ]);
  });

  it('gives the upper age limit for applicants over 50', () => {
    const result = evaluateEligibility(
      {
        dateOfBirth: '1970-01-01',
        monthlySalary: 5_000_000,
        pan: 'ABCDE1234F',
        employmentMode: 'SALARIED',
      },
      '2026-10-10',
    );
    expect(result.failures).toEqual([
      { rule: 'AGE', message: 'You must be 50 or younger (you are 56).' },
    ]);
  });
});

describe('calculateAgeInYears', () => {
  it('subtracts a year until the birthday has happened', () => {
    expect(calculateAgeInYears('2000-12-31', '2026-12-30')).toBe(25);
    expect(calculateAgeInYears('2000-12-31', '2026-12-31')).toBe(26);
  });

  it('does not depend on the machine time zone (tests run in America/New_York)', () => {
    expect(calculateAgeInYears('2000-01-01', '2026-01-01')).toBe(26);
  });
});
