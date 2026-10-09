import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestUser } from '../helpers/auth.js';
import {
  countStoredSlipFiles,
  LOAN_REQUEST,
  SAMPLE_FILES,
  saveEligibleProfile,
} from '../helpers/borrower.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/test-database.js';

const SLIP_URL = '/api/v1/borrower/salary-slip';

describe('salary slip upload', () => {
  const app = createApp();

  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  async function eligibleBorrower(email?: string) {
    const borrower = await createTestUser('BORROWER', email);
    await saveEligibleProfile(app, borrower.cookie);
    return borrower;
  }

  function upload(cookie: string, file: Buffer, filename: string, contentType: string) {
    return request(app)
      .post(SLIP_URL)
      .set('Cookie', cookie)
      .attach('file', file, { filename, contentType });
  }

  it.each([
    ['PDF', SAMPLE_FILES.pdf, 'March slip.PDF', 'application/pdf'],
    ['PNG', SAMPLE_FILES.png, 'slip.png', 'image/png'],
    ['JPG', SAMPLE_FILES.jpg, 'slip.jpeg', 'image/jpeg'],
  ])('accepts a real %s and stores it in GridFS', async (_type, file, filename, contentType) => {
    const borrower = await eligibleBorrower();

    const response = await upload(borrower.cookie, file, filename, contentType);

    expect(response.status).toBe(201);
    expect(response.body.data.salarySlip).toEqual({
      contentType,
      sizeBytes: file.length,
      uploadedAt: expect.any(String),
    });
    expect(await countStoredSlipFiles()).toBe(1);
  });

  it('lets the owner download the slip with safe headers', async () => {
    const borrower = await eligibleBorrower();
    await upload(borrower.cookie, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');

    const response = await request(app)
      .get(SLIP_URL)
      .set('Cookie', borrower.cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe('inline; filename="salary-slip.pdf"');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-security-policy']).toContain("object-src 'self'");
    expect(Buffer.compare(response.body as Buffer, SAMPLE_FILES.pdf)).toBe(0);
  });

  it("never serves another borrower's slip", async () => {
    const owner = await eligibleBorrower('owner@test.dev');
    await upload(owner.cookie, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');
    const other = await eligibleBorrower('other@test.dev');

    const response = await request(app).get(SLIP_URL).set('Cookie', other.cookie);

    expect(response.status).toBe(404);
  });

  it.each([
    ['an HTML file renamed to .pdf', SAMPLE_FILES.text, 'slip.pdf', 'application/pdf'],
    ['a PNG renamed to .pdf', SAMPLE_FILES.png, 'slip.pdf', 'application/pdf'],
    ['a PDF declared as an image', SAMPLE_FILES.pdf, 'slip.pdf', 'image/png'],
    ['a disallowed extension', SAMPLE_FILES.pdf, 'slip.exe', 'application/pdf'],
  ])('rejects %s with 415', async (_case, file, filename, contentType) => {
    const borrower = await eligibleBorrower();

    const response = await upload(borrower.cookie, file, filename, contentType);

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await countStoredSlipFiles()).toBe(0);
  });

  it('rejects files over 5 MB with 413', async () => {
    const borrower = await eligibleBorrower();

    const response = await upload(
      borrower.cookie,
      SAMPLE_FILES.oversizedPdf,
      'slip.pdf',
      'application/pdf',
    );

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a request without a file, or with extra fields', async () => {
    const borrower = await eligibleBorrower();

    const noFile = await request(app).post(SLIP_URL).set('Cookie', borrower.cookie);
    const extraField = await request(app)
      .post(SLIP_URL)
      .set('Cookie', borrower.cookie)
      .field('note', 'hello')
      .attach('file', SAMPLE_FILES.pdf, { filename: 'slip.pdf', contentType: 'application/pdf' });

    expect(noFile.status).toBe(400);
    expect(noFile.body.error.code).toBe('FILE_REQUIRED');
    expect(extraField.status).toBe(400);
    expect(extraField.body.error.code).toBe('INVALID_UPLOAD');
  });

  it('requires an eligible profile first', async () => {
    const borrower = await createTestUser('BORROWER');

    const response = await upload(borrower.cookie, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('replaces the previous slip and deletes the old file', async () => {
    const borrower = await eligibleBorrower();
    await upload(borrower.cookie, SAMPLE_FILES.pdf, 'first.pdf', 'application/pdf');

    const response = await upload(borrower.cookie, SAMPLE_FILES.png, 'second.png', 'image/png');

    expect(response.status).toBe(201);
    expect(response.body.data.salarySlip.contentType).toBe('image/png');
    expect(await countStoredSlipFiles()).toBe(1);
  });

  it('locks the slip while a loan is active', async () => {
    const borrower = await eligibleBorrower();
    await upload(borrower.cookie, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');
    await request(app)
      .post('/api/v1/borrower/loans')
      .set('Cookie', borrower.cookie)
      .send(LOAN_REQUEST);

    const response = await upload(borrower.cookie, SAMPLE_FILES.png, 'new.png', 'image/png');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ACTIVE_LOAN_EXISTS');
  });

  it('returns 403 for staff and 401 without a session', async () => {
    const admin = await createTestUser('ADMIN');

    const asAdmin = await upload(admin.cookie, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');
    const anonymous = await request(app).get(SLIP_URL);

    expect(asAdmin.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});
