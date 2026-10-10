import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { uploadSingleFile } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { loanIdParamsSchema } from '../../utils/schemas.js';
import * as uploadsController from './uploads.controller.js';

export const uploadsRouter = Router();

// The file is parsed only after authentication and the role check, so anonymous callers
// can't make the server buffer 5 MB.
uploadsRouter.post(
  '/borrower/salary-slip',
  authenticate,
  requireRole('BORROWER'),
  uploadSingleFile('file'),
  uploadsController.uploadSalarySlip,
);
uploadsRouter.get(
  '/borrower/salary-slip',
  authenticate,
  requireRole('BORROWER'),
  uploadsController.downloadOwnSalarySlip,
);

// Salary slip viewer in the Sanction module.
uploadsRouter.get(
  '/loans/:loanId/salary-slip',
  authenticate,
  requireRole('SANCTION', 'ADMIN'),
  validate({ params: loanIdParamsSchema }),
  uploadsController.downloadLoanSalarySlip,
);
