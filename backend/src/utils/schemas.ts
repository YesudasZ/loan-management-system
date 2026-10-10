import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js';

/** A MongoDB ObjectId: exactly 24 hex characters (checked before any query). */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const loanIdParamsSchema = z.strictObject({ loanId: objectIdSchema });
export type LoanIdParams = z.infer<typeof loanIdParamsSchema>;

/** `?page=&limit=` for every list endpoint (query strings arrive as text, so coerce). */
export const paginationQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const paginationQuerySchema = z.strictObject(paginationQueryFields);
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
