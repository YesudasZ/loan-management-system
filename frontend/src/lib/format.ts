import { PAISE_PER_RUPEE } from './constants';

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
