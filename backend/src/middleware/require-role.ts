import type { RequestHandler } from 'express';
import type { Role } from '../config/constants.js';
import { AppError } from '../utils/app-error.js';

/**
 * Allows only the listed roles (403 otherwise). There is no implicit ADMIN bypass:
 * routes that ADMIN may use list it explicitly, which keeps every rule greppable and
 * keeps admins out of borrower-only routes. Must run after `authenticate`.
 */
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue'));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have access to this resource'));
      return;
    }
    next();
  };
}
