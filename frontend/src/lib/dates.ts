import { BUSINESS_TIMEZONE } from './constants';

/** A date without a time, `YYYY-MM-DD`. Mirrors backend/src/utils/dates.ts. */
export type CalendarDate = string;

// en-CA formats as YYYY-MM-DD.
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in India (the server uses the same "today" for its checks). */
export function toBusinessDate(instant: Date = new Date()): CalendarDate {
  return businessDateFormatter.format(instant);
}

export function toDateParts(date: CalendarDate): { year: number; month: number; day: number } {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  return { year, month, day };
}
