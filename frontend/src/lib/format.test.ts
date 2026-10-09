import { describe, expect, it } from 'vitest';
import { formatInr } from './format';

describe('formatInr', () => {
  it('groups whole rupees in lakhs without decimals', () => {
    expect(formatInr(50_000_000)).toBe('₹5,00,000');
  });

  it('keeps two decimals when there are paise', () => {
    expect(formatInr(295_890)).toBe('₹2,958.90');
  });

  it('formats zero', () => {
    expect(formatInr(0)).toBe('₹0');
  });
});
