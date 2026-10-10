import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '../../src/config/constants.js';
import { createTestUser, type TestUser } from './auth.js';
import { LOAN_REQUEST, prepareBorrowerToApply } from './borrower.js';

export type StaffUsers = Record<Exclude<Role, 'BORROWER'>, TestUser>;

/** One user per staff role, created once per test (emails are unique per role). */
export async function createStaff(): Promise<StaffUsers> {
  return {
    ADMIN: await createTestUser('ADMIN'),
    SALES: await createTestUser('SALES'),
    SANCTION: await createTestUser('SANCTION'),
    DISBURSEMENT: await createTestUser('DISBURSEMENT'),
    COLLECTION: await createTestUser('COLLECTION'),
  };
}

export interface TestLoan {
  loanId: string;
  borrower: TestUser;
  totalRepayment: number;
}

let borrowerCounter = 0;

/** A fresh borrower with an APPLIED loan (₹1,00,000 for 90 days → total 10,295,890 paise). */
export async function createAppliedLoan(app: Express): Promise<TestLoan> {
  borrowerCounter += 1;
  const borrower = await createTestUser('BORROWER', `borrower${borrowerCounter}@test.dev`);
  await prepareBorrowerToApply(app, borrower.cookie);
  const response = await request(app)
    .post('/api/v1/borrower/loans')
    .set('Cookie', borrower.cookie)
    .send(LOAN_REQUEST);
  if (response.status !== 201) throw new Error(`Apply failed: ${response.status}`);
  return {
    loanId: response.body.data.loan.id as string,
    borrower,
    totalRepayment: response.body.data.loan.totalRepayment as number,
  };
}

async function act(app: Express, cookie: string, path: string, body: object = {}): Promise<void> {
  const response = await request(app).post(path).set('Cookie', cookie).send(body);
  if (response.status !== 200) throw new Error(`${path} failed: ${response.status}`);
}

export async function createSanctionedLoan(app: Express, staff: StaffUsers): Promise<TestLoan> {
  const loan = await createAppliedLoan(app);
  await act(app, staff.SANCTION.cookie, `/api/v1/loans/${loan.loanId}/approve`);
  return loan;
}

export async function createDisbursedLoan(app: Express, staff: StaffUsers): Promise<TestLoan> {
  const loan = await createSanctionedLoan(app, staff);
  await act(app, staff.DISBURSEMENT.cookie, `/api/v1/loans/${loan.loanId}/disburse`);
  return loan;
}
