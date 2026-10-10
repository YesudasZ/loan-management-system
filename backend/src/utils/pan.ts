const VISIBLE_PREFIX = 5;
const VISIBLE_SUFFIX = 1;

/** "ABCDE1234F" → "ABCDE****F". Staff screens and logs only ever see a masked PAN. */
export function maskPan(pan: string): string {
  if (pan.length <= VISIBLE_PREFIX + VISIBLE_SUFFIX) {
    return '*'.repeat(pan.length);
  }
  const hidden = pan.length - VISIBLE_PREFIX - VISIBLE_SUFFIX;
  return `${pan.slice(0, VISIBLE_PREFIX)}${'*'.repeat(hidden)}${pan.slice(-VISIBLE_SUFFIX)}`;
}
