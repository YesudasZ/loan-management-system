import { PAISE_PER_RUPEE } from '../config/constants.js';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  trailingZeroDisplay: 'stripIfInteger',
});

/** Paise → "₹1,02,958.90" for messages shown to users. */
export function formatRupees(paise: number): string {
  return inrFormatter.format(paise / PAISE_PER_RUPEE);
}
