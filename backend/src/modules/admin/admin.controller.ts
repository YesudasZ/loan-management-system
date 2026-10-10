import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { sendSuccess } from '../../utils/respond.js';
import {
  listUsersQuerySchema,
  type ChangeRoleBody,
  type CreateStaffBody,
  type UserIdParams,
} from './admin.schema.js';
import * as adminService from './admin.service.js';

// The query string is parsed here rather than in validate() (see loans.controller.ts).
export async function listUsers(req: Request, res: Response) {
  const query = listUsersQuerySchema.parse(req.query);
  sendSuccess(res, 200, await adminService.listUsers(query));
}

export async function createStaffUser(
  req: Request<object, unknown, CreateStaffBody>,
  res: Response,
) {
  const user = await adminService.createStaffUser(getAuthUser(req), req.body);
  sendSuccess(res, 201, { user });
}

export async function changeRole(
  req: Request<UserIdParams, unknown, ChangeRoleBody>,
  res: Response,
) {
  const user = await adminService.changeUserRole(
    getAuthUser(req),
    req.params.userId,
    req.body.role,
  );
  sendSuccess(res, 200, { user });
}
