import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import {
  API_PREFIX,
  AUTH_RATE_LIMITS,
  JSON_BODY_LIMIT,
  type AuthRateLimits,
} from './config/constants.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { verifyOrigin } from './middleware/verify-origin.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

interface AppOptions {
  /** Tests pass small limits to exercise the 429 path quickly. */
  authRateLimits?: AuthRateLimits;
}

/**
 * Builds the Express app without starting a server, so tests can call it directly.
 * The database connection is managed by server.ts (or the test helpers).
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();

  // Behind Render's proxy (and Vercel's rewrite) req.ip must be the real client IP.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use((_req, res, next) => {
    // API responses hold personal data; Vercel's CDN must never cache them.
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(verifyOrigin(env.CORS_ORIGINS));

  app.use(healthRouter);
  app.use(API_PREFIX, createAuthRouter(options.authRateLimits ?? AUTH_RATE_LIMITS));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
