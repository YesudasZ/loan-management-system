import { BUSINESS_TIMEZONE, PAISE_PER_RUPEE } from './constants';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  // Whole-rupee amounts show no ".00" (₹5,00,000); others keep two decimals (₹2,958.90).
  trailingZeroDisplay: 'stripIfInteger',
});

/** Formats an amount stored in integer paise as Indian rupees with lakh grouping. */
export function formatInr(paise: number): string {
  return inrFormatter.format(paise / PAISE_PER_RUPEE);
}

const RUPEE_INPUT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Parses what a user typed as rupees ("25,000", "25000.5", "₹ 1,23,456.78") into integer paise
 * using string arithmetic, never float multiplication. Returns null if it isn't an amount.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!RUPEE_INPUT_PATTERN.test(cleaned)) {
    return null;
  }
  const [rupees = '0', paise = ''] = cleaned.split('.');
  return Number(rupees) * PAISE_PER_RUPEE + Number(paise.padEnd(2, '0'));
}

/** Paise → a plain rupee string for an input field ("25000" or "25000.50"). */
export function paiseToRupeeInput(paise: number): string {
  const rupees = Math.floor(paise / PAISE_PER_RUPEE);
  const remainder = paise % PAISE_PER_RUPEE;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: BUSINESS_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: BUSINESS_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "15 Jun 1995" — for a YYYY-MM-DD calendar date or an ISO timestamp, in Indian time. */
export function formatDate(value: string): string {
  const instant = value.length === 10 ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return dateFormatter.format(instant);
}

export function formatDateTime(isoTimestamp: string): string {
  return dateTimeFormatter.format(new Date(isoTimestamp));
}

const BYTES_PER_KILOBYTE = 1024;

/** "850 B", "120 KB", "4.8 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < BYTES_PER_KILOBYTE) return `${bytes} B`;
  const kilobytes = bytes / BYTES_PER_KILOBYTE;
  return kilobytes < BYTES_PER_KILOBYTE
    ? `${Math.round(kilobytes)} KB`
    : `${(kilobytes / BYTES_PER_KILOBYTE).toFixed(1)} MB`;
}
