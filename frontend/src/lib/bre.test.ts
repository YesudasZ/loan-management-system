import { describe, expect, it } from 'vitest';
// The same vectors the backend tests use, so the mirror provably matches the server.
import vectors from '../../../backend/tests/fixtures/bre-vectors.json';
import { evaluateEligibility } from './bre';
import type { EmploymentMode } from './constants';

describe('evaluateEligibility mirror (shared backend vectors)', () => {
  it.each(vectors.cases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const result = evaluateEligibility(
      { ...vector.input, employmentMode: vector.input.employmentMode as EmploymentMode },
      vector.today,
    );

    expect(result.failures.map((failure) => failure.rule)).toEqual(vector.failedRules);
    expect(result.isEligible).toBe(vector.failedRules.length === 0);
  });

  it('uses the same messages as the server', () => {
    const result = evaluateEligibility(
      { dateOfBirth: '2010-01-01', monthlySalary: 0, pan: 'x', employmentMode: 'UNEMPLOYED' },
      '2026-10-10',
    );

    expect(result.failures.map((failure) => failure.message)).toEqual([
      'You must be at least 23 years old (you are 16).',
      'Monthly salary must be at least ₹25,000.',
      'PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter).',
      'Applicants who are unemployed are not eligible.',
    ]);
  });
});
