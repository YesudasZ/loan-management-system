import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AUTH_RATE_LIMITS } from '../../src/config/constants.js';
import { UserModel } from '../../src/models/user.model.js';
import { createTestUser, getAuthSetCookie, TEST_PASSWORD } from '../helpers/auth.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const SIGNUP_URL = '/api/v1/auth/signup';
const LOGIN_URL = '/api/v1/auth/login';
const LOGOUT_URL = '/api/v1/auth/logout';
const ME_URL = '/api/v1/auth/me';

const newBorrower = { name: 'Riya Sharma', email: 'riya@example.com', password: 'Secret123' };

describe('auth', () => {
  const app = createApp();

  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  describe('POST /auth/signup', () => {
    it('creates a BORROWER, logs them in and never returns the password hash', async () => {
      const response = await request(app).post(SIGNUP_URL).send(newBorrower);

      expect(response.status).toBe(201);
      expect(response.body.data.user).toEqual({
        id: expect.any(String),
        name: 'Riya Sharma',
        email: 'riya@example.com',
        role: 'BORROWER',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/password/i);

      const stored = await UserModel.findOne({ email: 'riya@example.com' }).select('+passwordHash');
      expect(stored?.passwordHash).toMatch(/^\$2b\$10\$/);
      expect(stored?.passwordHash).not.toContain('Secret123');
    });

    it('sets an httpOnly, SameSite=Lax session cookie', async () => {
      const response = await request(app).post(SIGNUP_URL).send(newBorrower);
      const cookie = getAuthSetCookie(response);

      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=86400');
    });

    it('rejects a role in the body (no mass assignment)', async () => {
      const response = await request(app)
        .post(SIGNUP_URL)
        .send({ ...newBorrower, role: 'ADMIN' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await UserModel.countDocuments()).toBe(0);
    });

    it('rejects a weak password with field-level details', async () => {
      const response = await request(app)
        .post(SIGNUP_URL)
        .send({ ...newBorrower, password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });

    it('rejects a password longer than 72 bytes', async () => {
      const response = await request(app)
        .post(SIGNUP_URL)
        .send({ ...newBorrower, password: `A1${'₹'.repeat(24)}` });

      expect(response.status).toBe(400);
    });

    it('returns 409 for an email that is already registered (case-insensitive)', async () => {
      await request(app).post(SIGNUP_URL).send(newBorrower);
      const response = await request(app)
        .post(SIGNUP_URL)
        .send({ ...newBorrower, email: '  RIYA@Example.com ' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with the right password, ignoring email case', async () => {
      await createTestUser('SANCTION', 'sanction@test.dev');

      const response = await request(app)
        .post(LOGIN_URL)
        .send({ email: 'Sanction@Test.dev', password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.user.role).toBe('SANCTION');
      expect(getAuthSetCookie(response)).toBeDefined();
    });

    it('gives the same generic error for a wrong password and an unknown email', async () => {
      await createTestUser('BORROWER', 'known@test.dev');

      const wrongPassword = await request(app)
        .post(LOGIN_URL)
        .send({ email: 'known@test.dev', password: 'Wrong1234' });
      const unknownEmail = await request(app)
        .post(LOGIN_URL)
        .send({ email: 'nobody@test.dev', password: 'Wrong1234' });

      for (const response of [wrongPassword, unknownEmail]) {
        expect(response.status).toBe(401);
        expect(response.body.error).toEqual({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }
    });

    it('rejects operator objects instead of querying with them (NoSQL injection)', async () => {
      await createTestUser('ADMIN', 'admin@test.dev');

      const response = await request(app)
        .post(LOGIN_URL)
        .send({ email: { $gt: '' }, password: TEST_PASSWORD });

      expect(response.status).toBe(400);
    });

    it('returns 429 after too many failed attempts, but successful logins do not count', async () => {
      const limitedApp = createApp({
        authRateLimits: { ...AUTH_RATE_LIMITS, login: { windowMs: 60_000, limit: 3 } },
      });
      await createTestUser('BORROWER', 'limited@test.dev');
      const goodLogin = { email: 'limited@test.dev', password: TEST_PASSWORD };
      const badLogin = { email: 'limited@test.dev', password: 'Wrong1234' };

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await request(limitedApp).post(LOGIN_URL).send(goodLogin)).status).toBe(200);
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await request(limitedApp).post(LOGIN_URL).send(badLogin)).status).toBe(401);
      }
      const blocked = await request(limitedApp).post(LOGIN_URL).send(badLogin);

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user for a valid session', async () => {
      const user = await createTestUser('COLLECTION');

      const response = await request(app).get(ME_URL).set('Cookie', user.cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.user).toEqual({
        id: user.id,
        name: 'Test COLLECTION',
        email: user.email,
        role: 'COLLECTION',
      });
    });

    it('returns 401 without a session', async () => {
      const response = await request(app).get(ME_URL);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 and clears the cookie for a tampered token', async () => {
      const user = await createTestUser('BORROWER');

      const response = await request(app).get(ME_URL).set('Cookie', `${user.cookie}tampered`);

      expect(response.status).toBe(401);
      expect(getAuthSetCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('returns 401 when the account no longer exists', async () => {
      const user = await createTestUser('SALES');
      await UserModel.deleteOne({ email: user.email });

      const response = await request(app).get(ME_URL).set('Cookie', user.cookie);

      expect(response.status).toBe(401);
    });

    it('is not throttled by normal page loads', async () => {
      const user = await createTestUser('BORROWER');

      for (let pageLoad = 0; pageLoad < 25; pageLoad += 1) {
        expect((await request(app).get(ME_URL).set('Cookie', user.cookie)).status).toBe(200);
      }
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the session cookie', async () => {
      const user = await createTestUser('BORROWER');

      const response = await request(app).post(LOGOUT_URL).set('Cookie', user.cookie).send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
      expect(getAuthSetCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('works without a body', async () => {
      const response = await request(app).post(LOGOUT_URL);

      expect(response.status).toBe(200);
    });
  });
});
