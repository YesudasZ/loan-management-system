import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MAX_UPLOAD_BYTES } from '../../src/config/constants.js';

/** Smallest byte sequences that file-type recognises for each allowed format. */
export const SAMPLE_FILES = {
  pdf: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n'),
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
  jpg: Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0'),
    Buffer.alloc(64),
  ]),
  text: Buffer.from('<html><script>alert(1)</script></html>'),
  oversizedPdf: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_UPLOAD_BYTES)]),
};

export const ELIGIBLE_PROFILE = {
  fullName: 'Riya Sharma',
  pan: 'ABCDE1234F',
  dateOfBirth: '1995-06-15',
  monthlySalary: 5_000_000,
  employmentMode: 'SALARIED',
};

export const LOAN_REQUEST = { principal: 10_000_000, tenureDays: 90 };

export async function saveEligibleProfile(app: Express, cookie: string): Promise<void> {
  const response = await request(app)
    .put('/api/v1/borrower/profile')
    .set('Cookie', cookie)
    .send(ELIGIBLE_PROFILE);
  if (response.status !== 200) throw new Error(`Profile setup failed: ${response.status}`);
}

export async function uploadPdfSlip(app: Express, cookie: string): Promise<void> {
  const response = await request(app)
    .post('/api/v1/borrower/salary-slip')
    .set('Cookie', cookie)
    .attach('file', SAMPLE_FILES.pdf, { filename: 'slip.pdf', contentType: 'application/pdf' });
  if (response.status !== 201) throw new Error(`Slip setup failed: ${response.status}`);
}

/** Profile + slip, so the borrower is ready to apply. */
export async function prepareBorrowerToApply(app: Express, cookie: string): Promise<void> {
  await saveEligibleProfile(app, cookie);
  await uploadPdfSlip(app, cookie);
}

export async function countStoredSlipFiles(): Promise<number> {
  return (await mongoose.connection.db?.collection('salary_slips.files').countDocuments()) ?? 0;
}
