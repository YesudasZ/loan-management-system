import { Router } from 'express';
import type { Role } from '../../config/constants.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { emptyBodySchema, validate } from '../../middleware/validate.js';
import { LOAN_ACTIONS } from '../../utils/loan-state-machine.js';
import { loanIdParamsSchema } from '../../utils/schemas.js';
import * as loansController from './loans.controller.js';
import { applyBodySchema, approveBodySchema, rejectBodySchema } from './loans.schema.js';

// Staff who work on loans. Reads are further scoped to each module's status in the service.
const LOAN_READ_ROLES: Role[] = ['SANCTION', 'DISBURSEMENT', 'COLLECTION', 'ADMIN'];

export const loansRouter = Router();

// Borrower self-service: no ids in the path, always the logged-in borrower (IDOR-safe).
loansRouter.post(
  '/borrower/loans',
  authenticate,
  requireRole('BORROWER'),
  validate({ body: applyBodySchema }),
  loansController.apply,
);
loansRouter.get(
  '/borrower/loans',
  authenticate,
  requireRole('BORROWER'),
  loansController.listMyLoans, // parses its own query string (see the controller)
);
// The id is only looked up among the logged-in borrower's own loans (404 otherwise).
loansRouter.get(
  '/borrower/loans/:loanId',
  authenticate,
  requireRole('BORROWER'),
  validate({ params: loanIdParamsSchema }),
  loansController.getMyLoan,
);

// Operations dashboard. Action roles come from the state machine, the single source of truth.
loansRouter.get(
  '/loans',
  authenticate,
  requireRole(...LOAN_READ_ROLES),
  loansController.listLoans, // parses its own query string (see the controller)
);
loansRouter.get(
  '/loans/:loanId',
  authenticate,
  requireRole(...LOAN_READ_ROLES),
  validate({ params: loanIdParamsSchema }),
  loansController.getLoan,
);
loansRouter.post(
  '/loans/:loanId/approve',
  authenticate,
  requireRole(...LOAN_ACTIONS.APPROVE.allowedRoles),
  validate({ params: loanIdParamsSchema, body: approveBodySchema }),
  loansController.approve,
);
loansRouter.post(
  '/loans/:loanId/reject',
  authenticate,
  requireRole(...LOAN_ACTIONS.REJECT.allowedRoles),
  validate({ params: loanIdParamsSchema, body: rejectBodySchema }),
  loansController.reject,
);
loansRouter.post(
  '/loans/:loanId/disburse',
  authenticate,
  requireRole(...LOAN_ACTIONS.DISBURSE.allowedRoles),
  validate({ params: loanIdParamsSchema, body: emptyBodySchema }),
  loansController.disburse,
);
