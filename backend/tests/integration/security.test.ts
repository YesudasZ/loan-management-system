import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestUser, type TestUser } from '../helpers/auth.js';
import { ELIGIBLE_PROFILE, LOAN_REQUEST, prepareBorrowerToApply } from '../helpers/borrower.js';
import { createDisbursedLoan, createStaff, type StaffUsers } from '../helpers/loans.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

const ALLOWED_ORIGIN = 'http://localhost:3000';

describe('security', () => {
  const app = createApp();
  let staff: StaffUsers;
  let alice: TestUser; // has a profile, slip and an APPLIED loan
  let bob: TestUser; // brand new borrower
  let aliceLoanId: string;

  beforeAll(async () => {
    await startTestDatabase();
    staff = await createStaff();
    alice = await createTestUser('BORROWER', 'alice@test.dev');
    bob = await createTestUser('BORROWER', 'bob@test.dev');
    await prepareBorrowerToApply(app, alice.cookie);
    const applied = await request(app)
      .post('/api/v1/borrower/loans')
      .set('Cookie', alice.cookie)
      .send(LOAN_REQUEST);
    aliceLoanId = applied.body.data.loan.id as string;
  });
  afterAll(stopTestDatabase);

  describe('IDOR: one borrower can never reach another borrower’s data', () => {
    it("returns only Bob's own (empty) progress, never Alice's", async () => {
      const response = await request(app)
        .get('/api/v1/borrower/progress')
        .set('Cookie', bob.cookie);

      expect(response.body.data).toMatchObject({ profile: null, latestLoan: null });
      expect(JSON.stringify(response.body)).not.toContain('ABCDE1234F');
    });

    it("doesn't serve Alice's salary slip to Bob", async () => {
      const response = await request(app)
        .get('/api/v1/borrower/salary-slip')
        .set('Cookie', bob.cookie);
      expect(response.status).toBe(404);
    });

    it.each([
      ['GET', `/api/v1/loans/{id}`],
      ['GET', `/api/v1/loans/{id}/salary-slip`],
      ['GET', `/api/v1/loans/{id}/payments`],
      ['POST', `/api/v1/loans/{id}/approve`],
    ])("blocks Bob from %s %s on Alice's loan (403, before any lookup)", async (method, path) => {
      const url = path.replace('{id}', aliceLoanId);
      const call = method === 'GET' ? request(app).get(url) : request(app).post(url);
      const response = await call.set('Cookie', bob.cookie);

      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('Riya');
    });

    it("lets Bob's edits touch only Bob's records", async () => {
      await request(app)
        .put('/api/v1/borrower/profile')
        .set('Cookie', bob.cookie)
        .send({ ...ELIGIBLE_PROFILE, fullName: 'Bob Builder' });

      const aliceProgress = await request(app)
        .get('/api/v1/borrower/progress')
        .set('Cookie', alice.cookie);
      expect(aliceProgress.body.data.profile.fullName).toBe('Riya Sharma');
      expect(aliceProgress.body.data.latestLoan.id).toBe(aliceLoanId);
    });

    it('hides loans outside an executive’s module (404, as if missing)', async () => {
      const { loanId } = await createDisbursedLoan(app, staff);

      const response = await request(app)
        .get(`/api/v1/loans/${loanId}`)
        .set('Cookie', staff.SANCTION.cookie);

      expect(response.status).toBe(404);
    });
  });

  describe('injection and mass assignment', () => {
    it.each([
      ['an operator in a query parameter', '/api/v1/loans?status[$ne]=APPLIED'],
      ['an operator in the page number', '/api/v1/leads?page[$gt]=0'],
      ['an unknown query parameter', '/api/v1/loans?borrowerId=64b7f0c2a1b2c3d4e5f60718'],
    ])('rejects %s with 400', async (_case, url) => {
      const response = await request(app).get(url).set('Cookie', staff.ADMIN.cookie);
      expect(response.status).toBe(400);
    });

    it.each([
      [
        'an operator object as the PAN',
        '/api/v1/borrower/profile',
        'put',
        { ...ELIGIBLE_PROFILE, pan: { $ne: null } },
      ],
      [
        'a userId on the profile',
        '/api/v1/borrower/profile',
        'put',
        { ...ELIGIBLE_PROFILE, userId: 'x' },
      ],
      [
        'a pre-set BRE result',
        '/api/v1/borrower/profile',
        'put',
        { ...ELIGIBLE_PROFILE, breResult: { isEligible: true } },
      ],
      [
        'a status on a new loan',
        '/api/v1/borrower/loans',
        'post',
        { ...LOAN_REQUEST, status: 'DISBURSED' },
      ],
      [
        'an operator as the amount',
        '/api/v1/borrower/loans',
        'post',
        { principal: { $gt: 0 }, tenureDays: 90 },
      ],
    ] as const)('rejects %s with 400', async (_case, url, method, body) => {
      const response = await request(app)[method](url).set('Cookie', bob.cookie).send(body);
      expect(response.status).toBe(400);
    });

    it('rejects extra fields on a payment (e.g. recordedBy)', async () => {
      const { loanId } = await createDisbursedLoan(app, staff);

      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/payments`)
        .set('Cookie', staff.COLLECTION.cookie)
        .send({ utr: 'UTRMASS0001', amount: 100, paymentDate: '2026-01-01', recordedBy: bob.id });

      expect(response.status).toBe(400);
    });
  });

  describe('CORS', () => {
    it('allows the configured frontend origin with credentials', async () => {
      const response = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('gives other origins no CORS access', async () => {
      const response = await request(app).get('/health').set('Origin', 'https://evil.example');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
