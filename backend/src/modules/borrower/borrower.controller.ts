import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { sendSuccess } from '../../utils/respond.js';
import type { ProfileBody } from './borrower.schema.js';
import * as borrowerService from './borrower.service.js';

export async function getProgress(req: Request, res: Response) {
  sendSuccess(res, 200, await borrowerService.getProgress(getAuthUser(req).id));
}

export async function saveProfile(req: Request<object, unknown, ProfileBody>, res: Response) {
  const profile = await borrowerService.saveProfile(getAuthUser(req).id, req.body);
  sendSuccess(res, 200, { profile });
}
