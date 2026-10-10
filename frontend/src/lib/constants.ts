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

export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

export const EMPLOYMENT_MODES = ['SALARIED', 'SELF_EMPLOYED', 'UNEMPLOYED'] as const;
export type EmploymentMode = (typeof EMPLOYMENT_MODES)[number];
export const EMPLOYMENT_MODE_LABELS: Record<EmploymentMode, string> = {
  SALARIED: 'Salaried',
  SELF_EMPLOYED: 'Self-employed',
  UNEMPLOYED: 'Unemployed',
};

// BRE (mirrors the backend; the server decides)
export const BRE_MIN_AGE = 23;
export const BRE_MAX_AGE = 50;
export const BRE_MIN_MONTHLY_SALARY_PAISE = 2_500_000;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const EARLIEST_DATE_OF_BIRTH = '1900-01-01';

// Loans
export const ANNUAL_INTEREST_RATE_PERCENT = 12;
export const DAYS_IN_YEAR = 365;
export const MIN_PRINCIPAL_RUPEES = 50_000;
export const MAX_PRINCIPAL_RUPEES = 500_000;
export const PRINCIPAL_STEP_RUPEES = 1_000;
export const DEFAULT_PRINCIPAL_RUPEES = 100_000;
export const MIN_TENURE_DAYS = 30;
export const MAX_TENURE_DAYS = 365;
export const DEFAULT_TENURE_DAYS = 90;

// Salary slip
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

// Operations
export const REJECTION_REASON_MIN_LENGTH = 5;
export const NOTE_MAX_LENGTH = 500;
export const UTR_PATTERN = /^[A-Z0-9]{6,30}$/;
