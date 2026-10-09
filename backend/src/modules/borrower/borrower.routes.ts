import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { validate } from '../../middleware/validate.js';
import * as borrowerController from './borrower.controller.js';
import { profileBodySchema } from './borrower.schema.js';

// Borrower self-service: no ids in the path, always the logged-in borrower (IDOR-safe).
// ADMIN is deliberately not allowed here (admins don't apply for loans).
export const borrowerRouter = Router();

borrowerRouter.get(
  '/borrower/progress',
  authenticate,
  requireRole('BORROWER'),
  borrowerController.getProgress,
);
borrowerRouter.put(
  '/borrower/profile',
  authenticate,
  requireRole('BORROWER'),
  validate({ body: profileBodySchema }),
  borrowerController.saveProfile,
);
