// Mirrors backend/src/config/constants.ts where the two apps share a rule.

export const PAISE_PER_RUPEE = 100;

export const ROLES = [
  'ADMIN',
  'SALES',
  'SANCTION',
  'DISBURSEMENT',
  'COLLECTION',
  'BORROWER',
] as const;
export type Role = (typeof ROLES)[number];

export const AUTH_COOKIE_NAME = 'lms_token';
export const API_PREFIX = '/api/v1';

// Auth form rules (the backend enforces the same ones).
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 80;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

/** Render's free tier can take about a minute to wake up; GET requests retry for this long. */
export const SERVER_WAKE_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 20_000, 20_000, 20_000];
