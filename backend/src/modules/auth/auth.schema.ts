import { z } from 'zod';
import {
  LOGIN_PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from '../../config/constants.js';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .refine(
    (password) => new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES,
    'Password is too long',
  )
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

// Strict: unknown fields such as `role` are rejected, so sign-up can never create staff.
export const signupBodySchema = z.strictObject({
  name: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  email: emailSchema,
  password: newPasswordSchema,
});

export const loginBodySchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(LOGIN_PASSWORD_MAX_LENGTH),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
