import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/utils/app-error.js';
import {
  getNextStatus,
  isActiveLoanStatus,
  LOAN_ACTIONS,
  LOAN_STATUSES,
  type LoanAction,
  type LoanStatus,
} from '../../src/utils/loan-state-machine.js';

const VALID_TRANSITIONS: Record<LoanAction, [LoanStatus, LoanStatus]> = {
  APPROVE: ['APPLIED', 'SANCTIONED'],
  REJECT: ['APPLIED', 'REJECTED'],
  DISBURSE: ['SANCTIONED', 'DISBURSED'],
  AUTO_CLOSE: ['DISBURSED', 'CLOSED'],
};

describe('getNextStatus', () => {
  const actions = Object.keys(VALID_TRANSITIONS) as LoanAction[];

  for (const action of actions) {
    const [validFrom, expectedTo] = VALID_TRANSITIONS[action];

    it(`${action}: ${validFrom} → ${expectedTo}`, () => {
      expect(getNextStatus(validFrom, action)).toBe(expectedTo);
    });

    for (const status of LOAN_STATUSES.filter((candidate) => candidate !== validFrom)) {
      it(`${action} from ${status} is rejected with 409`, () => {
        expect.assertions(3);
        try {
          getNextStatus(status, action);
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          expect((error as AppError).statusCode).toBe(409);
          expect((error as AppError).code).toBe('INVALID_STATUS_TRANSITION');
        }
      });
    }
  }
});

describe('LOAN_ACTIONS roles', () => {
  it('lets only SANCTION and ADMIN approve or reject', () => {
    expect(LOAN_ACTIONS.APPROVE.allowedRoles).toEqual(['SANCTION', 'ADMIN']);
    expect(LOAN_ACTIONS.REJECT.allowedRoles).toEqual(['SANCTION', 'ADMIN']);
  });

  it('lets only DISBURSEMENT and ADMIN disburse', () => {
    expect(LOAN_ACTIONS.DISBURSE.allowedRoles).toEqual(['DISBURSEMENT', 'ADMIN']);
  });

  it('lets no role close a loan by hand', () => {
    expect(LOAN_ACTIONS.AUTO_CLOSE.allowedRoles).toEqual([]);
  });
});

describe('isActiveLoanStatus', () => {
  it('treats APPLIED, SANCTIONED and DISBURSED as active', () => {
    expect(LOAN_STATUSES.filter(isActiveLoanStatus)).toEqual([
      'APPLIED',
      'SANCTIONED',
      'DISBURSED',
    ]);
  });
});
