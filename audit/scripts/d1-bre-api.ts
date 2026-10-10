// Lens D1 (API part): PUT /borrower/profile boundaries, all-failures 422, profile saved,
// apply-time re-check, and the IST midnight edge with a shifted clock.
import mongoose from 'mongoose';
import { BorrowerProfileModel } from '../src/models/borrower-profile.model.js';
import { LoanModel } from '../src/models/loan.model.js';
import { toBusinessDate } from '../src/utils/dates.js';
import { check, get, note, post, put, signup, start, stop, summary, uploadPdf } from './harness.js';

const RealDate = Date;
let clockOffsetMs = 0;
class ShiftedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + clockOffsetMs);
    else super(...(args as [string]));
  }
  static override now(): number {
    return RealDate.now() + clockOffsetMs;
  }
}
function setClock(iso: string | null): void {
  clockOffsetMs = iso === null ? 0 : new RealDate(iso).getTime() - RealDate.now();
}

function shiftYears(date: string, years: number, days = 0): string {
  const d = new RealDate(`${date}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const base = {
  fullName: 'Audit Person',
  pan: 'ABCDE1234F',
  dateOfBirth: '1996-01-01',
  monthlySalary: 4_500_000,
  employmentMode: 'SALARIED',
};

const app = await start();
try {
  const today = toBusinessDate();
  note(`IST today = ${today}`);
  const cookie = await signup(app, 'd1@audit.dev');

  // All four failing at once.
  const allFail = await put(app, '/borrower/profile', cookie, {
    fullName: 'Audit Person',
    dateOfBirth: shiftYears(today, -21),
    monthlySalary: 2_000_000,
    pan: 'ABC123',
    employmentMode: 'UNEMPLOYED',
  });
  const rules = (allFail.body?.error?.details?.failures ?? []).map((f: { rule: string }) => f.rule);
  check('all-4 fail → 422 BRE_FAILED', allFail.status === 422 && allFail.body.error.code === 'BRE_FAILED', allFail.body);
  check('all-4 fail lists AGE,SALARY,PAN,EMPLOYMENT', JSON.stringify(rules) === '["AGE","SALARY","PAN","EMPLOYMENT"]', rules);
  note(`422 body: ${JSON.stringify(allFail.body)}`);
  const progressAfterFail = await get(app, '/borrower/progress', cookie);
  check(
    'profile still saved after 422 (progress.profile present, breResult.isEligible=false, 4 failures)',
    progressAfterFail.body.data.profile?.breResult?.isEligible === false &&
      progressAfterFail.body.data.profile.breResult.failures.length === 4 &&
      progressAfterFail.body.data.profile.pan === 'ABC123',
    progressAfterFail.body.data.profile,
  );

  // PAN normalization: lowercase + surrounding spaces.
  const panNorm = await put(app, '/borrower/profile', cookie, { ...base, pan: '  abcde1234f  ' });
  check('PAN "  abcde1234f  " → 200 and stored as ABCDE1234F', panNorm.status === 200 && panNorm.body.data.profile.pan === 'ABCDE1234F', panNorm.body);
  for (const bad of ['ABCDE 1234F', 'ABCD1234EF', 'ABCDE12345', 'ABCDE1234FG', '1BCDE1234F']) {
    const r = await put(app, '/borrower/profile', cookie, { ...base, pan: bad });
    const r2 = (r.body?.error?.details?.failures ?? []).map((f: { rule: string }) => f.rule);
    check(`invalid PAN ${JSON.stringify(bad)} → 422 [PAN]`, r.status === 422 && JSON.stringify(r2) === '["PAN"]', r.body);
  }

  // Salary boundary (paise).
  const s1 = await put(app, '/borrower/profile', cookie, { ...base, monthlySalary: 2_499_999 });
  check('salary 2,499,999 paise → 422 [SALARY]', s1.status === 422 && s1.body.error.details.failures.length === 1 && s1.body.error.details.failures[0].rule === 'SALARY', s1.body);
  const s2 = await put(app, '/borrower/profile', cookie, { ...base, monthlySalary: 2_500_000 });
  check('salary 2,500,000 paise → 200', s2.status === 200, s2.body);
  const s3 = await put(app, '/borrower/profile', cookie, { ...base, monthlySalary: 2_500_000.5 });
  check('salary with fractional paise → 400', s3.status === 400, s3.body);

  // Age boundaries relative to the real IST today.
  const ageCases: [string, string, number][] = [
    ['exactly 23 today', shiftYears(today, -23), 200],
    ['day before 23rd birthday', shiftYears(today, -23, 1), 422],
    ['50y + 364d', shiftYears(today, -51, 1), 200],
    ['exactly 51 today', shiftYears(today, -51), 422],
  ];
  for (const [label, dob, expected] of ageCases) {
    const r = await put(app, '/borrower/profile', cookie, { ...base, dateOfBirth: dob });
    check(`age ${label} (dob ${dob}) → ${expected}`, r.status === expected, r.body);
  }
  const future = await put(app, '/borrower/profile', cookie, { ...base, dateOfBirth: shiftYears(today, 0, 1) });
  check('future DOB → 400 VALIDATION_ERROR (rejected by the schema, not the BRE)', future.status === 400, future.body);
  note(`future DOB body: ${JSON.stringify(future.body)}`);
  const futureAllBad = await put(app, '/borrower/profile', cookie, {
    ...base,
    dateOfBirth: shiftYears(today, 1),
    monthlySalary: 100,
    pan: 'X',
    employmentMode: 'UNEMPLOYED',
  });
  note(`future DOB + all other rules failing → ${futureAllBad.status} ${JSON.stringify(futureAllBad.body)}`);
  const feb30 = await put(app, '/borrower/profile', cookie, { ...base, dateOfBirth: '2000-02-30' });
  check('impossible date 2000-02-30 → 400', feb30.status === 400, feb30.body);
  const feb29nonleap = await put(app, '/borrower/profile', cookie, { ...base, dateOfBirth: '2001-02-29' });
  check('impossible date 2001-02-29 → 400', feb29nonleap.status === 400, feb29nonleap.body);
  const feb29 = await put(app, '/borrower/profile', cookie, { ...base, dateOfBirth: '2000-02-29' });
  check('valid leap DOB 2000-02-29 → 200', feb29.status === 200, feb29.body);

  // Apply-time re-check: eligible + slip, then the stored DOB ages past 50 (simulating time).
  await put(app, '/borrower/profile', cookie, base);
  const up = await uploadPdf(app, cookie);
  check('slip upload → 201', up.status === 201, up.body);
  const user = await mongoose.connection.db?.collection('users').findOne({ email: 'd1@audit.dev' });
  await BorrowerProfileModel.updateOne(
    { userId: user?._id },
    { $set: { dateOfBirth: new RealDate(`${shiftYears(today, -51)}T00:00:00.000Z`) } },
  );
  const apply = await post(app, '/borrower/loans', cookie, { principal: 10_000_000, tenureDays: 90 });
  check('apply after the borrower aged out → 422 BRE_FAILED [AGE]', apply.status === 422 && apply.body.error.code === 'BRE_FAILED' && apply.body.error.details.failures[0].rule === 'AGE', apply.body);
  const stored = await BorrowerProfileModel.findOne({ userId: user?._id });
  check('apply-time BRE failure saved to profile.breResult', stored?.breResult.isEligible === false, stored?.breResult);
  check('no loan created on apply-time BRE failure', (await LoanModel.countDocuments({})) === 0);
  const prog = await get(app, '/borrower/progress', cookie);
  check('progress after aging out → currentStep PROFILE, isEligible false', prog.body.data.currentStep === 'PROFILE' && prog.body.data.isEligible === false, prog.body.data);

  // IST midnight edge through the API with a shifted clock (DOB 2003-10-10 turns 23 on 2026-10-10).
  globalThis.Date = ShiftedDate as DateConstructor;
  const edgeCookie = await signup(app, 'd1edge@audit.dev');
  setClock('2026-10-09T18:29:59.000Z');
  const before = await put(app, '/borrower/profile', edgeCookie, { ...base, dateOfBirth: '2003-10-10' });
  check('clock 2026-10-09T18:29:59Z (23:59:59 IST) → 422 AGE (still 22)', before.status === 422 && before.body.error.details.failures[0].rule === 'AGE', before.body);
  setClock('2026-10-09T18:30:01.000Z');
  const after = await put(app, '/borrower/profile', edgeCookie, { ...base, dateOfBirth: '2003-10-10' });
  check('clock 2026-10-09T18:30:01Z (00:00:01 IST) → 200 (23 today)', after.status === 200, after.body);
  // Future-DOB check uses the IST date too: at 18:30:01Z on the 9th, 2026-10-10 is "today", not future.
  const dobToday = await put(app, '/borrower/profile', edgeCookie, { ...base, dateOfBirth: '2026-10-10' });
  check('DOB = IST today (2026-10-10) at 18:30:01Z on the 9th → 422 AGE, not 400 future', dobToday.status === 422, dobToday.body);
  setClock('2026-10-09T18:29:59.000Z');
  const dobTomorrow = await put(app, '/borrower/profile', edgeCookie, { ...base, dateOfBirth: '2026-10-10' });
  check('DOB 2026-10-10 at 18:29:59Z on the 9th → 400 future', dobTomorrow.status === 400, dobTomorrow.body);
  setClock(null);
  globalThis.Date = RealDate;
} finally {
  globalThis.Date = RealDate;
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
