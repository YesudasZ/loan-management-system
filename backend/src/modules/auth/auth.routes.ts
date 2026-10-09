import { Router } from 'express';
import type { AuthRateLimits } from '../../config/constants.js';
import { authenticate } from '../../middleware/authenticate.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { emptyBodySchema, validate } from '../../middleware/validate.js';
import * as authController from './auth.controller.js';
import { loginBodySchema, signupBodySchema } from './auth.schema.js';

export function createAuthRouter(rateLimits: AuthRateLimits): Router {
  const router = Router();
  const signupLimiter = createRateLimiter(rateLimits.signup);
  const loginLimiter = createRateLimiter({ ...rateLimits.login, skipSuccessfulRequests: true });
  const sessionLimiter = createRateLimiter(rateLimits.session);

  router.post(
    '/auth/signup',
    signupLimiter,
    validate({ body: signupBodySchema }),
    authController.signup,
  );
  router.post(
    '/auth/login',
    loginLimiter,
    validate({ body: loginBodySchema }),
    authController.login,
  );
  router.post(
    '/auth/logout',
    sessionLimiter,
    validate({ body: emptyBodySchema }),
    authController.logout,
  );
  router.get('/auth/me', sessionLimiter, authenticate, authController.getCurrentUser);

  return router;
}
