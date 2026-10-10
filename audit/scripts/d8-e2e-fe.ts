// Lens D8 (frontend part): the amounts the video types/sees, through the real frontend helpers.
import { calculateLoanQuote } from '../../frontend/src/lib/loan-math.ts';
import { formatInr, paiseToRupeeInput, parseRupeesToPaise } from '../../frontend/src/lib/format.ts';

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = ''): void {
  if (!ok) failures += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` :: ${JSON.stringify(detail)}`}\n`);
}
const cases: [string, number][] = [['20000', 2_000_000], ['45000', 4_500_000], ['50000', 5_000_000], ['52958.90', 5_295_890], ['52,958.90', 5_295_890], ['₹ 52,958.9', 5_295_890], ['50,000', 5_000_000]];
for (const [input, expected] of cases) check(`parseRupeesToPaise("${input}") = ${expected}`, parseRupeesToPaise(input) === expected, parseRupeesToPaise(input));
check('"Pay full outstanding" fills 52958.90 for 5,295,890 paise', paiseToRupeeInput(5_295_890) === '52958.90', paiseToRupeeInput(5_295_890));
check('round trip parse(paiseToRupeeInput(5,295,890)) = 5,295,890', parseRupeesToPaise(paiseToRupeeInput(5_295_890)) === 5_295_890);
const quote = calculateLoanQuote({ principal: 100_000 * 100, tenureDays: 90, annualInterestRate: 12 });
check(`calculator ₹1,00,000 / 90 d: SI ${formatInr(quote.simpleInterest)}, total ${formatInr(quote.totalRepayment)}`, quote.simpleInterest === 295_890 && quote.totalRepayment === 10_295_890 && formatInr(quote.simpleInterest) === '₹2,958.90' && formatInr(quote.totalRepayment) === '₹1,02,958.90', quote);
check(`formatInr(5,295,890) = ${formatInr(5_295_890)}; formatInr(5,000,000) = ${formatInr(5_000_000)}`, formatInr(5_295_890) === '₹52,958.90' && formatInr(5_000_000) === '₹50,000');
process.stdout.write(`\nfailures=${failures}\n`);
process.exitCode = failures > 0 ? 1 : 0;
