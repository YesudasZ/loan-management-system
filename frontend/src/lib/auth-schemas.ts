import { z } from 'zod';
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  STAFF_ROLES,
} from './constants';

// Mirrors the backend's auth schemas for instant feedback; the server validates again.

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export const signupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(NAME_MIN_LENGTH, `Name must be at least ${NAME_MIN_LENGTH} characters`)
    .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`),
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .refine(
      (password) => new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES,
      'Password is too long',
    )
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a digit'),
});

/** Admin's "Add staff member" form: the sign-up rules plus a staff role. */
export const staffFormSchema = signupFormSchema.extend({
  role: z.enum(STAFF_ROLES, 'Choose a role'),
});

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type SignupForm = z.infer<typeof signupFormSchema>;
export type LoginForm = z.infer<typeof loginFormSchema>;
export type StaffForm = z.infer<typeof staffFormSchema>;

/** Maps zod issues to `{ fieldName: firstMessage }` for showing under each input. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}
