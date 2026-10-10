import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestUser, type TestUser } from '../helpers/auth.js';
import { saveEligibleProfile } from '../helpers/borrower.js';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database.js';

// Audit findings B-06/C-09, C-07 and C-05: malformed requests are the client's fault and must
// get a 4xx with the usual envelope, never a 500.

const LOGIN_URL = '/api/v1/auth/login';
const LOGIN_BODY = JSON.stringify({ email: 'nobody@test.dev', password: 'whatever1' });

function expectClientError(response: request.Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ success: false, error: { code, message: expect.any(String) } });
}

describe('malformed requests get 4xx, not 500', () => {
  const app = createApp();
  let admin: TestUser;
  let borrower: TestUser;

  beforeAll(async () => {
    await startTestDatabase();
    admin = await createTestUser('ADMIN');
    borrower = await createTestUser('BORROWER');
    await saveEligibleProfile(app, borrower.cookie);
  });
  afterAll(stopTestDatabase);

  describe('bad encoding', () => {
    it('rejects a badly %-encoded path parameter with 400', async () => {
      const response = await request(app).get('/api/v1/loans/%E0%A4%A');
      expectClientError(response, 400, 'BAD_REQUEST');
    });

    it('rejects an unsupported JSON charset with 415', async () => {
      const response = await request(app)
        .post(LOGIN_URL)
        .set('Content-Type', 'application/json; charset=latin1')
        .send(LOGIN_BODY);
      expectClientError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('rejects an unsupported Content-Encoding with 415', async () => {
      const response = await request(app)
        .post(LOGIN_URL)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'compress')
        .send(LOGIN_BODY);
      expectClientError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('rejects a body that claims gzip but is not gzip with 400', async () => {
      const response = await request(app)
        .post(LOGIN_URL)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip')
        .send('this is not gzip');
      expectClientError(response, 400, 'BAD_REQUEST');
    });
  });

  describe('broken multipart uploads', () => {
    const SLIP_URL = '/api/v1/borrower/salary-slip';

    it('rejects multipart without a boundary with 400', async () => {
      const response = await request(app)
        .post(SLIP_URL)
        .set('Cookie', borrower.cookie)
        .set('Content-Type', 'multipart/form-data')
        .send('--x\r\ncontent-disposition: form-data; name="file"\r\n\r\nabc\r\n--x--');
      expectClientError(response, 400, 'INVALID_UPLOAD');
    });

    it('rejects a truncated multipart body with 400', async () => {
      const response = await request(app)
        .post(SLIP_URL)
        .set('Cookie', borrower.cookie)
        .set('Content-Type', 'multipart/form-data; boundary=x')
        .send(
          '--x\r\ncontent-disposition: form-data; name="file"; filename="a.pdf"\r\n' +
            'content-type: application/pdf\r\n\r\n%PDF-1.4 cut off here',
        );
      expectClientError(response, 400, 'INVALID_UPLOAD');
    });
  });

  describe('null character in the staff search', () => {
    it('rejects it with 400 instead of a database error', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users?search=a%00b')
        .set('Cookie', admin.cookie);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('still searches normally', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users?search=admin')
        .set('Cookie', admin.cookie);
      expect(response.status).toBe(200);
    });
  });
});
