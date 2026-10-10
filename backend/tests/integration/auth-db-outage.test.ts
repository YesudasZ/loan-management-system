import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { AUTH_COOKIE_NAME } from '../../src/config/constants.js';
import { UserModel } from '../../src/models/user.model.js';
import { createTestUser, getAuthSetCookie, type TestUser } from '../helpers/auth.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

// Audit finding C-10 (and its duplicate B-07): a database error while loading the session user
// used to be treated as "not logged in" (401) and cleared the cookie, so a short outage logged
// every user out. It must be a 503 that keeps the session.

function failNextUserLookup(): void {
  vi.spyOn(UserModel, 'findById').mockImplementationOnce(() => {
    throw new Error('connection lost');
  });
}

describe('authenticate during a database outage', () => {
  const app = createApp();
  let borrower: TestUser;

  beforeAll(async () => {
    await startTestDatabase();
    borrower = await createTestUser('BORROWER');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(stopTestDatabase);

  it('answers 503 DATABASE_UNAVAILABLE and keeps the session cookie', async () => {
    failNextUserLookup();

    const response = await request(app).get('/api/v1/auth/me').set('Cookie', borrower.cookie);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(getAuthSetCookie(response)).toBeUndefined(); // the cookie is not cleared
  });

  it('protects module routes the same way (503, not 401)', async () => {
    failNextUserLookup();

    const response = await request(app)
      .get('/api/v1/borrower/progress')
      .set('Cookie', borrower.cookie);

    expect(response.status).toBe(503);
    expect(getAuthSetCookie(response)).toBeUndefined();
  });

  it('works again with the same cookie once the database is back', async () => {
    failNextUserLookup();
    await request(app).get('/api/v1/auth/me').set('Cookie', borrower.cookie);

    const response = await request(app).get('/api/v1/auth/me').set('Cookie', borrower.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(borrower.id);
  });

  it('still answers 401 and clears the cookie for an invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE_NAME}=not-a-real-token`);

    expect(response.status).toBe(401);
    expect(getAuthSetCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
