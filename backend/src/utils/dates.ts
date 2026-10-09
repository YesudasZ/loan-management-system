import { BUSINESS_TIMEZONE } from '../config/constants.js';

/**
 * A date without a time, as `YYYY-MM-DD` (date of birth, payment date). Stored in MongoDB as
 * UTC midnight. Business "today" is the calendar date in India, so age and "not in the future"
 * checks don't depend on the server's time zone (Render runs on UTC). Local-time Date getters
 * are never used.
 */
export type CalendarDate = string;

// en-CA formats as YYYY-MM-DD.
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in India at the given instant (default: now). */
export function toBusinessDate(instant: Date = new Date()): CalendarDate {
  return businessDateFormatter.format(instant);
}

export function calendarDateToUtcMidnight(date: CalendarDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function utcMidnightToCalendarDate(date: Date): CalendarDate {
  return date.toISOString().slice(0, 10);
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function toDateParts(date: CalendarDate): DateParts {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  return { year, month, day };
}
