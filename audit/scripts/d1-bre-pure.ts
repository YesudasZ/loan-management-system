// Lens D1: BRE boundaries, backend vs frontend mirror, with explicit "today" dates.
import * as be from '../src/utils/bre.js';
import { toBusinessDate as beToBusinessDate } from '../src/utils/dates.js';
import * as fe from '../../frontend/src/lib/bre.ts';
import { toBusinessDate as feToBusinessDate } from '../../frontend/src/lib/dates.ts';

type Mode = 'SALARIED' | 'SELF_EMPLOYED' | 'UNEMPLOYED';
interface Case {
  name: string;
  dob: string;
  today: string;
  salary: number;
  pan: string;
  mode: Mode;
  expectRules: string[];
}

const ok = { salary: 2_500_000, pan: 'ABCDE1234F', mode: 'SALARIED' as Mode };
const cases: Case[] = [
  { name: 'exactly 23 today', dob: '2003-10-10', today: '2026-10-10', ...ok, expectRules: [] },
  { name: 'day before 23rd birthday', dob: '2003-10-11', today: '2026-10-10', ...ok, expectRules: ['AGE'] },
  { name: '50y + 364d (day before 51)', dob: '1975-10-11', today: '2026-10-10', ...ok, expectRules: [] },
  { name: 'exactly 51 today', dob: '1975-10-10', today: '2026-10-10', ...ok, expectRules: ['AGE'] },
  { name: 'exactly 50 today', dob: '1976-10-10', today: '2026-10-10', ...ok, expectRules: [] },
  // Feb 29 DOB: turns 23 in 2027 (non-leap). Born 2004-02-29.
  { name: 'Feb-29 DOB, today 2027-02-28 (non-leap) -> still 22', dob: '2004-02-29', today: '2027-02-28', ...ok, expectRules: ['AGE'] },
  { name: 'Feb-29 DOB, today 2027-03-01 (non-leap) -> 23', dob: '2004-02-29', today: '2027-03-01', ...ok, expectRules: [] },
  // Feb 29 DOB at the upper edge: born 1976-02-29, turns 51 on 2027-03-01 (non-leap)
  { name: 'Feb-29 DOB upper, today 2027-02-28 -> 50', dob: '1976-02-29', today: '2027-02-28', ...ok, expectRules: [] },
  { name: 'Feb-29 DOB upper, today 2027-03-01 -> 51', dob: '1976-02-29', today: '2027-03-01', ...ok, expectRules: ['AGE'] },
  { name: 'Feb-29 DOB, leap year today 2028-02-29 -> 24', dob: '2004-02-29', today: '2028-02-29', ...ok, expectRules: [] },
  { name: 'future DOB', dob: '2027-01-01', today: '2026-10-10', ...ok, expectRules: ['AGE'] },
  { name: 'salary 24,999.99', dob: '1990-01-01', today: '2026-10-10', ...ok, salary: 2_499_999, expectRules: ['SALARY'] },
  { name: 'salary 25,000.00', dob: '1990-01-01', today: '2026-10-10', ...ok, salary: 2_500_000, expectRules: [] },
  { name: 'salary 0', dob: '1990-01-01', today: '2026-10-10', ...ok, salary: 0, expectRules: ['SALARY'] },
  { name: 'PAN lowercase', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'abcde1234f', expectRules: [] },
  { name: 'PAN surrounding spaces', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: '  ABCDE1234F  ', expectRules: [] },
  { name: 'PAN inner space', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'ABCDE 1234F', expectRules: ['PAN'] },
  { name: 'PAN ABC123', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'ABC123', expectRules: ['PAN'] },
  { name: 'PAN digits first', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: '12345ABCDE', expectRules: ['PAN'] },
  { name: 'PAN 11 chars', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'ABCDE1234FG', expectRules: ['PAN'] },
  { name: 'PAN last char digit', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'ABCDE12345', expectRules: ['PAN'] },
  { name: 'PAN empty', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: '', expectRules: ['PAN'] },
  { name: 'PAN with unicode letters', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'ÄBCDE1234F', expectRules: ['PAN'] },
  { name: 'PAN trailing newline', dob: '1990-01-01', today: '2026-10-10', ...ok, pan: 'ABCDE1234F\n', expectRules: [] },
  { name: 'Self-employed', dob: '1990-01-01', today: '2026-10-10', ...ok, mode: 'SELF_EMPLOYED', expectRules: [] },
  { name: 'Unemployed', dob: '1990-01-01', today: '2026-10-10', ...ok, mode: 'UNEMPLOYED', expectRules: ['EMPLOYMENT'] },
  { name: 'all 4 failing', dob: '2005-03-15', today: '2026-10-10', salary: 2_000_000, pan: 'ABC123', mode: 'UNEMPLOYED', expectRules: ['AGE', 'SALARY', 'PAN', 'EMPLOYMENT'] },
];

let failures = 0;
for (const c of cases) {
  const input = { dateOfBirth: c.dob, monthlySalary: c.salary, pan: c.pan, employmentMode: c.mode };
  const b = be.evaluateEligibility(input, c.today);
  const f = fe.evaluateEligibility(input, c.today);
  const bRules = b.failures.map((x) => x.rule);
  const fRules = f.failures.map((x) => x.rule);
  const agree = JSON.stringify(b) === JSON.stringify(f);
  const asExpected = JSON.stringify(bRules) === JSON.stringify(c.expectRules);
  const status = agree && asExpected ? 'PASS' : 'FAIL';
  if (status === 'FAIL') failures += 1;
  process.stdout.write(
    `${status} ${c.name}: be=${JSON.stringify(bRules)} fe=${JSON.stringify(fRules)} agree=${agree}` +
      (agree ? '' : `\n   be=${JSON.stringify(b)}\n   fe=${JSON.stringify(f)}`) +
      '\n',
  );
}
const allFour = be.evaluateEligibility(
  { dateOfBirth: '2005-03-15', monthlySalary: 2_000_000, pan: 'ABC123', employmentMode: 'UNEMPLOYED' },
  '2026-10-10',
);
process.stdout.write(`all-4 messages: ${JSON.stringify(allFour.failures)}\n`);

// IST midnight edge: 18:29:59.999Z is 23:59:59.999 IST; 18:30:00.000Z is 00:00 IST next day.
const instants: [string, string][] = [
  ['2026-10-09T18:29:59.999Z', '2026-10-09'],
  ['2026-10-09T18:30:00.000Z', '2026-10-10'],
  ['2026-02-28T18:29:59.999Z', '2026-02-28'],
  ['2026-02-28T18:30:00.000Z', '2026-03-01'],
  ['2026-12-31T18:30:00.000Z', '2027-01-01'],
];
for (const [iso, expected] of instants) {
  const b = beToBusinessDate(new Date(iso));
  const f = feToBusinessDate(new Date(iso));
  const status = b === expected && f === expected ? 'PASS' : 'FAIL';
  if (status === 'FAIL') failures += 1;
  process.stdout.write(`${status} toBusinessDate(${iso}) be=${b} fe=${f} expected=${expected}\n`);
}
// A borrower turning 23 on 2026-10-10: eligible from 18:30Z on the 9th.
for (const iso of ['2026-10-09T18:29:59.999Z', '2026-10-09T18:30:00.000Z']) {
  const today = beToBusinessDate(new Date(iso));
  const r = be.evaluateEligibility({ dateOfBirth: '2003-10-10', ...{ monthlySalary: 2_500_000, pan: 'ABCDE1234F', employmentMode: 'SALARIED' as Mode } }, today);
  process.stdout.write(`IST edge at ${iso} (today=${today}): eligible=${r.isEligible}\n`);
}
process.stdout.write(`TZ=${process.env.TZ ?? '(unset)'} failures=${failures}\n`);
