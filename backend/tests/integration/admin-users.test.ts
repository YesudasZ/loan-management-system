import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Role } from '../../src/config/constants.js';
import { UserModel } from '../../src/models/user.model.js';
import { changeUserRole } from '../../src/modules/admin/admin.service.js';
import { createTestUser, type TestUser } from '../helpers/auth.js';
import { createAppliedLoan, createStaff, type StaffUsers } from '../helpers/loans.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const USERS_URL = '/api/v1/admin/users';
const roleUrl = (userId: string) => `${USERS_URL}/${userId}/role`;
const NEW_STAFF = {
  name: 'Meera Joshi',
  email: 'meera.joshi@test.dev',
  password: 'Welcome123',
  role: 'SANCTION',
};

describe('admin staff management', () => {
  const app = createApp();
  let staff: StaffUsers;

  beforeAll(startTestDatabase);
  beforeEach(async () => {
    await clearTestDatabase();
    staff = await createStaff();
  });
  afterAll(stopTestDatabase);

  const asAdmin = (call: request.Test) => call.set('Cookie', staff.ADMIN.cookie);
  const changeRole = (userId: string, role: string, cookie = staff.ADMIN.cookie) =>
    request(app).patch(roleUrl(userId)).set('Cookie', cookie).send({ role });
  const roleInDb = async (userId: string) => (await UserModel.findById(userId))?.role;

  describe('GET /admin/users', () => {
    it('lists users newest first, with no password hash or history', async () => {
      const response = await asAdmin(request(app).get(USERS_URL));

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.totalItems).toBe(5);
      const [first] = response.body.data.items;
      expect(Object.keys(first).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role']);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$2b\$/);
    });

    it('filters by role and searches name or email, ignoring case', async () => {
      const byRole = await asAdmin(request(app).get(`${USERS_URL}?role=SANCTION`));
      const byEmail = await asAdmin(request(app).get(`${USERS_URL}?search=COLLECTION@TEST`));
      const byName = await asAdmin(request(app).get(`${USERS_URL}?search=test%20disb`));

      expect(byRole.body.data.items.map((user: { role: Role }) => user.role)).toEqual(['SANCTION']);
      expect(byEmail.body.data.items.map((user: { email: string }) => user.email)).toEqual([
        'collection@test.dev',
      ]);
      expect(byName.body.data.items).toHaveLength(1);
    });

    it('treats regex characters in the search as plain text', async () => {
      const dotStar = await asAdmin(request(app).get(`${USERS_URL}?search=.*`));
      const bracket = await asAdmin(request(app).get(`${USERS_URL}?search=(`));

      expect(dotStar.status).toBe(200);
      expect(dotStar.body.data.items).toHaveLength(0);
      expect(bracket.status).toBe(200);
    });

    it('paginates', async () => {
      const response = await asAdmin(request(app).get(`${USERS_URL}?page=2&limit=2`));
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.pagination).toEqual({
        page: 2,
        limit: 2,
        totalItems: 5,
        totalPages: 3,
      });
    });

    it.each([
      ['an unknown role', '?role=OWNER'],
      ['an unknown parameter', '?isAdmin=true'],
      ['an operator in the search', '?search[$ne]=x'],
      ['a search over 100 characters', `?search=${'a'.repeat(101)}`],
    ])('rejects %s with 400', async (_case, query) => {
      expect((await asAdmin(request(app).get(`${USERS_URL}${query}`))).status).toBe(400);
    });
  });

  describe('POST /admin/users', () => {
    it('creates a staff member who can log in with the temporary password', async () => {
      const response = await asAdmin(request(app).post(USERS_URL).send(NEW_STAFF));

      expect(response.status).toBe(201);
      expect(response.body.data.user).toMatchObject({
        name: 'Meera Joshi',
        email: 'meera.joshi@test.dev',
        role: 'SANCTION',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/password/i);

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: NEW_STAFF.email, password: NEW_STAFF.password });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe('SANCTION');

      const stored = await UserModel.findById(response.body.data.user.id);
      expect(stored?.roleHistory).toHaveLength(1);
      expect(stored?.roleHistory[0]).toMatchObject({ from: null, to: 'SANCTION' });
      expect(String(stored?.roleHistory[0]?.by)).toBe(staff.ADMIN.id);
    });

    it('rejects an email that is already registered (any case) with 409', async () => {
      const response = await asAdmin(
        request(app)
          .post(USERS_URL)
          .send({ ...NEW_STAFF, email: '  SALES@test.dev ' }),
      );
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it.each([
      ['the BORROWER role', { ...NEW_STAFF, role: 'BORROWER' }],
      ['no role', { name: 'A B', email: 'ab@test.dev', password: 'Welcome123' }],
      ['a password without a digit', { ...NEW_STAFF, password: 'onlyletters' }],
      ['a short password', { ...NEW_STAFF, password: 'abc12' }],
      ['an unknown field', { ...NEW_STAFF, roleHistory: [] }],
    ])('rejects %s with 400', async (_case, body) => {
      const response = await asAdmin(request(app).post(USERS_URL).send(body));
      expect(response.status).toBe(400);
      expect(await UserModel.countDocuments()).toBe(5);
    });
  });

  describe('PATCH /admin/users/:userId/role', () => {
    it('changes the role, records who did it, and applies to their current session', async () => {
      const response = await changeRole(staff.SALES.id, 'SANCTION');

      expect(response.status).toBe(200);
      expect(response.body.data.user.role).toBe('SANCTION');
      const stored = await UserModel.findById(staff.SALES.id);
      expect(stored?.roleHistory.at(-1)).toMatchObject({ from: 'SALES', to: 'SANCTION' });
      expect(String(stored?.roleHistory.at(-1)?.by)).toBe(staff.ADMIN.id);

      // The API reads the role from the database, so the old cookie now has the new rights.
      const queue = await request(app).get('/api/v1/loans').set('Cookie', staff.SALES.cookie);
      const leads = await request(app).get('/api/v1/leads').set('Cookie', staff.SALES.cookie);
      expect(queue.status).toBe(200);
      expect(leads.status).toBe(403);
    });

    it('refuses to change the admin’s own role (409), so they cannot lock themselves out', async () => {
      const response = await changeRole(staff.ADMIN.id, 'SALES');
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
      expect(await roleInDb(staff.ADMIN.id)).toBe('ADMIN');
    });

    // Audit finding B-05: the self check compared strings, so the admin's own id written in
    // upper-case hex slipped past it and changed their role.
    it('refuses the admin’s own id in any letter case (409)', async () => {
      const upperCaseId = staff.ADMIN.id.toUpperCase();
      await createTestUser('ADMIN', 'admin2@test.dev'); // so "last admin" can't be the reason

      const response = await changeRole(upperCaseId, 'SALES');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
      expect(await roleInDb(staff.ADMIN.id)).toBe('ADMIN');
    });

    it('accepts a target id in upper case for another user', async () => {
      const response = await changeRole(staff.SALES.id.toUpperCase(), 'COLLECTION');
      expect(response.status).toBe(200);
      expect(await roleInDb(staff.SALES.id)).toBe('COLLECTION');
    });

    it('lets one admin demote another while an admin remains', async () => {
      const secondAdmin = await createTestUser('ADMIN', 'admin2@test.dev');
      const response = await changeRole(secondAdmin.id, 'COLLECTION');
      expect(response.status).toBe(200);
      expect(await roleInDb(secondAdmin.id)).toBe('COLLECTION');
    });

    it('never demotes the last admin (409)', async () => {
      // Through the API an admin can only target someone else, so this guard matters when
      // the caller lost their admin role a moment ago. Call the service as such a caller.
      const formerAdmin = {
        id: new Types.ObjectId().toString(),
        name: 'x',
        email: 'x',
        role: 'ADMIN' as const,
      };

      await expect(changeUserRole(formerAdmin, staff.ADMIN.id, 'SALES')).rejects.toMatchObject({
        statusCode: 409,
        code: 'LAST_ADMIN',
      });
      expect(await roleInDb(staff.ADMIN.id)).toBe('ADMIN');
    });

    it('keeps at least one admin when two admins demote each other at once', async () => {
      const secondAdmin = await createTestUser('ADMIN', 'admin2@test.dev');

      const results = await Promise.all([
        changeRole(secondAdmin.id, 'SALES', staff.ADMIN.cookie),
        changeRole(staff.ADMIN.id, 'SALES', secondAdmin.cookie),
      ]);

      expect(await UserModel.countDocuments({ role: 'ADMIN' })).toBeGreaterThanOrEqual(1);
      expect(results.filter((result) => result.status === 200).length).toBeLessThanOrEqual(1);
      for (const result of results) expect([200, 403, 409]).toContain(result.status);
    });

    it('refuses to make a borrower with a loan into staff (409, segregation of duties)', async () => {
      const { borrower } = await createAppliedLoan(app);

      const response = await changeRole(borrower.id, 'COLLECTION');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('BORROWER_HAS_LOANS');
      expect(await roleInDb(borrower.id)).toBe('BORROWER');
    });

    it('lets a borrower without loans become staff, and staff become a borrower', async () => {
      const borrower = await createTestUser('BORROWER', 'no-loans@test.dev');

      expect((await changeRole(borrower.id, 'SALES')).status).toBe(200);
      expect((await changeRole(staff.COLLECTION.id, 'BORROWER')).status).toBe(200);
      expect(await roleInDb(borrower.id)).toBe('SALES');
      expect(await roleInDb(staff.COLLECTION.id)).toBe('BORROWER');
    });

    it('does nothing (200, no history entry) when the role is unchanged', async () => {
      const response = await changeRole(staff.SALES.id, 'SALES');
      expect(response.status).toBe(200);
      expect((await UserModel.findById(staff.SALES.id))?.roleHistory).toHaveLength(0);
    });

    it.each([
      ['an unknown role', 'OWNER'],
      ['a missing role', undefined],
    ])('rejects %s with 400', async (_case, role) => {
      expect((await changeRole(staff.SALES.id, role as string)).status).toBe(400);
    });

    it('rejects extra fields (400), a malformed id (400) and an unknown user (404)', async () => {
      const extra = await asAdmin(
        request(app).patch(roleUrl(staff.SALES.id)).send({ role: 'ADMIN', by: staff.SALES.id }),
      );
      expect(extra.status).toBe(400);
      expect((await changeRole('not-an-id', 'SALES')).status).toBe(400);
      expect((await changeRole(new Types.ObjectId().toString(), 'SALES')).status).toBe(404);
    });

    it('rejects a role change from a foreign Origin (CSRF safety net)', async () => {
      const response = await asAdmin(
        request(app)
          .patch(roleUrl(staff.SALES.id))
          .set('Origin', 'https://evil.example')
          .send({ role: 'ADMIN' }),
      );
      expect(response.status).toBe(403);
      expect(await roleInDb(staff.SALES.id)).toBe('SALES');
    });
  });

  describe('access', () => {
    const NON_ADMIN_ROLES = ['SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const;

    it.each(NON_ADMIN_ROLES)('%s gets 403 on every admin endpoint', async (role) => {
      const cookie = staff[role].cookie;
      const list = await request(app).get(USERS_URL).set('Cookie', cookie);
      const create = await request(app).post(USERS_URL).set('Cookie', cookie).send(NEW_STAFF);
      const promote = await changeRole(staff[role].id, 'ADMIN', cookie);

      expect([list.status, create.status, promote.status]).toEqual([403, 403, 403]);
      expect(await roleInDb(staff[role].id)).toBe(role);
    });

    it('a borrower gets 403 and an anonymous caller 401', async () => {
      const borrower: TestUser = await createTestUser('BORROWER', 'b@test.dev');
      expect((await request(app).get(USERS_URL).set('Cookie', borrower.cookie)).status).toBe(403);
      expect((await request(app).get(USERS_URL)).status).toBe(401);
      expect((await request(app).post(USERS_URL).send(NEW_STAFF)).status).toBe(401);
    });
  });
});
