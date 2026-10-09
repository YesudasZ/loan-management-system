import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

const ALLOWED_ORIGIN = 'http://localhost:3000';

describe('app-wide behaviour', () => {
  const app = createApp();

  it('answers unknown routes with the 404 error envelope', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects bodies over 100 kb with 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(110 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects state-changing requests from a foreign origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVALID_ORIGIN');
  });

  it('accepts state-changing requests from the allowed origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .send({});

    expect(response.status).toBe(200);
  });

  it('marks every response as not cacheable', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sets security headers', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handler', () => {
  it('hides the details of unexpected errors', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('connection string mongodb://admin:hunter2@db leaked');
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again later.' },
    });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });
});
