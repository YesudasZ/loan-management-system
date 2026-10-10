import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { seedDemoData } from '../../src/scripts/seed-demo.js';
import {
  TEST_BORROWERS,
  TEST_DATA_PASSWORD,
  TEST_STAFF,
  type StaffRole,
} from '../../src/scripts/test-data/test-accounts.js';
import { seedTestData } from '../../src/scripts/test-data/test-data-seed.js';
import { TEST_LEADS } from '../../src/scripts/test-data/test-leads.js';
import { LOAN_STATUSES } from '../../src/utils/loan-state-machine.js';
import { getAuthSetCookie } from '../helpers/auth.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

// "Every login sees at least 5 records": logs in as each of the 60 test accounts with the
// documented password and checks what that role's landing page and modules would show.

const MINIMUM_RECORDS = 5;
const isTestEmail = (email: string) => email.endsWith('@test.lms.dev');

interface LoanRow {
  id: string;
  status: string;
  borrower: { email: string };
  totalPaid: number;
}

async function login(app: Express, email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: TEST_DATA_PASSWORD });
  expect(response.status, email).toBe(200);
  const cookie = getAuthSetCookie(response);
  if (!cookie) throw new Error(`No session cookie for ${email}`);
  return cookie.split(';')[0] ?? '';
}

async function getData<T>(app: Express, cookie: string, path: string): Promise<T> {
  const response = await request(app).get(path).set('Cookie', cookie);
  expect(response.status, path).toBe(200);
  return response.body.data as T;
}

/** Test-data loans in a staff queue (the demo seed's loans are there too). */
async function testLoansIn(app: Express, cookie: string, query = ''): Promise<LoanRow[]> {
  const page = await getData<{ items: LoanRow[] }>(app, cookie, `/api/v1/loans?limit=100${query}`);
  return page.items.filter((loan) => isTestEmail(loan.borrower.email));
}

const staffWithRole = (role: StaffRole) => TEST_STAFF.filter((staff) => staff.role === role);

describe('test data: what every test login sees', () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDatabase();
    await seedDemoData();
    await seedTestData();
  });
  afterAll(stopTestDatabase);

  it.each(staffWithRole('ADMIN'))('$email: every module and status has data', async ({ email }) => {
    const cookie = await login(app, email);
    const summary = await getData<{ loansByStatus: Record<string, number>; leadCount: number }>(
      app,
      cookie,
      '/api/v1/dashboard/summary',
    );

    for (const status of LOAN_STATUSES) {
      expect(summary.loansByStatus[status]).toBeGreaterThanOrEqual(MINIMUM_RECORDS);
      expect((await testLoansIn(app, cookie, `&status=${status}`)).length).toBeGreaterThanOrEqual(
        MINIMUM_RECORDS,
      );
    }
    expect(summary.leadCount).toBeGreaterThanOrEqual(10);
  });

  it.each(staffWithRole('SALES'))('$email: at least 10 leads at every stage', async ({ email }) => {
    const cookie = await login(app, email);
    const leads = await getData<{ items: { email: string; stage: string; breFailures: [] }[] }>(
      app,
      cookie,
      '/api/v1/leads?limit=100',
    );

    const testLeads = leads.items.filter((lead) => isTestEmail(lead.email));
    expect(testLeads).toHaveLength(10);
    for (const expected of TEST_LEADS) {
      const shown = testLeads.find((lead) => lead.email === expected.email);
      expect(shown?.stage, expected.email).toBe(expected.expectedStage);
      if (expected.expectedStage === 'BRE_FAILED')
        expect(shown?.breFailures.length).toBeGreaterThan(0);
    }
  });

  it.each(staffWithRole('SANCTION'))(
    '$email: 5 APPLIED loans, each with a viewable slip',
    async ({ email }) => {
      const cookie = await login(app, email);
      const loans = await testLoansIn(app, cookie);

      expect(loans).toHaveLength(MINIMUM_RECORDS);
      for (const loan of loans) {
        expect(loan.status).toBe('APPLIED');
        const slip = await request(app)
          .get(`/api/v1/loans/${loan.id}/salary-slip`)
          .set('Cookie', cookie)
          .buffer(true);
        expect(slip.status).toBe(200);
        expect(slip.headers['content-type']).toBe('application/pdf');
      }
    },
  );

  it.each(staffWithRole('DISBURSEMENT'))('$email: 5 SANCTIONED loans', async ({ email }) => {
    const loans = await testLoansIn(app, await login(app, email));
    expect(loans).toHaveLength(MINIMUM_RECORDS);
    expect(loans.every((loan) => loan.status === 'SANCTIONED')).toBe(true);
  });

  it.each(staffWithRole('COLLECTION'))(
    '$email: 5 DISBURSED loans whose payment history adds up',
    async ({ email }) => {
      const cookie = await login(app, email);
      const loans = await testLoansIn(app, cookie);
      const paymentCounts: number[] = [];

      expect(loans).toHaveLength(MINIMUM_RECORDS);
      for (const loan of loans) {
        const payments = await getData<{ items: { amount: number }[] }>(
          app,
          cookie,
          `/api/v1/loans/${loan.id}/payments`,
        );
        expect(payments.items.reduce((sum, payment) => sum + payment.amount, 0)).toBe(
          loan.totalPaid,
        );
        paymentCounts.push(payments.items.length);
      }
      // None, partial and several partial payments.
      expect(paymentCounts.sort()).toEqual([0, 1, 1, 2, 3]);
    },
  );

  it.each(TEST_BORROWERS)('$email: 5 loans on My loans, the latest $group', async (borrower) => {
    const cookie = await login(app, borrower.email);
    const page = await getData<{ items: { status: string; createdAt: string }[] }>(
      app,
      cookie,
      '/api/v1/borrower/loans',
    );
    const progress = await getData<{ currentStep: string }>(
      app,
      cookie,
      '/api/v1/borrower/progress',
    );

    expect(page.items).toHaveLength(5);
    expect(page.items[0]?.status).toBe(borrower.group);
    const dates = page.items.map((loan) => loan.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(progress.currentStep).toBe('STATUS');
  });

  it.each(TEST_LEADS)('$email: no loans, lands on the right wizard step', async (lead) => {
    const cookie = await login(app, lead.email);
    const progress = await getData<{ currentStep: string }>(
      app,
      cookie,
      '/api/v1/borrower/progress',
    );
    const loans = await getData<{ items: [] }>(app, cookie, '/api/v1/borrower/loans');

    const expectedStep = {
      PROFILE_PENDING: 'PROFILE',
      BRE_FAILED: 'PROFILE',
      SALARY_SLIP_PENDING: 'SALARY_SLIP',
      READY_TO_APPLY: 'LOAN',
    }[lead.expectedStage];
    expect(progress.currentStep).toBe(expectedStep);
    expect(loans.items).toHaveLength(0);
  });
});
