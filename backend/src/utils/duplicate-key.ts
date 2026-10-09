import { z } from 'zod';

const DUPLICATE_KEY_ERROR_CODE = 11000;

const duplicateKeyErrorSchema = z.object({
  code: z.literal(DUPLICATE_KEY_ERROR_CODE),
  keyPattern: z.record(z.string(), z.unknown()),
});

/**
 * True when `error` is MongoDB's duplicate-key error (E11000) on an index that includes `field`.
 * Services map each unique index to its own 409 code instead of a generic "duplicate" error.
 */
export function isDuplicateKeyError(error: unknown, field: string): boolean {
  const parsed = duplicateKeyErrorSchema.safeParse(error);
  return parsed.success && field in parsed.data.keyPattern;
}
