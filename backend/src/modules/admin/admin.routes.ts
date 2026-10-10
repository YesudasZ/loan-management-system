import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { validate } from '../../middleware/validate.js';
import * as adminController from './admin.controller.js';
import { changeRoleBodySchema, createStaffBodySchema, userIdParamsSchema } from './admin.schema.js';

// Staff and role management: ADMIN only.
export const adminRouter = Router();

adminRouter.get(
  '/admin/users',
  authenticate,
  requireRole('ADMIN'),
  adminController.listUsers, // parses its own query string (see the controller)
);
adminRouter.post(
  '/admin/users',
  authenticate,
  requireRole('ADMIN'),
  validate({ body: createStaffBodySchema }),
  adminController.createStaffUser,
);
adminRouter.patch(
  '/admin/users/:userId/role',
  authenticate,
  requireRole('ADMIN'),
  validate({ params: userIdParamsSchema, body: changeRoleBodySchema }),
  adminController.changeRole,
);
