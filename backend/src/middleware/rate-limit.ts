import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { RateLimitRule } from '../config/constants.js';
import { AppError } from '../utils/app-error.js';

interface RateLimiterOptions extends RateLimitRule {
  /** When true, only failed requests (status >= 400) count, e.g. failed logins. */
  skipSuccessfulRequests?: boolean;
}

/**
 * Per-IP rate limiter. The client IP comes from `req.ip`, which depends on the
 * `trust proxy` setting (TRUST_PROXY_HOPS). Each call creates its own in-memory store,
 * so every app instance (and every test) starts with fresh counters.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
    },
  });
}
