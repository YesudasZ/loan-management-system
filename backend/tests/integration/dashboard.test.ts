import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestUser } from '../helpers/auth.js';
import { ELIGIBLE_PROFILE, saveEligibleProfile, uploadPdfSlip } from '../helpers/borrower.js';
import {
  createAppliedLoan,
  createDisbursedLoan,
  createStaff,
  type StaffUsers,
} from '../helpers/loans.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

describe('dashboard: sales leads and admin summary', () => {
  const app = createApp();
  let staff: StaffUsers;

  beforeAll(startTestDatabase);
  beforeEach(async () => {
    staff = await createStaff();
  });
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  async function createLeadsInEveryStage() {
    await createTestUser('BORROWER', 'new@test.dev');

    const failed = await createTestUser('BORROWER', 'failed@test.dev');
    await request(app)
      .put('/api/v1/borrower/profile')
      .set('Cookie', failed.cookie)
      .send({ ...ELIGIBLE_PROFILE, employmentMode: 'UNEMPLOYED' });

    const noSlip = await createTestUser('BORROWER', 'noslip@test.dev');
    await saveEligibleProfile(app, noSlip.cookie);

    const ready = await createTestUser('BORROWER', 'ready@test.dev');
    await saveEligibleProfile(app, ready.cookie);
    await uploadPdfSlip(app, ready.cookie);
  }

  describe('GET /leads', () => {
    it('lists borrowers without a loan, with their stage and BRE failures', async () => {
      await createLeadsInEveryStage();

      const response = await request(app).get('/api/v1/leads').set('Cookie', staff.SALES.cookie);

      expect(response.status).toBe(200);
      const stages = Object.fromEntries(
        response.body.data.items.map((lead: { email: string; stage: string }) => [
          lead.email,
          lead.stage,
        ]),
      );
      expect(stages).toEqual({
        'new@test.dev': 'PROFILE_PENDING',
        'failed@test.dev': 'BRE_FAILED',
        'noslip@test.dev': 'SALARY_SLIP_PENDING',
        'ready@test.dev': 'READY_TO_APPLY',
      });
      const failed = response.body.data.items.find(
        (lead: { email: string }) => lead.email === 'failed@test.dev',
      );
      expect(failed.breFailures).toEqual([expect.objectContaining({ rule: 'EMPLOYMENT' })]);
    });

    it('leaves out borrowers who have applied (any status) and staff', async () => {
      await createAppliedLoan(app);
      await createDisbursedLoan(app, staff);
      await createTestUser('BORROWER', 'lead@test.dev');

      const response = await request(app).get('/api/v1/leads').set('Cookie', staff.SALES.cookie);

      expect(response.body.data.items.map((lead: { email: string }) => lead.email)).toEqual([
        'lead@test.dev',
      ]);
      expect(response.body.data.pagination.totalItems).toBe(1);
    });

    it('paginates, newest first', async () => {
      for (const name of ['a', 'b', 'c']) {
        await createTestUser('BORROWER', `${name}@test.dev`);
      }

      const firstPage = await request(app)
        .get('/api/v1/leads?page=1&limit=2')
        .set('Cookie', staff.SALES.cookie);
      const secondPage = await request(app)
        .get('/api/v1/leads?page=2&limit=2')
        .set('Cookie', staff.SALES.cookie);

      expect(firstPage.body.data.items.map((lead: { email: string }) => lead.email)).toEqual([
        'c@test.dev',
        'b@test.dev',
      ]);
      expect(secondPage.body.data.items.map((lead: { email: string }) => lead.email)).toEqual([
        'a@test.dev',
      ]);
      expect(firstPage.body.data.pagination).toEqual({
        page: 1,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
      });
    });

    it('is open to SALES and ADMIN only', async () => {
      const borrower = await createTestUser('BORROWER');

      expect(
        (await request(app).get('/api/v1/leads').set('Cookie', staff.ADMIN.cookie)).status,
      ).toBe(200);
      for (const user of [staff.SANCTION, staff.DISBURSEMENT, staff.COLLECTION, borrower]) {
        expect((await request(app).get('/api/v1/leads').set('Cookie', user.cookie)).status).toBe(
          403,
        );
      }
      expect((await request(app).get('/api/v1/leads')).status).toBe(401);
    });
  });

  describe('GET /dashboard/summary', () => {
    it('counts loans per status (zero-filled) and open leads', async () => {
      await createAppliedLoan(app);
      await createAppliedLoan(app);
      await createDisbursedLoan(app, staff);
      await createTestUser('BORROWER', 'lead@test.dev');

      const response = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', staff.ADMIN.cookie);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        loansByStatus: { APPLIED: 2, SANCTIONED: 0, REJECTED: 0, DISBURSED: 1, CLOSED: 0 },
        leadCount: 1,
      });
    });

    it('is ADMIN only', async () => {
      for (const user of [staff.SALES, staff.SANCTION, staff.DISBURSEMENT, staff.COLLECTION]) {
        const response = await request(app)
          .get('/api/v1/dashboard/summary')
          .set('Cookie', user.cookie);
        expect(response.status).toBe(403);
      }
      expect((await request(app).get('/api/v1/dashboard/summary')).status).toBe(401);
    });
  });
});
