import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { validate } from '../../middleware/validate.js';
import * as loansController from './loans.controller.js';
import { applyBodySchema } from './loans.schema.js';

export const loansRouter = Router();

// Borrower self-service: no ids in the path, always the logged-in borrower (IDOR-safe).
loansRouter.post(
  '/borrower/loans',
  authenticate,
  requireRole('BORROWER'),
  validate({ body: applyBodySchema }),
  loansController.apply,
);
