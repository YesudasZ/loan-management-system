import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../../src/config/constants.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { requireRole } from '../../src/middleware/require-role.js';
import { createTestUser, type TestUser } from '../helpers/auth.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

// A test-only app, so requireRole is tested before any real staff routes exist.
function createProtectedApp(): Express {
  const app = express();
  app.use(cookieParser());
  app.get('/sanction-module', authenticate, requireRole('SANCTION', 'ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/borrower-portal', authenticate, requireRole('BORROWER'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('requireRole', () => {
  const app = createProtectedApp();
  const users = new Map<Role, TestUser>();

  beforeAll(async () => {
    await startTestDatabase();
    for (const role of ['ADMIN', 'SANCTION', 'SALES', 'BORROWER'] as const) {
      users.set(role, await createTestUser(role));
    }
  });
  afterAll(stopTestDatabase);

  function cookieFor(role: Role): string {
    const user = users.get(role);
    if (!user) throw new Error(`No test user for ${role}`);
    return user.cookie;
  }

  it('returns 401 when not logged in', async () => {
    const response = await request(app).get('/sanction-module');
    expect(response.status).toBe(401);
  });

  it.each(['SANCTION', 'ADMIN'] as const)('lets a listed role through (%s)', async (role) => {
    const response = await request(app).get('/sanction-module').set('Cookie', cookieFor(role));
    expect(response.status).toBe(200);
  });

  it.each(['SALES', 'BORROWER'] as const)('returns 403 for an unlisted role (%s)', async (role) => {
    const response = await request(app).get('/sanction-module').set('Cookie', cookieFor(role));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('gives ADMIN no implicit access to borrower-only routes', async () => {
    const response = await request(app).get('/borrower-portal').set('Cookie', cookieFor('ADMIN'));
    expect(response.status).toBe(403);
  });

  it('lets a borrower into borrower-only routes', async () => {
    const response = await request(app)
      .get('/borrower-portal')
      .set('Cookie', cookieFor('BORROWER'));
    expect(response.status).toBe(200);
  });
});
