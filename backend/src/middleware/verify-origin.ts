import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF safety net on top of the SameSite=Lax cookie: a state-changing request that carries
 * an `Origin` header must come from an allowed origin. Requests without `Origin`
 * (curl, server-to-server) are allowed; browsers always send it on POST.
 */
export function verifyOrigin(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (req, _res, next) => {
    const origin = req.get('origin');
    if (STATE_CHANGING_METHODS.has(req.method) && origin !== undefined && !allowed.has(origin)) {
      next(new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed'));
      return;
    }
    next();
  };
}
