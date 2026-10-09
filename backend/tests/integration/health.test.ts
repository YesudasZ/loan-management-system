import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectFromDatabase } from '../../src/config/db.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

describe('GET /health', () => {
  const app = createApp();

  beforeAll(startTestDatabase);
  afterAll(stopTestDatabase);

  it('returns 200 when the database answers', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok', database: 'connected' },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    await disconnectFromDatabase();

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });
});
