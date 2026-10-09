import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatFileSize,
  formatInr,
  paiseToRupeeInput,
  parseRupeesToPaise,
} from './format';

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

describe('parseRupeesToPaise', () => {
  it.each([
    ['25000', 2_500_000],
    ['25,000', 2_500_000],
    ['₹ 1,23,456.78', 12_345_678],
    ['25000.5', 2_500_050],
    ['0.07', 7],
  ])('parses %j', (input, paise) => {
    expect(parseRupeesToPaise(input)).toBe(paise);
  });

  it.each(['', 'abc', '12.345', '-500', '1e5'])('rejects %j', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });

  it('round-trips through the input format', () => {
    expect(paiseToRupeeInput(2_500_050)).toBe('25000.50');
    expect(paiseToRupeeInput(2_500_000)).toBe('25000');
  });
});

describe('formatDate', () => {
  it('shows a calendar date unchanged, whatever the machine time zone', () => {
    expect(formatDate('1995-06-15')).toBe('15 Jun 1995');
  });
});

describe('formatFileSize', () => {
  it.each([
    [150, '150 B'],
    [122_880, '120 KB'],
    [5_033_165, '4.8 MB'],
  ])('formats %d bytes as %s', (bytes, label) => {
    expect(formatFileSize(bytes)).toBe(label);
  });
});
