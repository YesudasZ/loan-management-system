// Lens D5 edge: the stored BRE result vs the fresh one. A borrower who was 22 when they saved
// their details and comes back after turning 23 (no profile change).
import { check, get, note, put, signup, start, stop, summary, uploadPdf } from './harness.js';

const RealDate = Date;
let offset = 0;
class ShiftedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [string]));
  }
  static override now(): number {
    return RealDate.now() + offset;
  }
}

const app = await start();
try {
  globalThis.Date = ShiftedDate as DateConstructor;
  // Day 1 (2026-10-09 IST): DOB 2003-10-10 → 22, BRE fails on AGE only.
  offset = new RealDate('2026-10-09T06:00:00.000Z').getTime() - RealDate.now();
  const cookie = await signup(app, 'stale@audit.dev');
  const saved = await put(app, '/borrower/profile', cookie, {
    fullName: 'Stale Bre', pan: 'ABCDE1234F', dateOfBirth: '2003-10-10', monthlySalary: 4_500_000, employmentMode: 'SALARIED',
  });
  check('day 1: profile saved with 422 [AGE]', saved.status === 422 && saved.body.error.details.failures[0].rule === 'AGE', saved.body);
  // Day 2 (2026-10-10 IST): they are 23 now, nothing else changed.
  offset = new RealDate('2026-10-09T19:00:00.000Z').getTime() - RealDate.now();
  const progress = await get(app, '/borrower/progress', cookie);
  note(`day 2 progress: currentStep=${progress.body.data.currentStep} isEligible=${progress.body.data.isEligible} stored breResult.isEligible=${progress.body.data.profile.breResult.isEligible}`);
  const upload = await uploadPdf(app, cookie);
  note(`day 2 slip upload → ${upload.status} ${JSON.stringify(upload.body?.error ?? upload.body?.data)}`);
  check('day 2: progress sends them to SALARY_SLIP and the upload is accepted', progress.body.data.currentStep === 'SALARY_SLIP' && upload.status === 201, { step: progress.body.data.currentStep, upload: upload.status });
  const resave = await put(app, '/borrower/profile', cookie, {
    fullName: 'Stale Bre', pan: 'ABCDE1234F', dateOfBirth: '2003-10-10', monthlySalary: 4_500_000, employmentMode: 'SALARIED',
  });
  const uploadAfter = await uploadPdf(app, cookie);
  note(`after re-saving the same details: PUT → ${resave.status}, upload → ${uploadAfter.status}`);
} finally {
  globalThis.Date = RealDate;
  await stop();
}
process.exitCode = summary() > 0 ? 1 : 0;
