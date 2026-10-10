import type { Role } from '../config/constants.js';
import { AppError } from './app-error.js';

export const LOAN_STATUSES = ['APPLIED', 'SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED'] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** A borrower may have at most one loan in these statuses. */
export const ACTIVE_LOAN_STATUSES: readonly LoanStatus[] = ['APPLIED', 'SANCTIONED', 'DISBURSED'];

export type LoanAction = 'APPROVE' | 'REJECT' | 'DISBURSE' | 'AUTO_CLOSE';

interface Transition {
  from: LoanStatus;
  to: LoanStatus;
  /** Roles that may trigger it. AUTO_CLOSE has none: only the payment transaction triggers it. */
  allowedRoles: readonly Role[];
}

/**
 * The single source of truth for loan status changes (APPLY creates a loan as APPLIED):
 *
 *   APPLIED    --APPROVE (SANCTION/ADMIN)-->        SANCTIONED
 *   APPLIED    --REJECT + reason (SANCTION/ADMIN)--> REJECTED
 *   SANCTIONED --DISBURSE (DISBURSEMENT/ADMIN)-->    DISBURSED
 *   DISBURSED  --AUTO_CLOSE (totalPaid = total)-->  CLOSED
 *
 * Routes use `allowedRoles` for requireRole, so roles live in one place.
 */
export const LOAN_ACTIONS: Readonly<Record<LoanAction, Transition>> = {
  APPROVE: { from: 'APPLIED', to: 'SANCTIONED', allowedRoles: ['SANCTION', 'ADMIN'] },
  REJECT: { from: 'APPLIED', to: 'REJECTED', allowedRoles: ['SANCTION', 'ADMIN'] },
  DISBURSE: { from: 'SANCTIONED', to: 'DISBURSED', allowedRoles: ['DISBURSEMENT', 'ADMIN'] },
  AUTO_CLOSE: { from: 'DISBURSED', to: 'CLOSED', allowedRoles: [] },
};

/** Returns the status after `action`, or throws 409 INVALID_STATUS_TRANSITION. */
export function getNextStatus(current: LoanStatus, action: LoanAction): LoanStatus {
  const transition = LOAN_ACTIONS[action];
  if (current !== transition.from) {
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot ${action.toLowerCase().replace('_', '-')} a loan that is ${current}`,
    );
  }
  return transition.to;
}

export function isActiveLoanStatus(status: LoanStatus): boolean {
  return ACTIVE_LOAN_STATUSES.includes(status);
}

/**
 * The loan status each executive module works on. Executives only see (read) loans in this
 * status; ADMIN sees every status. SALES works with users who have no loan, so it has none.
 */
export const MODULE_OWNED_STATUS: Readonly<Partial<Record<Role, LoanStatus>>> = {
  SANCTION: 'APPLIED',
  DISBURSEMENT: 'SANCTIONED',
  COLLECTION: 'DISBURSED',
};

/** Whether this role may read a loan in this status (404 otherwise, as if it didn't exist). */
export function canViewLoanInStatus(role: Role, status: LoanStatus): boolean {
  return role === 'ADMIN' || MODULE_OWNED_STATUS[role] === status;
}
