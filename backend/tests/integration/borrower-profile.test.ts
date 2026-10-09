import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { BorrowerProfileModel } from '../../src/models/borrower-profile.model.js';
import { createTestUser } from '../helpers/auth.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, prepareBorrowerToApply } from '../helpers/borrower.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const PROFILE_URL = '/api/v1/borrower/profile';
const PROGRESS_URL = '/api/v1/borrower/progress';

describe('borrower profile and BRE', () => {
  const app = createApp();

  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  it('starts a new borrower at the PROFILE step', async () => {
    const borrower = await createTestUser('BORROWER');

    const response = await request(app).get(PROGRESS_URL).set('Cookie', borrower.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      currentStep: 'PROFILE',
      isEligible: false,
      profile: null,
      latestLoan: null,
    });
  });

  it('saves an eligible profile and moves the borrower to the salary slip step', async () => {
    const borrower = await createTestUser('BORROWER');

    const response = await request(app)
      .put(PROFILE_URL)
      .set('Cookie', borrower.cookie)
      .send({ ...ELIGIBLE_PROFILE, pan: ' abcde1234f ' });

    expect(response.status).toBe(200);
    expect(response.body.data.profile).toMatchObject({
      fullName: 'Riya Sharma',
      pan: 'ABCDE1234F',
      dateOfBirth: '1995-06-15',
      monthlySalary: 5_000_000,
      employmentMode: 'SALARIED',
      breResult: { isEligible: true, failures: [] },
      salarySlip: null,
    });

    const progress = await request(app).get(PROGRESS_URL).set('Cookie', borrower.cookie);
    expect(progress.body.data.currentStep).toBe('SALARY_SLIP');
  });

  it('returns 422 with every BRE failure and still saves the profile for Sales', async () => {
    const borrower = await createTestUser('BORROWER');

    const response = await request(app).put(PROFILE_URL).set('Cookie', borrower.cookie).send({
      fullName: 'Young Applicant',
      pan: 'BAD',
      dateOfBirth: '2010-01-01',
      monthlySalary: 1_000_000,
      employmentMode: 'UNEMPLOYED',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('BRE_FAILED');
    expect(response.body.error.details.failures).toEqual([
      expect.objectContaining({ rule: 'AGE' }),
      expect.objectContaining({ rule: 'SALARY' }),
      expect.objectContaining({ rule: 'PAN' }),
      expect.objectContaining({ rule: 'EMPLOYMENT' }),
    ]);

    const saved = await BorrowerProfileModel.findOne({ userId: borrower.id });
    expect(saved?.breResult.isEligible).toBe(false);
    expect(saved?.breResult.failures).toHaveLength(4);

    const progress = await request(app).get(PROGRESS_URL).set('Cookie', borrower.cookie);
    expect(progress.body.data.currentStep).toBe('PROFILE');
  });

  it.each([
    ['a date of birth in the future', { dateOfBirth: '2999-01-01' }],
    ['an invalid date', { dateOfBirth: '2001-02-30' }],
    ['a salary in rupees with decimals', { monthlySalary: 25000.5 }],
    ['an unknown employment mode', { employmentMode: 'STUDENT' }],
    ['an unknown field', { role: 'ADMIN' }],
  ])('rejects %s with 400', async (_case, override) => {
    const borrower = await createTestUser('BORROWER');

    const response = await request(app)
      .put(PROFILE_URL)
      .set('Cookie', borrower.cookie)
      .send({ ...ELIGIBLE_PROFILE, ...override });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('locks the profile while the borrower has an active loan', async () => {
    const borrower = await createTestUser('BORROWER');
    await prepareBorrowerToApply(app, borrower.cookie);
    await request(app)
      .post('/api/v1/borrower/loans')
      .set('Cookie', borrower.cookie)
      .send(LOAN_REQUEST);

    const response = await request(app)
      .put(PROFILE_URL)
      .set('Cookie', borrower.cookie)
      .send({ ...ELIGIBLE_PROFILE, fullName: 'Changed Name' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ACTIVE_LOAN_EXISTS');
  });

  it.each(['ADMIN', 'SANCTION', 'SALES'] as const)(
    'returns 403 for %s (borrower routes are borrower-only)',
    async (role) => {
      const staff = await createTestUser(role);

      const progress = await request(app).get(PROGRESS_URL).set('Cookie', staff.cookie);
      const save = await request(app)
        .put(PROFILE_URL)
        .set('Cookie', staff.cookie)
        .send(ELIGIBLE_PROFILE);

      expect(progress.status).toBe(403);
      expect(save.status).toBe(403);
    },
  );

  it('returns 401 without a session', async () => {
    expect((await request(app).get(PROGRESS_URL)).status).toBe(401);
    expect((await request(app).put(PROFILE_URL).send(ELIGIBLE_PROFILE)).status).toBe(401);
  });
});
