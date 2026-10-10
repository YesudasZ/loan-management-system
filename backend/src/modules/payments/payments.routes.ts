import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { validate } from '../../middleware/validate.js';
import { PAYMENT_RECORDER_ROLES } from '../../utils/payment-rules.js';
import { loanIdParamsSchema } from '../../utils/schemas.js';
import * as paymentsController from './payments.controller.js';
import { recordPaymentBodySchema } from './payments.schema.js';

export const paymentsRouter = Router();

paymentsRouter.get(
  '/loans/:loanId/payments',
  authenticate,
  requireRole(...PAYMENT_RECORDER_ROLES),
  validate({ params: loanIdParamsSchema }),
  paymentsController.listPayments,
);
paymentsRouter.post(
  '/loans/:loanId/payments',
  authenticate,
  requireRole(...PAYMENT_RECORDER_ROLES),
  validate({ params: loanIdParamsSchema, body: recordPaymentBodySchema }),
  paymentsController.recordPayment,
);
