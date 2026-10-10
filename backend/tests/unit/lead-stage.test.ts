import { describe, expect, it } from 'vitest';
import { resolveLeadStage } from '../../src/utils/lead-stage.js';

describe('resolveLeadStage', () => {
  it.each([
    [{ hasProfile: false, isEligible: false, hasSalarySlip: false }, 'PROFILE_PENDING'],
    [{ hasProfile: true, isEligible: false, hasSalarySlip: false }, 'BRE_FAILED'],
    [{ hasProfile: true, isEligible: false, hasSalarySlip: true }, 'BRE_FAILED'],
    [{ hasProfile: true, isEligible: true, hasSalarySlip: false }, 'SALARY_SLIP_PENDING'],
    [{ hasProfile: true, isEligible: true, hasSalarySlip: true }, 'READY_TO_APPLY'],
  ] as const)('%o → %s', (state, stage) => {
    expect(resolveLeadStage(state)).toBe(stage);
  });
});
