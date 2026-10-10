import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { LoanModel } from '../../src/models/loan.model.js';
import {
  createAppliedLoan,
  createDisbursedLoan,
  createSanctionedLoan,
  createStaff,
  type StaffUsers,
} from '../helpers/loans.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const RANDOM_ID = '64b7f0c2a1b2c3d4e5f60718';

describe('operations: loan queues and status changes', () => {
  const app = createApp();
  let staff: StaffUsers;

  beforeAll(startTestDatabase);
  beforeEach(async () => {
    staff = await createStaff();
  });
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  describe('GET /loans', () => {
    it("gives each executive only their module's queue, with masked PANs", async () => {
      await createAppliedLoan(app);
      await createSanctionedLoan(app, staff);

      const sanction = await request(app).get('/api/v1/loans').set('Cookie', staff.SANCTION.cookie);
      const disbursement = await request(app)
        .get('/api/v1/loans')
        .set('Cookie', staff.DISBURSEMENT.cookie);

      expect(sanction.status).toBe(200);
      expect(sanction.body.data.items).toHaveLength(1);
      expect(sanction.body.data.items[0]).toMatchObject({
        status: 'APPLIED',
        applicant: { fullName: 'Riya Sharma', panMasked: 'ABCDE****F' },
        borrower: { name: 'Test BORROWER' },
      });
      expect(JSON.stringify(sanction.body)).not.toContain('ABCDE1234F');
      expect(sanction.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
      });
      expect(disbursement.body.data.items.map((loan: { status: string }) => loan.status)).toEqual([
        'SANCTIONED',
      ]);
    });

    it("returns 403 when an executive asks for another module's status", async () => {
      const response = await request(app)
        .get('/api/v1/loans?status=DISBURSED')
        .set('Cookie', staff.SANCTION.cookie);

      expect(response.status).toBe(403);
    });

    it('lets ADMIN list every status, or filter by one', async () => {
      await createAppliedLoan(app);
      await createSanctionedLoan(app, staff);

      const all = await request(app).get('/api/v1/loans').set('Cookie', staff.ADMIN.cookie);
      const sanctioned = await request(app)
        .get('/api/v1/loans?status=SANCTIONED&page=1&limit=5')
        .set('Cookie', staff.ADMIN.cookie);

      expect(all.body.data.pagination.totalItems).toBe(2);
      expect(sanctioned.body.data.items).toHaveLength(1);
      expect(sanctioned.body.data.pagination.limit).toBe(5);
    });

    it('rejects invalid query parameters', async () => {
      const tooMany = await request(app)
        .get('/api/v1/loans?limit=500')
        .set('Cookie', staff.ADMIN.cookie);
      const unknown = await request(app)
        .get('/api/v1/loans?sort=principal')
        .set('Cookie', staff.ADMIN.cookie);

      expect(tooMany.status).toBe(400);
      expect(unknown.status).toBe(400);
    });

    it.each(['BORROWER', 'SALES'] as const)('returns 403 for %s', async (role) => {
      const user = role === 'SALES' ? staff.SALES : (await createAppliedLoan(app)).borrower;
      const response = await request(app).get('/api/v1/loans').set('Cookie', user.cookie);
      expect(response.status).toBe(403);
    });
  });

  describe('GET /loans/:loanId', () => {
    it('shows the sanction team the applicant, BRE result, slip details and history', async () => {
      const { loanId } = await createAppliedLoan(app);

      const response = await request(app)
        .get(`/api/v1/loans/${loanId}`)
        .set('Cookie', staff.SANCTION.cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.loan).toMatchObject({
        id: loanId,
        status: 'APPLIED',
        applicant: {
          panMasked: 'ABCDE****F',
          dateOfBirth: '1995-06-15',
          monthlySalary: 5_000_000,
          employmentMode: 'SALARIED',
          breResult: { isEligible: true, failures: [] },
        },
        salarySlip: { contentType: 'application/pdf' },
        statusHistory: [{ to: 'APPLIED', by: { name: 'Test BORROWER', role: 'BORROWER' } }],
      });
    });

    it("returns 404 for a loan outside the viewer's module, as if it didn't exist", async () => {
      const { loanId } = await createAppliedLoan(app);

      const response = await request(app)
        .get(`/api/v1/loans/${loanId}`)
        .set('Cookie', staff.DISBURSEMENT.cookie);

      expect(response.status).toBe(404);
    });

    it('returns 404 for an unknown id and 400 for an invalid one', async () => {
      const unknown = await request(app)
        .get(`/api/v1/loans/${RANDOM_ID}`)
        .set('Cookie', staff.ADMIN.cookie);
      const invalid = await request(app)
        .get('/api/v1/loans/not-an-id')
        .set('Cookie', staff.ADMIN.cookie);

      expect(unknown.status).toBe(404);
      expect(invalid.status).toBe(400);
    });
  });

  describe('approve / reject', () => {
    it('approves an APPLIED loan and records who did it', async () => {
      const { loanId } = await createAppliedLoan(app);

      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Cookie', staff.SANCTION.cookie)
        .send({ note: 'Documents verified' });

      expect(response.status).toBe(200);
      expect(response.body.data.loan.status).toBe('SANCTIONED');
      expect(response.body.data.loan.statusHistory.at(-1)).toMatchObject({
        from: 'APPLIED',
        to: 'SANCTIONED',
        note: 'Documents verified',
        by: { name: 'Test SANCTION', role: 'SANCTION' },
      });
    });

    it('returns 409 for a second approval (invalid transition)', async () => {
      const { loanId } = await createSanctionedLoan(app, staff);

      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Cookie', staff.SANCTION.cookie);

      expect(response.status).toBe(409);
      expect(response.body.error).toEqual({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Cannot approve a loan that is SANCTIONED',
      });
    });

    it('lets only one of two simultaneous approvals succeed', async () => {
      const { loanId } = await createAppliedLoan(app);

      const responses = await Promise.all([
        request(app).post(`/api/v1/loans/${loanId}/approve`).set('Cookie', staff.SANCTION.cookie),
        request(app).post(`/api/v1/loans/${loanId}/approve`).set('Cookie', staff.ADMIN.cookie),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const loan = await LoanModel.findById(loanId);
      expect(loan?.statusHistory).toHaveLength(2);
    });

    it('requires a reason to reject, and shows it to the borrower', async () => {
      const { loanId, borrower } = await createAppliedLoan(app);

      const withoutReason = await request(app)
        .post(`/api/v1/loans/${loanId}/reject`)
        .set('Cookie', staff.SANCTION.cookie)
        .send({ reason: ' ' });
      const rejected = await request(app)
        .post(`/api/v1/loans/${loanId}/reject`)
        .set('Cookie', staff.SANCTION.cookie)
        .send({ reason: 'Salary slip does not match the declared salary' });
      const progress = await request(app)
        .get('/api/v1/borrower/progress')
        .set('Cookie', borrower.cookie);

      expect(withoutReason.status).toBe(400);
      expect(rejected.status).toBe(200);
      expect(progress.body.data.latestLoan).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Salary slip does not match the declared salary',
      });
    });

    it('returns 404 for an unknown loan id', async () => {
      const response = await request(app)
        .post(`/api/v1/loans/${RANDOM_ID}/approve`)
        .set('Cookie', staff.SANCTION.cookie);
      expect(response.status).toBe(404);
    });

    it('returns 403 for roles that cannot approve, including COLLECTION', async () => {
      const { loanId, borrower } = await createAppliedLoan(app);

      for (const user of [staff.COLLECTION, staff.DISBURSEMENT, staff.SALES, borrower]) {
        const response = await request(app)
          .post(`/api/v1/loans/${loanId}/approve`)
          .set('Cookie', user.cookie);
        expect(response.status).toBe(403);
      }
      expect((await request(app).post(`/api/v1/loans/${loanId}/approve`)).status).toBe(401);
    });
  });

  describe('disburse', () => {
    it('marks a SANCTIONED loan disbursed, storing when and by whom (no body needed)', async () => {
      const { loanId } = await createSanctionedLoan(app, staff);

      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/disburse`)
        .set('Cookie', staff.DISBURSEMENT.cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.loan.status).toBe('DISBURSED');
      expect(response.body.data.loan.disbursedAt).toEqual(expect.any(String));
      const stored = await LoanModel.findById(loanId);
      expect(stored?.disbursedBy?.toString()).toBe(staff.DISBURSEMENT.id);
    });

    it('returns 409 for a loan that is not SANCTIONED', async () => {
      const { loanId } = await createAppliedLoan(app);

      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/disburse`)
        .set('Cookie', staff.DISBURSEMENT.cookie);

      expect(response.status).toBe(409);
    });

    it('returns 403 for the sanction team', async () => {
      const { loanId } = await createSanctionedLoan(app, staff);
      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/disburse`)
        .set('Cookie', staff.SANCTION.cookie);
      expect(response.status).toBe(403);
    });
  });

  describe('GET /loans/:loanId/salary-slip', () => {
    it('lets the sanction team view the slip of an APPLIED loan only', async () => {
      const { loanId } = await createAppliedLoan(app);

      const whileApplied = await request(app)
        .get(`/api/v1/loans/${loanId}/salary-slip`)
        .set('Cookie', staff.SANCTION.cookie);
      await request(app)
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Cookie', staff.SANCTION.cookie);
      const afterApproval = await request(app)
        .get(`/api/v1/loans/${loanId}/salary-slip`)
        .set('Cookie', staff.SANCTION.cookie);
      const asAdmin = await request(app)
        .get(`/api/v1/loans/${loanId}/salary-slip`)
        .set('Cookie', staff.ADMIN.cookie);

      expect(whileApplied.status).toBe(200);
      expect(whileApplied.headers['content-type']).toBe('application/pdf');
      expect(afterApproval.status).toBe(404);
      expect(asAdmin.status).toBe(200);
    });

    it('returns 403 for other modules', async () => {
      const { loanId } = await createDisbursedLoan(app, staff);
      const response = await request(app)
        .get(`/api/v1/loans/${loanId}/salary-slip`)
        .set('Cookie', staff.COLLECTION.cookie);
      expect(response.status).toBe(403);
    });
  });
});
