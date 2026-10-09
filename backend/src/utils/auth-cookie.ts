import type { CookieOptions, Response } from 'express';
import { AUTH_COOKIE_NAME, AUTH_SESSION_MAX_AGE_MS } from '../config/constants.js';
import { isProduction } from '../config/env.js';

// The browser reaches the API through the frontend's /api proxy, so the cookie is first-party.
// No `domain`: it stays on the exact host that set it.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
};

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, { ...baseCookieOptions, maxAge: AUTH_SESSION_MAX_AGE_MS });
}

/** Clears the cookie. The attributes must match the ones used to set it, or browsers keep it. */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, baseCookieOptions);
}
