import { z } from 'zod';
import { UTR_PATTERN } from '../../config/constants.js';
import { paginationQueryFields } from '../../utils/schemas.js';

export const recordPaymentBodySchema = z.strictObject({
  utr: z.string().trim().toUpperCase().regex(UTR_PATTERN, 'UTR must be 6 to 30 letters or digits'),
  amount: z.number().int('Amount must be in whole paise').positive('Amount must be more than 0'),
  paymentDate: z.iso.date('Enter a valid date (YYYY-MM-DD)'),
});
export type RecordPaymentBody = z.infer<typeof recordPaymentBodySchema>;

export const listPaymentsQuerySchema = z.strictObject(paginationQueryFields);
