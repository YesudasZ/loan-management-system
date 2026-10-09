import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { clearAuthCookie, setAuthCookie } from '../../utils/auth-cookie.js';
import { sendSuccess } from '../../utils/respond.js';
import type { LoginBody, SignupBody } from './auth.schema.js';
import * as authService from './auth.service.js';

export async function signup(req: Request<object, unknown, SignupBody>, res: Response) {
  const { user, token } = await authService.signup(req.body);
  setAuthCookie(res, token);
  sendSuccess(res, 201, { user });
}

export async function login(req: Request<object, unknown, LoginBody>, res: Response) {
  const { user, token } = await authService.login(req.body);
  setAuthCookie(res, token);
  sendSuccess(res, 200, { user });
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  sendSuccess(res, 200, null);
}

export function getCurrentUser(req: Request, res: Response) {
  sendSuccess(res, 200, { user: getAuthUser(req) });
}
