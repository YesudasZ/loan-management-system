import { z } from 'zod';
import {
  MAX_PRINCIPAL_PAISE,
  MAX_TENURE_DAYS,
  MIN_PRINCIPAL_PAISE,
  MIN_TENURE_DAYS,
  PAISE_PER_RUPEE,
} from '../../config/constants.js';

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
