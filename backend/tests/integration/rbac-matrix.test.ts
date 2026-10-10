import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Role } from '../../src/config/constants.js';
import { toBusinessDate } from '../../src/utils/dates.js';
import { createTestUser, type TestUser } from '../helpers/auth.js';
import {
  ELIGIBLE_PROFILE,
  LOAN_REQUEST,
  prepareBorrowerToApply,
  SAMPLE_FILES,
  saveEligibleProfile,
} from '../helpers/borrower.js';
import {
  createAppliedLoan,
  createDisbursedLoan,
  createSanctionedLoan,
  createStaff,
  type StaffUsers,
} from '../helpers/loans.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

/**
 * The full role × endpoint matrix (CLAUDE.md §7): every protected endpoint against anonymous
 * and all six roles. Anonymous → 401, a role not allowed → 403, an allowed role → the endpoint's
 * real success status, using fresh data in the right state for that cell.
 */

type Identity = Role | 'ANONYMOUS';
const IDENTITIES: Identity[] = [
  'ANONYMOUS',
  'ADMIN',
  'SALES',
  'SANCTION',
  'DISBURSEMENT',
  'COLLECTION',
  'BORROWER',
];
const ALL_ROLES: Role[] = ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION', 'BORROWER'];
const ANY_ID = '64b7f0c2a1b2c3d4e5f60718'; // valid shape; denied cells never reach the lookup

interface PreparedRequest {
  path: string;
  body?: object;
  attachPdf?: boolean;
  /** Overrides the identity's cookie (borrower cells use a fresh borrower in the right state). */
  cookie?: string;
}

interface Context {
  app: Express;
  staff: StaffUsers;
  role: Role;
}

interface EndpointCase {
  name: string;
  method: 'get' | 'post' | 'put' | 'patch';
  /** Path used for denied cells (they fail before any lookup). */
  path: string;
  allowed: Role[];
  successStatus: number;
  prepareAllowed: (context: Context) => Promise<PreparedRequest>;
}

let counter = 0;
const nextId = () => {
  counter += 1;
  return counter;
};

async function freshBorrower(): Promise<TestUser> {
  return createTestUser('BORROWER', `matrix${nextId()}@test.dev`);
}

/** A loan the role may act on or read (each module owns one status; ADMIN any). */
async function loanVisibleTo(context: Context): Promise<string> {
  const { app, staff, role } = context;
  if (role === 'DISBURSEMENT') return (await createSanctionedLoan(app, staff)).loanId;
  if (role === 'COLLECTION') return (await createDisbursedLoan(app, staff)).loanId;
  return (await createAppliedLoan(app)).loanId;
}

const ENDPOINTS: EndpointCase[] = [
  {
    name: 'GET /auth/me',
    method: 'get',
    path: '/api/v1/auth/me',
    allowed: ALL_ROLES,
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/auth/me' }),
  },
  {
    name: 'GET /borrower/progress',
    method: 'get',
    path: '/api/v1/borrower/progress',
    allowed: ['BORROWER'],
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/borrower/progress' }),
  },
  {
    name: 'PUT /borrower/profile',
    method: 'put',
    path: '/api/v1/borrower/profile',
    allowed: ['BORROWER'],
    successStatus: 200,
    prepareAllowed: async () => ({
      path: '/api/v1/borrower/profile',
      body: ELIGIBLE_PROFILE,
      cookie: (await freshBorrower()).cookie,
    }),
  },
  {
    name: 'POST /borrower/salary-slip',
    method: 'post',
    path: '/api/v1/borrower/salary-slip',
    allowed: ['BORROWER'],
    successStatus: 201,
    prepareAllowed: async ({ app }) => {
      const borrower = await freshBorrower();
      await saveEligibleProfile(app, borrower.cookie);
      return { path: '/api/v1/borrower/salary-slip', attachPdf: true, cookie: borrower.cookie };
    },
  },
  {
    name: 'GET /borrower/salary-slip',
    method: 'get',
    path: '/api/v1/borrower/salary-slip',
    allowed: ['BORROWER'],
    successStatus: 200,
    prepareAllowed: async ({ app }) => {
      const borrower = await freshBorrower();
      await prepareBorrowerToApply(app, borrower.cookie);
      return { path: '/api/v1/borrower/salary-slip', cookie: borrower.cookie };
    },
  },
  {
    name: 'POST /borrower/loans',
    method: 'post',
    path: '/api/v1/borrower/loans',
    allowed: ['BORROWER'],
    successStatus: 201,
    prepareAllowed: async ({ app }) => {
      const borrower = await freshBorrower();
      await prepareBorrowerToApply(app, borrower.cookie);
      return { path: '/api/v1/borrower/loans', body: LOAN_REQUEST, cookie: borrower.cookie };
    },
  },
  {
    name: 'GET /borrower/loans',
    method: 'get',
    path: '/api/v1/borrower/loans',
    allowed: ['BORROWER'],
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/borrower/loans' }),
  },
  {
    name: 'GET /borrower/loans/:loanId',
    method: 'get',
    path: `/api/v1/borrower/loans/${ANY_ID}`,
    allowed: ['BORROWER'],
    successStatus: 200,
    prepareAllowed: async ({ app }) => {
      const { loanId, borrower } = await createAppliedLoan(app);
      return { path: `/api/v1/borrower/loans/${loanId}`, cookie: borrower.cookie };
    },
  },
  {
    name: 'GET /loans',
    method: 'get',
    path: '/api/v1/loans',
    allowed: ['SANCTION', 'DISBURSEMENT', 'COLLECTION', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/loans' }),
  },
  {
    name: 'GET /loans/:loanId',
    method: 'get',
    path: `/api/v1/loans/${ANY_ID}`,
    allowed: ['SANCTION', 'DISBURSEMENT', 'COLLECTION', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: async (context) => ({ path: `/api/v1/loans/${await loanVisibleTo(context)}` }),
  },
  {
    name: 'POST /loans/:loanId/approve',
    method: 'post',
    path: `/api/v1/loans/${ANY_ID}/approve`,
    allowed: ['SANCTION', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: async ({ app }) => ({
      path: `/api/v1/loans/${(await createAppliedLoan(app)).loanId}/approve`,
    }),
  },
  {
    name: 'POST /loans/:loanId/reject',
    method: 'post',
    path: `/api/v1/loans/${ANY_ID}/reject`,
    allowed: ['SANCTION', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: async ({ app }) => ({
      path: `/api/v1/loans/${(await createAppliedLoan(app)).loanId}/reject`,
      body: { reason: 'Documents could not be verified' },
    }),
  },
  {
    name: 'POST /loans/:loanId/disburse',
    method: 'post',
    path: `/api/v1/loans/${ANY_ID}/disburse`,
    allowed: ['DISBURSEMENT', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: async ({ app, staff }) => ({
      path: `/api/v1/loans/${(await createSanctionedLoan(app, staff)).loanId}/disburse`,
    }),
  },
  {
    name: 'GET /loans/:loanId/salary-slip',
    method: 'get',
    path: `/api/v1/loans/${ANY_ID}/salary-slip`,
    allowed: ['SANCTION', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: async ({ app }) => ({
      path: `/api/v1/loans/${(await createAppliedLoan(app)).loanId}/salary-slip`,
    }),
  },
  {
    name: 'GET /loans/:loanId/payments',
    method: 'get',
    path: `/api/v1/loans/${ANY_ID}/payments`,
    allowed: ['COLLECTION', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: async ({ app, staff }) => ({
      path: `/api/v1/loans/${(await createDisbursedLoan(app, staff)).loanId}/payments`,
    }),
  },
  {
    name: 'POST /loans/:loanId/payments',
    method: 'post',
    path: `/api/v1/loans/${ANY_ID}/payments`,
    allowed: ['COLLECTION', 'ADMIN'],
    successStatus: 201,
    prepareAllowed: async ({ app, staff }) => {
      const { loanId } = await createDisbursedLoan(app, staff);
      return {
        path: `/api/v1/loans/${loanId}/payments`,
        body: {
          utr: `MATRIX${String(nextId()).padStart(6, '0')}`,
          amount: 100_000,
          paymentDate: toBusinessDate(),
        },
      };
    },
  },
  {
    name: 'GET /leads',
    method: 'get',
    path: '/api/v1/leads',
    allowed: ['SALES', 'ADMIN'],
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/leads' }),
  },
  {
    name: 'GET /dashboard/summary',
    method: 'get',
    path: '/api/v1/dashboard/summary',
    allowed: ['ADMIN'],
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/dashboard/summary' }),
  },
  {
    name: 'GET /admin/users',
    method: 'get',
    path: '/api/v1/admin/users',
    allowed: ['ADMIN'],
    successStatus: 200,
    prepareAllowed: () => Promise.resolve({ path: '/api/v1/admin/users' }),
  },
  {
    name: 'POST /admin/users',
    method: 'post',
    path: '/api/v1/admin/users',
    allowed: ['ADMIN'],
    successStatus: 201,
    prepareAllowed: () =>
      Promise.resolve({
        path: '/api/v1/admin/users',
        body: {
          name: 'Matrix Staff',
          email: `matrix-staff${nextId()}@test.dev`,
          password: 'Welcome123',
          role: 'SALES',
        },
      }),
  },
  {
    name: 'PATCH /admin/users/:userId/role',
    method: 'patch',
    path: `/api/v1/admin/users/${ANY_ID}/role`,
    allowed: ['ADMIN'],
    successStatus: 200,
    prepareAllowed: async () => {
      const target = await createTestUser('SALES', `matrix-target${nextId()}@test.dev`);
      return { path: `/api/v1/admin/users/${target.id}/role`, body: { role: 'COLLECTION' } };
    },
  },
];

function expectedStatus(endpoint: EndpointCase, identity: Identity): number {
  if (identity === 'ANONYMOUS') return 401;
  return endpoint.allowed.includes(identity) ? endpoint.successStatus : 403;
}

describe('RBAC matrix: every protected endpoint × every identity', () => {
  const app = createApp();
  let staff: StaffUsers;
  let plainBorrower: TestUser;

  beforeAll(async () => {
    await startTestDatabase();
    staff = await createStaff();
    plainBorrower = await createTestUser('BORROWER', 'plain-borrower@test.dev');
  });
  afterAll(stopTestDatabase);

  function cookieFor(identity: Identity): string | undefined {
    if (identity === 'ANONYMOUS') return undefined;
    return identity === 'BORROWER' ? plainBorrower.cookie : staff[identity].cookie;
  }

  for (const endpoint of ENDPOINTS) {
    describe(endpoint.name, () => {
      for (const identity of IDENTITIES) {
        const expected = expectedStatus(endpoint, identity);

        it(`${identity} → ${expected}`, async () => {
          const isAllowed = identity !== 'ANONYMOUS' && endpoint.allowed.includes(identity);
          const prepared: PreparedRequest = isAllowed
            ? await endpoint.prepareAllowed({ app, staff, role: identity })
            : { path: endpoint.path };

          let call = request(app)[endpoint.method](prepared.path);
          const cookie = prepared.cookie ?? cookieFor(identity);
          if (cookie) call = call.set('Cookie', cookie);
          const response = prepared.attachPdf
            ? await call.attach('file', SAMPLE_FILES.pdf, {
                filename: 'slip.pdf',
                contentType: 'application/pdf',
              })
            : await call.send(prepared.body ?? {});

          expect(response.status, JSON.stringify(response.body)).toBe(expected);
        });
      }
    });
  }

  it('covers 21 protected endpoints × 7 identities', () => {
    expect(ENDPOINTS.length * IDENTITIES.length).toBe(147);
  });
});
