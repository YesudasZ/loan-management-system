export type LeadStage = 'PROFILE_PENDING' | 'BRE_FAILED' | 'SALARY_SLIP_PENDING' | 'READY_TO_APPLY';

export interface LeadState {
  hasProfile: boolean;
  isEligible: boolean; // BRE re-evaluated with today's date
  hasSalarySlip: boolean;
}

/**
 * How far a registered borrower without a loan has got (the Sales module's lead tracking).
 * Mirrors the wizard order: personal details → eligibility → salary slip → apply.
 */
export function resolveLeadStage(state: LeadState): LeadStage {
  if (!state.hasProfile) return 'PROFILE_PENDING';
  if (!state.isEligible) return 'BRE_FAILED';
  if (!state.hasSalarySlip) return 'SALARY_SLIP_PENDING';
  return 'READY_TO_APPLY';
}
