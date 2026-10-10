import { describe, expect, it } from 'vitest';
import { maskPan } from '../../src/utils/pan.js';
import { validatePayment } from '../../src/utils/payment-rules.js';

const base = {
  amount: 50_000_00,
  paymentDate: '2026-10-10',
  outstanding: 10_295_890,
  disbursedOn: '2026-10-05',
  today: '2026-10-10',
};

const rulesFor = (override: Partial<typeof base>) =>
  validatePayment({ ...base, ...override }).map((failure) => failure.rule);

describe('validatePayment', () => {
  it('accepts a payment within the balance, dated between disbursal and today', () => {
    expect(rulesFor({})).toEqual([]);
  });

  it('accepts paying exactly the outstanding balance', () => {
    expect(rulesFor({ amount: 10_295_890 })).toEqual([]);
  });

  it('rejects one paisa more than the outstanding balance, naming the balance', () => {
    const failures = validatePayment({ ...base, amount: 10_295_891 });
    expect(failures).toEqual([
      {
        rule: 'AMOUNT_EXCEEDS_OUTSTANDING',
        message: 'The amount is more than the outstanding balance of ₹1,02,958.90.',
      },
    ]);
  });

  it('accepts a payment dated today and on the disbursal day', () => {
    expect(rulesFor({ paymentDate: '2026-10-10' })).toEqual([]);
    expect(rulesFor({ paymentDate: '2026-10-05' })).toEqual([]);
  });

  it('rejects a payment dated tomorrow', () => {
    expect(rulesFor({ paymentDate: '2026-10-11' })).toEqual(['DATE_IN_FUTURE']);
  });

  it('rejects a payment dated the day before disbursal', () => {
    expect(rulesFor({ paymentDate: '2026-10-04' })).toEqual(['DATE_BEFORE_DISBURSAL']);
  });

  it('reports every failure at once', () => {
    expect(rulesFor({ amount: 99_999_999, paymentDate: '2026-12-01' })).toEqual([
      'AMOUNT_EXCEEDS_OUTSTANDING',
      'DATE_IN_FUTURE',
    ]);
  });
});

describe('maskPan', () => {
  it('shows only the first five and the last character', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABCDE****F');
  });

  it('hides very short values completely', () => {
    expect(maskPan('ABC')).toBe('***');
  });
});
