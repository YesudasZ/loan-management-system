import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { BorrowerProfileModel } from '../../src/models/borrower-profile.model.js';
import { LoanModel } from '../../src/models/loan.model.js';
import { calendarDateToUtcMidnight, toBusinessDate } from '../../src/utils/dates.js';
import { createTestUser } from '../helpers/auth.js';
import { LOAN_REQUEST, prepareBorrowerToApply, saveEligibleProfile } from '../helpers/borrower.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const APPLY_URL = '/api/v1/borrower/loans';
const PROGRESS_URL = '/api/v1/borrower/progress';

describe('loan application', () => {
  const app = createApp();

  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  async function readyBorrower(email?: string) {
    const borrower = await createTestUser('BORROWER', email);
    await prepareBorrowerToApply(app, borrower.cookie);
    return borrower;
  }

  it('creates an APPLIED loan with interest and totals calculated on the server', async () => {
    const borrower = await readyBorrower();

    const response = await request(app)
      .post(APPLY_URL)
      .set('Cookie', borrower.cookie)
      .send(LOAN_REQUEST);

    expect(response.status).toBe(201);
    expect(response.body.data.loan).toMatchObject({
      principal: 10_000_000,
      tenureDays: 90,
      annualInterestRate: 12,
      simpleInterest: 295_890,
      totalRepayment: 10_295_890,
      totalPaid: 0,
      outstanding: 10_295_890,
      status: 'APPLIED',
      rejectionReason: null,
      statusHistory: [{ from: null, to: 'APPLIED', byRole: 'BORROWER', note: null }],
    });
    // Borrowers never receive other users' ids.
    expect(JSON.stringify(response.body)).not.toContain('"by"');

    const stored = await LoanModel.findOne({ borrowerId: borrower.id });
    expect(stored?.applicant).toMatchObject({ fullName: 'Riya Sharma', pan: 'ABCDE1234F' });
    expect(stored?.salarySlip.contentType).toBe('application/pdf');
  });

  it('moves the borrower to the STATUS step with the new loan', async () => {
    const borrower = await readyBorrower();
    await request(app).post(APPLY_URL).set('Cookie', borrower.cookie).send(LOAN_REQUEST);

    const progress = await request(app).get(PROGRESS_URL).set('Cookie', borrower.cookie);

    expect(progress.body.data.currentStep).toBe('STATUS');
    expect(progress.body.data.latestLoan.status).toBe('APPLIED');
  });

  it('rejects client-sent totals instead of trusting them', async () => {
    const borrower = await readyBorrower();

    const response = await request(app)
      .post(APPLY_URL)
      .set('Cookie', borrower.cookie)
      .send({ ...LOAN_REQUEST, totalRepayment: 1 });

    expect(response.status).toBe(400);
    expect(await LoanModel.countDocuments()).toBe(0);
  });

  it.each([
    ['an amount below ₹50,000', { principal: 4_999_900 }],
    ['an amount above ₹5,00,000', { principal: 50_000_100 }],
    ['an amount with paise', { principal: 10_000_050 }],
    ['a tenure below 30 days', { tenureDays: 29 }],
    ['a tenure above 365 days', { tenureDays: 366 }],
  ])('rejects %s with 400', async (_case, override) => {
    const borrower = await readyBorrower();

    const response = await request(app)
      .post(APPLY_URL)
      .set('Cookie', borrower.cookie)
      .send({ ...LOAN_REQUEST, ...override });

    expect(response.status).toBe(400);
  });

  it('requires a salary slip', async () => {
    const borrower = await createTestUser('BORROWER');
    await saveEligibleProfile(app, borrower.cookie);

    const response = await request(app)
      .post(APPLY_URL)
      .set('Cookie', borrower.cookie)
      .send(LOAN_REQUEST);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('allows only one active loan (friendly check before the database index)', async () => {
    const borrower = await readyBorrower();
    await request(app).post(APPLY_URL).set('Cookie', borrower.cookie).send(LOAN_REQUEST);

    const second = await request(app)
      .post(APPLY_URL)
      .set('Cookie', borrower.cookie)
      .send(LOAN_REQUEST);

    expect(second.status).toBe(409);
    expect(second.body.error).toEqual({
      code: 'ACTIVE_LOAN_EXISTS',
      message: 'You already have an active loan application.',
    });
  });

  it('lets only one of two simultaneous applications through (database index)', async () => {
    const borrower = await readyBorrower();

    const responses = await Promise.all([
      request(app).post(APPLY_URL).set('Cookie', borrower.cookie).send(LOAN_REQUEST),
      request(app).post(APPLY_URL).set('Cookie', borrower.cookie).send(LOAN_REQUEST),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await LoanModel.countDocuments({ borrowerId: borrower.id })).toBe(1);
  });

  it('re-runs the BRE at apply time and saves the new result when it now fails', async () => {
    const borrower = await readyBorrower();
    // Make the stored date of birth 51 years ago today, while the stored result still says eligible.
    const today = toBusinessDate();
    const fiftyOneYearsAgo = `${Number(today.slice(0, 4)) - 51}${today.slice(4)}`;
    await BorrowerProfileModel.updateOne(
      { userId: borrower.id },
      { $set: { dateOfBirth: calendarDateToUtcMidnight(fiftyOneYearsAgo) } },
    );

    const response = await request(app)
      .post(APPLY_URL)
      .set('Cookie', borrower.cookie)
      .send(LOAN_REQUEST);

    expect(response.status).toBe(422);
    expect(response.body.error.details.failures).toEqual([
      expect.objectContaining({ rule: 'AGE' }),
    ]);
    const profile = await BorrowerProfileModel.findOne({ userId: borrower.id });
    expect(profile?.breResult.isEligible).toBe(false);
    const progress = await request(app).get(PROGRESS_URL).set('Cookie', borrower.cookie);
    expect(progress.body.data.currentStep).toBe('PROFILE');
  });

  it('returns 403 for staff (including ADMIN) and 401 without a session', async () => {
    const admin = await createTestUser('ADMIN');

    const asAdmin = await request(app)
      .post(APPLY_URL)
      .set('Cookie', admin.cookie)
      .send(LOAN_REQUEST);
    const anonymous = await request(app).post(APPLY_URL).send(LOAN_REQUEST);

    expect(asAdmin.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});
