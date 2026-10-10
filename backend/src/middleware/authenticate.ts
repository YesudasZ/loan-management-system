import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME } from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { findAuthUserById } from '../modules/auth/auth.service.js';
import type { AuthUser } from '../modules/auth/auth.types.js';
import { AppError } from '../utils/app-error.js';
import { clearAuthCookie } from '../utils/auth-cookie.js';
import { verifyAuthToken } from '../utils/jwt.js';

const NOT_LOGGED_IN_MESSAGE = 'Please log in to continue';

/**
 * The user behind a session token, or null when the token is invalid, expired or tampered with,
 * or its user no longer exists. A database failure is NOT treated as "not logged in": it becomes a
 * 503, so a short outage doesn't log everyone out.
 */
async function findUserForToken(token: string): Promise<AuthUser | null> {
  let userId: string;
  try {
    userId = (await verifyAuthToken(token, env.JWT_SECRET)).userId;
  } catch {
    return null;
  }
  try {
    // The role is read from the database, not the token, so role changes and
    // deleted accounts take effect immediately.
    return await findAuthUserById(userId);
  } catch (error) {
    logger.warn({ err: error }, 'Could not load the session user');
    throw new AppError(
      503,
      'DATABASE_UNAVAILABLE',
      'The service is temporarily unavailable. Please try again in a moment.',
    );
  }
}

/** Requires a valid session cookie and puts the current user on `req.user`. Otherwise 401. */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies[AUTH_COOKIE_NAME];
  if (typeof token !== 'string' || token === '') {
    throw new AppError(401, 'UNAUTHENTICATED', NOT_LOGGED_IN_MESSAGE);
  }

  const user = await findUserForToken(token);
  if (!user) {
    // Drop the bad cookie so the browser doesn't keep sending it.
    clearAuthCookie(res);
    throw new AppError(401, 'UNAUTHENTICATED', NOT_LOGGED_IN_MESSAGE);
  }

  req.user = user;
  next();
}

/** Returns the logged-in user. Use only on routes behind `authenticate`. */
export function getAuthUser(req: Pick<Request, 'user'>): AuthUser {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', NOT_LOGGED_IN_MESSAGE);
  }
  return req.user;
}
