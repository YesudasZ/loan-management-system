import { z } from 'zod';
import {
  MAX_PRINCIPAL_PAISE,
  MAX_TENURE_DAYS,
  MIN_PRINCIPAL_PAISE,
  MIN_TENURE_DAYS,
  NOTE_MAX_LENGTH,
  PAISE_PER_RUPEE,
  REJECTION_REASON_MIN_LENGTH,
} from '../../config/constants.js';
import { LOAN_STATUSES } from '../../utils/loan-state-machine.js';
import { paginationQueryFields } from '../../utils/schemas.js';

// Only the loan choice is accepted. Strict: a client that sends interest or totals gets a 400;
// the server always calculates them.
export const applyBodySchema = z.strictObject({
  principal: z
    .number()
    .int()
    .min(MIN_PRINCIPAL_PAISE, 'The minimum loan amount is ₹50,000')
    .max(MAX_PRINCIPAL_PAISE, 'The maximum loan amount is ₹5,00,000')
    .multipleOf(PAISE_PER_RUPEE, 'The loan amount must be in whole rupees'),
  tenureDays: z
    .number()
    .int()
    .min(MIN_TENURE_DAYS, `Tenure must be at least ${MIN_TENURE_DAYS} days`)
    .max(MAX_TENURE_DAYS, `Tenure must be at most ${MAX_TENURE_DAYS} days`),
});

export type ApplyBody = z.infer<typeof applyBodySchema>;

export const listLoansQuerySchema = z.strictObject({
  ...paginationQueryFields,
  status: z.enum(LOAN_STATUSES).optional(),
});
export type ListLoansQuery = z.infer<typeof listLoansQuerySchema>;

export const approveBodySchema = z.strictObject({
  note: z.string().trim().min(1).max(NOTE_MAX_LENGTH).optional(),
});
export type ApproveBody = z.infer<typeof approveBodySchema>;

export const rejectBodySchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(
      REJECTION_REASON_MIN_LENGTH,
      `Give a reason of at least ${REJECTION_REASON_MIN_LENGTH} characters`,
    )
    .max(NOTE_MAX_LENGTH),
});
export type RejectBody = z.infer<typeof rejectBodySchema>;
