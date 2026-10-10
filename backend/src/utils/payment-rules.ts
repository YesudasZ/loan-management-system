import type { Role } from '../config/constants.js';
import { formatRupees } from './money.js';
import type { CalendarDate } from './dates.js';

/** Roles that may record a payment (the routes and the test-data seed both use this). */
export const PAYMENT_RECORDER_ROLES: readonly Role[] = ['COLLECTION', 'ADMIN'];

export type PaymentRule = 'AMOUNT_EXCEEDS_OUTSTANDING' | 'DATE_IN_FUTURE' | 'DATE_BEFORE_DISBURSAL';

export interface PaymentRuleFailure {
  rule: PaymentRule;
  message: string;
}

export interface PaymentCheckInput {
  amount: number; // paise, already validated as a positive integer
  paymentDate: CalendarDate;
  outstanding: number; // paise
  disbursedOn: CalendarDate; // disbursal date in India
  today: CalendarDate; // today in India
}

/**
 * Business rules for recording a payment. Returns every failure (empty = valid). Pure: the
 * caller passes the loan's current outstanding balance, read inside the payment transaction.
 * Calendar dates compare correctly as YYYY-MM-DD strings.
 */
export function validatePayment(input: PaymentCheckInput): PaymentRuleFailure[] {
  const failures: PaymentRuleFailure[] = [];
  if (input.amount > input.outstanding) {
    failures.push({
      rule: 'AMOUNT_EXCEEDS_OUTSTANDING',
      message: `The amount is more than the outstanding balance of ${formatRupees(input.outstanding)}.`,
    });
  }
  if (input.paymentDate > input.today) {
    failures.push({ rule: 'DATE_IN_FUTURE', message: 'The payment date cannot be in the future.' });
  }
  if (input.paymentDate < input.disbursedOn) {
    failures.push({
      rule: 'DATE_BEFORE_DISBURSAL',
      message: 'The payment date cannot be before the loan was disbursed.',
    });
  }
  return failures;
}
