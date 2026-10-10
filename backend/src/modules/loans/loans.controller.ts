import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { sendSuccess } from '../../utils/respond.js';
import { paginationQuerySchema, type LoanIdParams } from '../../utils/schemas.js';
import * as operations from './loan-operations.service.js';
import {
  listLoansQuerySchema,
  type ApplyBody,
  type ApproveBody,
  type RejectBody,
} from './loans.schema.js';
import * as loansService from './loans.service.js';

export async function apply(req: Request<object, unknown, ApplyBody>, res: Response) {
  const loan = await loansService.applyForLoan(getAuthUser(req), req.body);
  sendSuccess(res, 201, { loan });
}

// Query strings are parsed here rather than in validate(): Express's types don't allow a
// narrowed req.query type on a route. Unknown or invalid parameters still give a 400.
export async function listMyLoans(req: Request, res: Response) {
  const query = paginationQuerySchema.parse(req.query);
  sendSuccess(res, 200, await loansService.listBorrowerLoans(getAuthUser(req).id, query));
}

export async function getMyLoan(req: Request<LoanIdParams>, res: Response) {
  const loan = await loansService.getBorrowerLoan(getAuthUser(req).id, req.params.loanId);
  sendSuccess(res, 200, { loan });
}

export async function listLoans(req: Request, res: Response) {
  const query = listLoansQuerySchema.parse(req.query);
  sendSuccess(res, 200, await operations.listLoans(getAuthUser(req), query));
}

export async function getLoan(req: Request<LoanIdParams>, res: Response) {
  const loan = await operations.getLoanDetail(getAuthUser(req), req.params.loanId);
  sendSuccess(res, 200, { loan });
}

export async function approve(req: Request<LoanIdParams, unknown, ApproveBody>, res: Response) {
  const loan = await operations.approveLoan(getAuthUser(req), req.params.loanId, req.body.note);
  sendSuccess(res, 200, { loan });
}

export async function reject(req: Request<LoanIdParams, unknown, RejectBody>, res: Response) {
  const loan = await operations.rejectLoan(getAuthUser(req), req.params.loanId, req.body.reason);
  sendSuccess(res, 200, { loan });
}

export async function disburse(req: Request<LoanIdParams>, res: Response) {
  const loan = await operations.disburseLoan(getAuthUser(req), req.params.loanId);
  sendSuccess(res, 200, { loan });
}
