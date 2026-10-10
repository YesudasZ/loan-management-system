import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/respond.js';
import { paginationQuerySchema } from '../../utils/schemas.js';
import * as dashboardService from './dashboard.service.js';

// The query string is parsed here (see loans.controller.ts for why).
export async function listLeads(req: Request, res: Response) {
  const query = paginationQuerySchema.parse(req.query);
  sendSuccess(res, 200, await dashboardService.listLeads(query));
}

export async function getSummary(_req: Request, res: Response) {
  sendSuccess(res, 200, await dashboardService.getSummary());
}
