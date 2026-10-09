import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { sendSuccess } from '../../utils/respond.js';
import type { ApplyBody } from './loans.schema.js';
import * as loansService from './loans.service.js';

export async function apply(req: Request<object, unknown, ApplyBody>, res: Response) {
  const loan = await loansService.applyForLoan(getAuthUser(req), req.body);
  sendSuccess(res, 201, { loan });
}
