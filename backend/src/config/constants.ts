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

// Business rules
export const BUSINESS_TIMEZONE = 'Asia/Kolkata';
export const PAISE_PER_RUPEE = 100;
export const EMPLOYMENT_MODES = ['SALARIED', 'SELF_EMPLOYED', 'UNEMPLOYED'] as const;
export type EmploymentMode = (typeof EMPLOYMENT_MODES)[number];

// BRE (business rule engine)
export const BRE_MIN_AGE = 23;
export const BRE_MAX_AGE = 50;
export const BRE_MIN_MONTHLY_SALARY_PAISE = 2_500_000; // ₹25,000
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const MAX_MONTHLY_SALARY_PAISE = 1_000_000_000; // ₹1 crore; input sanity cap.
export const PAN_MAX_INPUT_LENGTH = 20; // Format is checked by the BRE, not by validation.
export const EARLIEST_DATE_OF_BIRTH = '1900-01-01';

// Loans
export const ANNUAL_INTEREST_RATE_PERCENT = 12;
export const DAYS_IN_YEAR = 365;
export const MIN_PRINCIPAL_PAISE = 5_000_000; // ₹50,000
export const MAX_PRINCIPAL_PAISE = 50_000_000; // ₹5,00,000
export const MIN_TENURE_DAYS = 30;
export const MAX_TENURE_DAYS = 365;

// Salary slip uploads
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const SALARY_SLIP_BUCKET = 'salary_slips';
/** Allowed file extensions and the MIME type each must have (declared and detected). */
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

// Lists
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Payments
export const UTR_PATTERN = /^[A-Z0-9]{6,30}$/; // Real UTRs are 12–22 characters; kept loose on purpose.
export const REJECTION_REASON_MIN_LENGTH = 5;
export const NOTE_MAX_LENGTH = 500;
