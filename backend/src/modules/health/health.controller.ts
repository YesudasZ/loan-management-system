import type { Request, Response } from 'express';
import { isDatabaseReachable } from '../../config/db.js';
import { AppError } from '../../utils/app-error.js';
import { sendSuccess } from '../../utils/respond.js';

/** Render's health check: 200 only when the database answers, so a broken instance is restarted. */
export async function getHealth(_req: Request, res: Response) {
  if (!(await isDatabaseReachable())) {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database unavailable');
  }
  sendSuccess(res, 200, { status: 'ok', database: 'connected' });
}
