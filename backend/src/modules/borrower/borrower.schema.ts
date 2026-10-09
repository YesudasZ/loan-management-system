import { z } from 'zod';
import {
  EARLIEST_DATE_OF_BIRTH,
  EMPLOYMENT_MODES,
  MAX_MONTHLY_SALARY_PAISE,
  PAN_MAX_INPUT_LENGTH,
} from '../../config/constants.js';
import { toBusinessDate } from '../../utils/dates.js';

const FULL_NAME_MIN_LENGTH = 2;
const FULL_NAME_MAX_LENGTH = 100;

// Shape checks only. The eligibility rules (age, salary, PAN format, employment) are the BRE's
// job, so every rule failure is reported together with a 422 instead of one 400 at a time.
export const profileBodySchema = z.strictObject({
  fullName: z.string().trim().min(FULL_NAME_MIN_LENGTH).max(FULL_NAME_MAX_LENGTH),
  pan: z.string().trim().toUpperCase().min(1, 'PAN is required').max(PAN_MAX_INPUT_LENGTH),
  dateOfBirth: z.iso
    .date('Enter a valid date (YYYY-MM-DD)')
    .refine((date) => date >= EARLIEST_DATE_OF_BIRTH, 'Enter a valid date of birth')
    .refine((date) => date <= toBusinessDate(), 'Date of birth cannot be in the future'),
  monthlySalary: z.number().int().min(0).max(MAX_MONTHLY_SALARY_PAISE),
  employmentMode: z.enum(EMPLOYMENT_MODES),
});

export type ProfileBody = z.infer<typeof profileBodySchema>;
