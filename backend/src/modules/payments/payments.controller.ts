import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { sendSuccess } from '../../utils/respond.js';
import type { LoanIdParams } from '../../utils/schemas.js';
import { listPaymentsQuerySchema, type RecordPaymentBody } from './payments.schema.js';
import * as paymentsService from './payments.service.js';

export async function recordPayment(
  req: Request<LoanIdParams, unknown, RecordPaymentBody>,
  res: Response,
) {
  const result = await paymentsService.recordPayment(getAuthUser(req), req.params.loanId, req.body);
  sendSuccess(res, 201, result);
}

// The query string is parsed here (see loans.controller.ts for why).
export async function listPayments(req: Request<LoanIdParams>, res: Response) {
  const query = listPaymentsQuerySchema.parse(req.query);
  sendSuccess(
    res,
    200,
    await paymentsService.listPayments(getAuthUser(req), req.params.loanId, query),
  );
}
