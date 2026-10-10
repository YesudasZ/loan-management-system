import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import * as dashboardController from './dashboard.controller.js';

export const dashboardRouter = Router();

// Sales module: registered borrowers who haven't applied yet.
dashboardRouter.get(
  '/leads',
  authenticate,
  requireRole('SALES', 'ADMIN'),
  dashboardController.listLeads,
);

// Admin overview: counts per loan status.
dashboardRouter.get(
  '/dashboard/summary',
  authenticate,
  requireRole('ADMIN'),
  dashboardController.getSummary,
);
