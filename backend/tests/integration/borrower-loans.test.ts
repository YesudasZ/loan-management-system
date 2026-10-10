import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestUser, type TestUser } from '../helpers/auth.js';
import { prepareBorrowerToApply } from '../helpers/borrower.js';
import { createStaff, type StaffUsers } from '../helpers/loans.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

const LOANS_URL = '/api/v1/borrower/loans';

async function apply(app: Express, borrower: TestUser, principal: number): Promise<string> {
  const response = await request(app)
    .post(LOANS_URL)
    .set('Cookie', borrower.cookie)
    .send({ principal, tenureDays: 90 });
  if (response.status !== 201) throw new Error(`Apply failed: ${response.status}`);
  return response.body.data.loan.id as string;
}

async function reject(app: Express, staff: StaffUsers, loanId: string): Promise<void> {
  const response = await request(app)
    .post(`/api/v1/loans/${loanId}/reject`)
    .set('Cookie', staff.SANCTION.cookie)
    .send({ reason: 'Salary slip does not match the declared salary' });
  if (response.status !== 200) throw new Error(`Reject failed: ${response.status}`);
}

describe('GET /api/v1/borrower/loans and /borrower/loans/:loanId', () => {
  const app = createApp();
  let staff: StaffUsers;
  let alice: TestUser; // three loans: two rejected, then one applied (newest)
  let bob: TestUser; // one loan
  let carol: TestUser; // no loans
  const aliceLoanIds: string[] = []; // oldest first
  let bobLoanId: string;

  beforeAll(async () => {
    await startTestDatabase();
    staff = await createStaff();
    alice = await createTestUser('BORROWER', 'alice@test.dev');
    bob = await createTestUser('BORROWER', 'bob@test.dev');
    carol = await createTestUser('BORROWER', 'carol@test.dev');
    await prepareBorrowerToApply(app, alice.cookie);
    await prepareBorrowerToApply(app, bob.cookie);

    for (const principal of [5_000_000, 7_500_000]) {
      const loanId = await apply(app, alice, principal);
      await reject(app, staff, loanId);
      aliceLoanIds.push(loanId);
    }
    aliceLoanIds.push(await apply(app, alice, 10_000_000));
    bobLoanId = await apply(app, bob, 20_000_000);
  });
  afterAll(stopTestDatabase);

  describe('list', () => {
    it("returns only the borrower's own loans, newest first", async () => {
      const response = await request(app).get(LOANS_URL).set('Cookie', alice.cookie);

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((loan) => loan.id);
      expect(ids).toEqual([...aliceLoanIds].reverse());
      expect(ids).not.toContain(bobLoanId);
      expect(response.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 3,
        totalPages: 1,
      });
    });

    it('returns the borrower DTO with amounts, status and timeline, and no user ids', async () => {
      const response = await request(app).get(LOANS_URL).set('Cookie', alice.cookie);
      const [newest, middle] = response.body.data.items;

      expect(newest).toMatchObject({
        status: 'APPLIED',
        principal: 10_000_000,
        totalRepayment: 10_295_890,
        totalPaid: 0,
        outstanding: 10_295_890,
      });
      expect(middle).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Salary slip does not match the declared salary',
      });
      expect(middle.statusHistory.map((entry: { byRole: string }) => entry.byRole)).toEqual([
        'BORROWER',
        'SANCTION',
      ]);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('borrowerId');
      expect(body).not.toContain(staff.SANCTION.id);
    });

    it('paginates', async () => {
      const response = await request(app)
        .get(`${LOANS_URL}?page=2&limit=2`)
        .set('Cookie', alice.cookie);

      expect(response.body.data.items.map((loan: { id: string }) => loan.id)).toEqual([
        aliceLoanIds[0],
      ]);
      expect(response.body.data.pagination).toEqual({
        page: 2,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
      });
    });

    it('returns an empty page for a borrower with no loans', async () => {
      const response = await request(app).get(LOANS_URL).set('Cookie', carol.cookie);
      expect(response.body.data).toEqual({
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      });
    });

    it.each([
      ['limit 0', '?limit=0'],
      ['limit above the maximum', '?limit=101'],
      ['an unknown parameter', `?borrowerId=${'a'.repeat(24)}`],
      ['an operator', '?page[$gt]=0'],
    ])('rejects %s with 400', async (_case, query) => {
      const response = await request(app).get(`${LOANS_URL}${query}`).set('Cookie', alice.cookie);
      expect(response.status).toBe(400);
    });
  });

  describe('detail', () => {
    it("returns one of the borrower's own loans with its timeline", async () => {
      const response = await request(app)
        .get(`${LOANS_URL}/${aliceLoanIds[0]}`)
        .set('Cookie', alice.cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.loan).toMatchObject({ id: aliceLoanIds[0], status: 'REJECTED' });
      expect(response.body.data.loan.statusHistory).toHaveLength(2);
    });

    it("gives 404 for another borrower's loan (IDOR), revealing nothing", async () => {
      const response = await request(app)
        .get(`${LOANS_URL}/${bobLoanId}`)
        .set('Cookie', alice.cookie);

      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain('20000000');
    });

    it('gives 404 for an id that does not exist and 400 for a malformed id', async () => {
      const missing = await request(app)
        .get(`${LOANS_URL}/${'0'.repeat(24)}`)
        .set('Cookie', alice.cookie);
      const malformed = await request(app)
        .get(`${LOANS_URL}/not-an-id`)
        .set('Cookie', alice.cookie);

      expect(missing.status).toBe(404);
      expect(malformed.status).toBe(400);
    });
  });

  describe('access', () => {
    it.each(['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const)(
      '%s gets 403 on both endpoints',
      async (role) => {
        const list = await request(app).get(LOANS_URL).set('Cookie', staff[role].cookie);
        const detail = await request(app)
          .get(`${LOANS_URL}/${bobLoanId}`)
          .set('Cookie', staff[role].cookie);

        expect(list.status).toBe(403);
        expect(detail.status).toBe(403);
      },
    );

    it('anonymous gets 401 on both endpoints', async () => {
      expect((await request(app).get(LOANS_URL)).status).toBe(401);
      expect((await request(app).get(`${LOANS_URL}/${bobLoanId}`)).status).toBe(401);
    });
  });
});
