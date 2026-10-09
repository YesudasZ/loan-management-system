// Business and security constants. Values that differ per environment live in env.ts instead.

export const ROLES = [
  'ADMIN',
  'SALES',
  'SANCTION',
  'DISBURSEMENT',
  'COLLECTION',
  'BORROWER',
] as const;
export type Role = (typeof ROLES)[number];

export const API_PREFIX = '/api/v1';
export const JSON_BODY_LIMIT = '100kb';

// Auth
export const BCRYPT_COST = 10; // CLAUDE.md minimum; Render's free instance has 0.1 CPU.
export const AUTH_COOKIE_NAME = 'lms_token';
export const JWT_EXPIRY = '1d';
export const AUTH_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // Matches JWT_EXPIRY.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes.
export const LOGIN_PASSWORD_MAX_LENGTH = 128;

// Rate limits (per client IP)
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export interface RateLimitRule {
  windowMs: number;
  limit: number;
}

export interface AuthRateLimits {
  login: RateLimitRule; // Only failed attempts count.
  signup: RateLimitRule;
  session: RateLimitRule; // GET /auth/me and POST /auth/logout.
}

export const AUTH_RATE_LIMITS: AuthRateLimits = {
  login: { windowMs: FIFTEEN_MINUTES_MS, limit: 10 },
  signup: { windowMs: ONE_HOUR_MS, limit: 10 },
  session: { windowMs: FIFTEEN_MINUTES_MS, limit: 300 },
};

// Database
export const DB_SERVER_SELECTION_TIMEOUT_MS = 5_000;
export const DB_MAX_POOL_SIZE = 10;
export const HEALTH_DB_PING_TIMEOUT_MS = 2_000; // Render's health check waits 5 s.
