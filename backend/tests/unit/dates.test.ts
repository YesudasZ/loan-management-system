import { describe, expect, it } from 'vitest';
import {
  calendarDateToUtcMidnight,
  toBusinessDate,
  utcMidnightToCalendarDate,
} from '../../src/utils/dates.js';

describe('dates', () => {
  it('uses the Indian calendar date, not the server time zone', () => {
    // 19:00 UTC on 9 Oct is 00:30 IST on 10 Oct.
    expect(toBusinessDate(new Date('2026-10-09T19:00:00Z'))).toBe('2026-10-10');
    expect(toBusinessDate(new Date('2026-10-09T18:00:00Z'))).toBe('2026-10-09');
  });

  it('stores calendar dates as UTC midnight and reads them back unchanged', () => {
    const stored = calendarDateToUtcMidnight('1995-06-15');
    expect(stored.toISOString()).toBe('1995-06-15T00:00:00.000Z');
    expect(utcMidnightToCalendarDate(stored)).toBe('1995-06-15');
  });
});
