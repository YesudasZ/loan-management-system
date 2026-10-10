import { z } from 'zod';
import { ROLES, SEARCH_MAX_LENGTH, STAFF_ROLES } from '../../config/constants.js';
import { objectIdSchema, paginationQueryFields } from '../../utils/schemas.js';
import { emailSchema, nameSchema, newPasswordSchema } from '../auth/auth.schema.js';

export const listUsersQuerySchema = z.strictObject({
  ...paginationQueryFields,
  role: z.enum(ROLES).optional(),
  /** Matches anywhere in the name or email, ignoring case. Empty means no search. */
  search: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH)
    // MongoDB refuses a regex containing a NUL byte; say so as a 400 instead of failing as a 500.
    .refine((value) => !value.includes('\0'), 'Search cannot contain a null character')
    .optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// Same name, email and password rules as sign-up. The role must be a staff role: borrowers
// only ever come from public sign-up.
export const createStaffBodySchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  role: z.enum(STAFF_ROLES),
});
export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;

export const changeRoleBodySchema = z.strictObject({ role: z.enum(ROLES) });
export type ChangeRoleBody = z.infer<typeof changeRoleBodySchema>;

export const userIdParamsSchema = z.strictObject({ userId: objectIdSchema });
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
