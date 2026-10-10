// Lens D2: loan math. Pure backend vs frontend vs exact rational half-up, then the API.
import { calculateLoanQuote as beQuote } from '../src/utils/loan-math.js';
import { calculateLoanQuote as feQuote } from '../../frontend/src/lib/loan-math.ts';
import { formatInr } from '../../frontend/src/lib/format.ts';
import { formatRupees } from '../src/utils/money.js';
import { createTestUser } from '../tests/helpers/auth.js';
import { prepareBorrowerToApply } from '../tests/helpers/borrower.js';
import { check, note, post, start, stop, summary } from './harness.js';

const RATE = 12;
/** Exact SI in paise with half-up rounding, using BigInt (no floating point). */
function exactSi(principal: number, tenureDays: number): number {
  const numerator = BigInt(principal) * BigInt(RATE) * BigInt(tenureDays);
  const denominator = 36500n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(remainder * 2n >= denominator ? quotient + 1n : quotient);
}

// 1) Worked example.
const ex = beQuote({ principal: 10_000_000, tenureDays: 90, annualInterestRate: RATE });
check('worked example ₹1,00,000 × 90d → SI 295,890 paise, total 10,295,890', ex.simpleInterest === 295_890 && ex.totalRepayment === 10_295_890, ex);
check('formatted: SI ₹2,958.90 / total ₹1,02,958.90 (frontend formatInr)', formatInr(ex.simpleInterest) === '₹2,958.90' && formatInr(ex.totalRepayment) === '₹1,02,958.90', [formatInr(ex.simpleInterest), formatInr(ex.totalRepayment)]);
check('formatted (backend formatRupees)', formatRupees(ex.totalRepayment) === '₹1,02,958.90', formatRupees(ex.totalRepayment));

// 2) Exhaustive over the slider grid (₹1,000 steps × every tenure) and 200k random whole-rupee combos.
let gridMismatch = 0;
let gridCount = 0;
let halfCases = 0;
for (let rupees = 50_000; rupees <= 500_000; rupees += 1_000) {
  for (let t = 30; t <= 365; t += 1) {
    const p = rupees * 100;
    const b = beQuote({ principal: p, tenureDays: t, annualInterestRate: RATE });
    const f = feQuote({ principal: p, tenureDays: t, annualInterestRate: RATE });
    const e = exactSi(p, t);
    gridCount += 1;
    if (b.simpleInterest !== e || f.simpleInterest !== e || b.totalRepayment !== p + e || f.totalRepayment !== b.totalRepayment) gridMismatch += 1;
    if ((BigInt(p) * 12n * BigInt(t)) % 36500n === 18250n) halfCases += 1;
  }
}
check(`slider grid: ${gridCount} combos, backend == frontend == exact half-up`, gridMismatch === 0, gridMismatch);
note(`exact .5-paise ties on the grid: ${halfCases} (a tie needs 24·p·T ≡ 365 mod 730, impossible for whole-rupee p, so rounding mode never matters for valid input)`);
let randomMismatch = 0;
for (let i = 0; i < 200_000; i += 1) {
  const p = (50_000 + Math.floor(Math.random() * 450_001)) * 100;
  const t = 30 + Math.floor(Math.random() * 336);
  const b = beQuote({ principal: p, tenureDays: t, annualInterestRate: RATE });
  const f = feQuote({ principal: p, tenureDays: t, annualInterestRate: RATE });
  if (b.simpleInterest !== exactSi(p, t) || f.simpleInterest !== b.simpleInterest) randomMismatch += 1;
}
check('200k random whole-rupee combos: backend == frontend == exact', randomMismatch === 0, randomMismatch);
// Half-up on a constructed tie (non-whole-rupee principal, pure function only): P·12·T = 36500k + 18250.
let tie: [number, number] | null = null;
for (let p = 1; p < 100_000 && !tie; p += 1) {
  for (let t = 30; t <= 365; t += 1) {
    if ((p * 12 * t) % 36500 === 18250) { tie = [p, t]; break; }
  }
}
if (tie) {
  const [p, t] = tie;
  const b = beQuote({ principal: p, tenureDays: t, annualInterestRate: RATE });
  check(`constructed tie P=${p} paise T=${t}: ${(p * 12 * t) / 36500} rounds half-up to ${Math.ceil((p * 12 * t) / 36500)}`, b.simpleInterest === Math.ceil((p * 12 * t) / 36500), b);
}

// 3) API: boundaries, invalid values, and 20 random combos (apply response == both quote functions).
const app = await start();
try {
  let n = 0;
  async function freshBorrowerCookie(): Promise<string> {
    n += 1;
    const user = await createTestUser('BORROWER', `d2-${n}@audit.dev`);
    await prepareBorrowerToApply(app, user.cookie);
    return user.cookie;
  }
  const valid: [number, number][] = [
    [5_000_000, 30], [50_000_000, 365], [5_000_000, 365], [50_000_000, 30],
  ];
  for (let i = 0; i < 20; i += 1) {
    valid.push([(50_000 + Math.floor(Math.random() * 450_001)) * 100, 30 + Math.floor(Math.random() * 336)]);
  }
  let apiMismatch = 0;
  for (const [principal, tenureDays] of valid) {
    const cookie = await freshBorrowerCookie();
    const res = await post(app, '/borrower/loans', cookie, { principal, tenureDays });
    const loan = res.body?.data?.loan;
    const b = beQuote({ principal, tenureDays, annualInterestRate: RATE });
    const f = feQuote({ principal, tenureDays, annualInterestRate: RATE });
    const agree = res.status === 201 && loan.simpleInterest === b.simpleInterest && loan.totalRepayment === b.totalRepayment && f.simpleInterest === b.simpleInterest && f.totalRepayment === b.totalRepayment && loan.status === 'APPLIED' && loan.annualInterestRate === 12 && loan.outstanding === b.totalRepayment && loan.totalPaid === 0;
    if (!agree) apiMismatch += 1;
    note(`P=${principal} T=${tenureDays} → api ${res.status} SI=${loan?.simpleInterest} total=${loan?.totalRepayment} | be ${b.simpleInterest}/${b.totalRepayment} | fe ${f.simpleInterest}/${f.totalRepayment}`);
  }
  check(`API apply == backend == frontend for ${valid.length} combos (4 boundary + 20 random)`, apiMismatch === 0, apiMismatch);

  const cookie = await freshBorrowerCookie();
  const invalid: [string, object][] = [
    ['principal 4,999,900 (₹49,999)', { principal: 4_999_900, tenureDays: 90 }],
    ['principal 50,000,100 (₹5,00,001)', { principal: 50_000_100, tenureDays: 90 }],
    ['principal 5,000,050 (not whole rupees)', { principal: 5_000_050, tenureDays: 90 }],
    ['principal 10,000,000.5', { principal: 10_000_000.5, tenureDays: 90 }],
    ['tenure 29', { principal: 10_000_000, tenureDays: 29 }],
    ['tenure 366', { principal: 10_000_000, tenureDays: 366 }],
    ['tenure 90.5', { principal: 10_000_000, tenureDays: 90.5 }],
    ['principal as string', { principal: '10000000', tenureDays: 90 }],
    ['negative principal', { principal: -10_000_000, tenureDays: 90 }],
    ['client-sent totals', { principal: 10_000_000, tenureDays: 90, totalRepayment: 1 }],
    ['client-sent interest rate', { principal: 10_000_000, tenureDays: 90, annualInterestRate: 0 }],
  ];
  for (const [label, body] of invalid) {
    const res = await post(app, '/borrower/loans', cookie, body);
    check(`${label} → 400`, res.status === 400, res.body);
  }
  const stillOk = await post(app, '/borrower/loans', cookie, { principal: 10_000_000, tenureDays: 90 });
  check('the same borrower can still apply after the rejected attempts (worked example via API)', stillOk.status === 201 && stillOk.body.data.loan.simpleInterest === 295_890 && stillOk.body.data.loan.totalRepayment === 10_295_890, stillOk.body);
} finally {
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
